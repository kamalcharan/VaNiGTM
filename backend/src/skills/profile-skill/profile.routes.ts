/**
 * profile-skill routes — mounted at /api/v1/profile.
 *
 *   GET  /          get current profile (JWT)
 *   PUT  /          upsert profile fields (JWT)
 *   POST /approve   approve profile, emit PROFILE_COMPLETE (JWT)
 *   GET  /history   paginated version history (JWT)
 *   GET  /clusters          market vocabulary (JWT)
 *   POST /clusters/approve  ratify the vocabulary (JWT)
 *   POST /brand/generate    draft the brand Brain object (JWT)
 *   GET  /brand              current brand draft/confirmed state (JWT)
 *   PUT  /brand               human edits to brand fields (JWT)
 *   POST /brand/approve       ratify the brand (JWT)
 *
 * Auth: every endpoint requires a valid JWT; tenant_id is read from the
 * token, never from the body.
 */

import { Router, type Request, type Response } from 'express';
import { readFileSync } from 'fs';
import path from 'path';
import type { Pool } from 'pg';
import { verifyAccessToken, type JwtPayload } from '../../auth/token.service';
import { createTenantDb } from '../../db';
import { emitEvent } from '../../agent-core/event.store';
import { createRun, setStatus } from '../../agent-core/agent.runner';
import {
  getProfile,
  upsertProfile,
  type TenantProfile,
} from './profile.service';
import { listClusters, approveClusters } from './cluster.service';
import {
  getBrand,
  generateBrand,
  upsertBrandFields,
  approveBrand,
  type TenantBrand,
} from './brand.service';

/* ── SQL files (loaded once at module init) ─────────────────────────────── */

const SQL_GET_HISTORY = readFileSync(
  path.join(__dirname, 'queries', 'get-history.sql'),
  'utf-8',
);

const SQL_APPROVE_PROFILE = `
  UPDATE gt_tenant_profile
     SET approved_at = NOW(),
         approved_by = $approved_by
   WHERE tenant_id = $tenant_id
   RETURNING *
`;

/* ── Editable fields (PUT body whitelist) ───────────────────────────────── */

const EDITABLE_FIELDS = [
  'product_name', 'product_tagline', 'product_category', 'product_description',
  'core_problem', 'key_differentiators', 'pricing_model', 'pricing_range',
  'icp_role', 'icp_company_type', 'icp_company_size', 'icp_industry',
  'icp_geography', 'primary_pain_points',
  'gtm_stage', 'active_channels', 'current_mrr', 'team_size',
  'vision_statement', 'target_market_size',
  'source',
] as const satisfies readonly (keyof TenantProfile)[];

const BRAND_EDITABLE_FIELDS = [
  'voice_tone', 'always_say', 'never_say', 'proof',
] as const satisfies readonly (keyof Pick<TenantBrand, 'voice_tone' | 'always_say' | 'never_say' | 'proof'>)[];

/* ── Required-for-approval fields ───────────────────────────────────────── */

const REQUIRED_FOR_APPROVAL = [
  'product_name',
  'product_description',
  'core_problem',
  'icp_role',
  'primary_pain_points',
] as const satisfies readonly (keyof TenantProfile)[];

/* ── Auth guard ─────────────────────────────────────────────────────────── */

function requireAuth(req: Request, res: Response): JwtPayload | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } });
    return null;
  }
  try {
    return verifyAccessToken(auth.slice(7));
  } catch {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } });
    return null;
  }
}

/* ── Router ─────────────────────────────────────────────────────────────── */

