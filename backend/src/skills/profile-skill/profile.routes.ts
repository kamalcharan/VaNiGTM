/**
 * profile-skill routes — mounted at /api/v1/profile.
 *
 *   GET  /          get current profile (JWT)
 *   PUT  /          upsert profile fields (JWT)
 *   POST /approve   approve profile, emit PROFILE_COMPLETE (JWT)
 *   GET  /history   paginated version history (JWT)
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
import {
  getProfile,
  upsertProfile,
  type TenantProfile,
} from './profile.service';

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