export function createProfileRouter(pool: Pool): Router {
  const router = Router();

  // ── GET / ────────────────────────────────────────────────────────────
  router.get('/', async (req: Request, res: Response) => {
    const jwt = requireAuth(req, res);
    if (!jwt) return;

    try {
      const profile = await getProfile(pool, jwt.tenant_id);
      if (!profile) {
        res.status(404).json({
          error: { code: 'PROFILE_NOT_FOUND', message: 'No profile exists yet for this tenant' },
        });
        return;
      }
      res.json({ profile });
    } catch (err) {
      console.error('[Profile:GET /]', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: messageOf(err) },
      });
    }
  });

  // ── PUT / ────────────────────────────────────────────────────────────
  router.put('/', async (req: Request, res: Response) => {
    const jwt = requireAuth(req, res);
    if (!jwt) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const fields: Partial<TenantProfile> = {};
    for (const key of EDITABLE_FIELDS) {
      if (key in body) {
        (fields as Record<string, unknown>)[key] = body[key];
      }
    }

    if (Object.keys(fields).length === 0) {
      res.status(400).json({
        error: { code: 'EMPTY_UPDATE', message: 'No fields provided' },
      });
      return;
    }

    try {
      const profile = await upsertProfile(
        pool,
        jwt.tenant_id,
        fields,
        jwt.user_id,
        'human edit',
      );
      res.json({ profile });
    } catch (err) {
      console.error('[Profile:PUT /]', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: messageOf(err) },
      });
    }
  });

  // ── POST /approve ────────────────────────────────────────────────────
  router.post('/approve', async (req: Request, res: Response) => {
    const jwt = requireAuth(req, res);
    if (!jwt) return;

    try {
      const profile = await getProfile(pool, jwt.tenant_id);
      if (!profile) {
        res.status(404).json({
          error: { code: 'PROFILE_NOT_FOUND', message: 'No profile exists yet for this tenant' },
        });
        return;
      }

      const missing = REQUIRED_FOR_APPROVAL.filter(
        (field) => !hasValueForApproval(profile[field]),
      );
      if (missing.length > 0) {
        res.status(400).json({
          error: {
            code: 'PROFILE_INCOMPLETE',
            message: 'Profile incomplete',
            missing,
          },
        });
        return;
      }

      const db = createTenantDb(pool, jwt.tenant_id);
      const result = await db.query<TenantProfile>(SQL_APPROVE_PROFILE, {
        tenant_id:   jwt.tenant_id,
        approved_by: jwt.user_id,
      });
      const updatedProfile = result.rows[0];

      await emitEvent(
        pool,
        jwt.tenant_id,
        'PROFILE_COMPLETE',
        'human',
        { approved_by: jwt.user_id },
        jwt.user_id,
      );

      res.json({ success: true, profile: updatedProfile });
    } catch (err) {
      console.error('[Profile:POST /approve]', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: messageOf(err) },
      });
    }
  });

  // ── GET /history ─────────────────────────────────────────────────────
  router.get('/history', async (req: Request, res: Response) => {
    const jwt = requireAuth(req, res);
    if (!jwt) return;

    try {
      const db = createTenantDb(pool, jwt.tenant_id);
      const result = await db.query(SQL_GET_HISTORY, { tenant_id: jwt.tenant_id });
      res.json({ history: result.rows });
    } catch (err) {
      console.error('[Profile:GET /history]', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: messageOf(err) },
      });
    }
  });

  // ── GET /clusters ────────────────────────────────────────────────────
  // The tenant's market vocabulary (gt_semantic_clusters, migration 192).
  // Powers the ICP card's vocabulary tags and, once approved, frames every
  // competitor-research query.
  router.get('/clusters', async (req: Request, res: Response) => {
    const jwt = requireAuth(req, res);
    if (!jwt) return;

    try {
      const clusters = await listClusters(pool, jwt.tenant_id);
      res.json({ clusters });
    } catch (err) {
      console.error('[Profile:GET /clusters]', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: messageOf(err) },
      });
    }
  });

  // ── POST /clusters/approve ───────────────────────────────────────────
  // Human gate on the vocabulary: `edits` carries renamed terms / curated
  // related_terms / changed types, `remove` deactivates rejected clusters,
  // and everything still active is stamped approved_at.
  router.post('/clusters/approve', async (req: Request, res: Response) => {
    const jwt = requireAuth(req, res);
    if (!jwt) return;

    const body = (req.body ?? {}) as { edits?: unknown; remove?: unknown };
    const edits = Array.isArray(body.edits)
      ? (body.edits as Array<{ id: string; primary_term?: string; related_terms?: string[]; cluster_type?: string }>)
          .filter((e) => e && typeof e.id === 'string')
      : [];
    const remove = Array.isArray(body.remove)
      ? body.remove.filter((x): x is string => typeof x === 'string')
      : [];

    try {
      const clusters = await approveClusters(pool, jwt.tenant_id, edits, remove);
      res.json({ success: true, clusters });
    } catch (err) {
      console.error('[Profile:POST /clusters/approve]', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: messageOf(err) },
      });
    }
  });

  // ── POST /brand/generate ─────────────────────────────────────────────
  // Drafts the brand Brain object from the profile + a fresh fetch of the
  // tenant's own site (never from the ingestion pipeline's stripped text —
  // see brand.service.ts). Triggered by the wizard on entering step 5, same
  // shape as competitors' step-entry auto-start.
  router.post('/brand/generate', async (req: Request, res: Response) => {
    const jwt = requireAuth(req, res);
    if (!jwt) return;

    // Every step from here on must be inside the try — an uncaught rejection
    // in an async Express handler has no default JSON error response, so a
    // failure in createRun/setStatus (before generateBrand's own try/catch
    // took over) surfaced to the client as a non-JSON body instead of a
    // structured error.
    let runId: string | undefined;
    try {
      runId = await createRun(pool, jwt.tenant_id, 'brand-skill.generate');
      await setStatus(pool, runId, 'running');
      const brand = await generateBrand(pool, jwt.tenant_id, runId);
      await setStatus(pool, runId, 'completed');
      res.json({ brand });
    } catch (err) {
      if (runId) {
        await setStatus(pool, runId, 'failed', { error_trace: messageOf(err) }).catch(() => {});
      }
      console.error('[Profile:POST /brand/generate]', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: messageOf(err) },
      });
    }
  });

  // ── GET /brand ────────────────────────────────────────────────────────
  router.get('/brand', async (req: Request, res: Response) => {
    const jwt = requireAuth(req, res);
    if (!jwt) return;

    try {
      const brand = await getBrand(pool, jwt.tenant_id);
      if (!brand) {
        res.status(404).json({
          error: { code: 'BRAND_NOT_FOUND', message: 'No brand draft exists yet for this tenant' },
        });
        return;
      }
      res.json({ brand });
    } catch (err) {
      console.error('[Profile:GET /brand]', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: messageOf(err) },
      });
    }
  });

  // ── PUT /brand ────────────────────────────────────────────────────────
  router.put('/brand', async (req: Request, res: Response) => {
    const jwt = requireAuth(req, res);
    if (!jwt) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const fields: Partial<Pick<TenantBrand, 'voice_tone' | 'always_say' | 'never_say' | 'proof'>> = {};
    for (const key of BRAND_EDITABLE_FIELDS) {
      if (key in body) {
        (fields as Record<string, unknown>)[key] = body[key];
      }
    }

    if (Object.keys(fields).length === 0) {
      res.status(400).json({
        error: { code: 'EMPTY_UPDATE', message: 'No fields provided' },
      });
      return;
    }

    try {
      const brand = await upsertBrandFields(pool, jwt.tenant_id, fields);
      res.json({ brand });
    } catch (err) {
      console.error('[Profile:PUT /brand]', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: messageOf(err) },
      });
    }
  });

  // ── POST /brand/approve ───────────────────────────────────────────────
  router.post('/brand/approve', async (req: Request, res: Response) => {
    const jwt = requireAuth(req, res);
    if (!jwt) return;

    try {
      const brand = await approveBrand(pool, jwt.tenant_id);
      res.json({ success: true, brand });
    } catch (err) {
      console.error('[Profile:POST /brand/approve]', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: messageOf(err) },
      });
    }
  });

  return router;
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function hasValueForApproval(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string')         return v.trim() !== '';
  if (Array.isArray(v))              return v.length > 0;
  return true;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
