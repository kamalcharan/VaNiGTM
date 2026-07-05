/**
 * Storyteller REST routes — mounted at /api/v1/storyteller (at Stage 6)
 *
 *   POST  /build            → build a deck from the tenant's profile + KG
 *   GET   /:id              → fetch a deck (tenant-scoped)
 *   PATCH /:id/approve      → approve a deck, mint share_token
 *   POST  /:id/qa           → ask a grounded question about a deck
 *   GET   /share/:token     → PUBLIC: fetch an approved deck by share token
 *
 * Auth: every route except /share/:token requires a valid JWT; tenant_id is
 * read from the token, never from the body. Mirrors vani.routes.ts.
 *
 * SKELETON — Stage 3. Handlers delegate to StorytellerAgent (stubs that throw).
 * Not mounted in server.ts yet.
 */

import { Router, type Request, type Response } from 'express';
import type { Pool } from 'pg';
import { verifyAccessToken, type JwtPayload } from '../../auth/token.service';
import { createTenantDb } from '../../db';
import { StorytellerAgent } from './storyteller.agent';

/* ── Auth guard (same pattern as vani.routes.ts) ────────────────────────── */

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

export function createStorytellerRouter(pool: Pool): Router {
  const router = Router();

  // ── POST /build ──────────────────────────────────────────────────────────
  router.post('/build', async (req: Request, res: Response) => {
    const jwt = requireAuth(req, res);
    if (!jwt) return;

    try {
      const { presentationId } = await StorytellerAgent.buildDeck(pool, jwt.tenant_id);
      res.json({ presentationId });
    } catch (err) {
      const msg = messageOf(err);
      if (msg.startsWith('LLM_VALIDATION_FAILED')) {
        res.status(422).json({
          error: { code: 'DECK_GENERATION_FAILED', message: 'Model did not return a valid deck. Try again.' },
        });
        return;
      }
      if (msg.startsWith('PROFILE_NOT_FOUND')) {
        res.status(400).json({
          error: { code: 'NO_PROFILE', message: 'Build a tenant profile first.' },
        });
        return;
      }
      console.error('[Storyteller:/build]', msg);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: msg } });
    }
  });

  // ── GET /:id ─────────────────────────────────────────────────────────────
  router.get('/:id', async (req: Request, res: Response) => {
    const jwt = requireAuth(req, res);
    if (!jwt) return;

    try {
      const id = String(req.params.id);
      const db = createTenantDb(pool, jwt.tenant_id);
      // RLS context is set; the explicit tenant_id filter is the required
      // second layer (CLAUDE.md: every query filters by tenant_id).
      const result = await db.query<{
        id: string;
        title: string | null;
        slides: unknown;
        status: string;
        share_token: string | null;
        created_at: Date;
      }>(
        `SELECT id, title, slides, status, share_token, created_at
           FROM gt_presentations
          WHERE id = $id AND tenant_id = $tenant_id`,
        { id, tenant_id: jwt.tenant_id },
      );

      const deck = result.rows[0];
      if (!deck) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Deck not found' } });
        return;
      }
      res.json(deck);
    } catch (err) {
      console.error('[Storyteller:/:id]', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: messageOf(err) } });
    }
  });

  // ── PATCH /:id/approve ───────────────────────────────────────────────────
  router.patch('/:id/approve', async (req: Request, res: Response) => {
    const jwt = requireAuth(req, res);
    if (!jwt) return;

    try {
      const id = String(req.params.id);
      const result = await StorytellerAgent.approveDeck(pool, jwt.tenant_id, id);
      res.json(result);
    } catch (err) {
      const msg = messageOf(err);
      if (msg.startsWith('DECK_NOT_APPROVABLE')) {
        res.status(409).json({ error: { code: 'DECK_NOT_APPROVABLE', message: msg } });
        return;
      }
      console.error('[Storyteller:/:id/approve]', msg);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: msg } });
    }
  });

  // ── POST /:id/qa ─────────────────────────────────────────────────────────
  router.post('/:id/qa', async (req: Request, res: Response) => {
    const jwt = requireAuth(req, res);
    if (!jwt) return;

    const { question } = (req.body ?? {}) as { question?: string };
    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'question is required' } });
      return;
    }

    try {
      const id = String(req.params.id);
      const result = await StorytellerAgent.answerQuestion(pool, jwt.tenant_id, id, question);
      res.json(result);
    } catch (err) {
      console.error('[Storyteller:/:id/qa]', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: messageOf(err) } });
    }
  });

  // ── GET /share/:token  (PUBLIC — no JWT) ─────────────────────────────────
  router.get('/share/:token', async (req: Request, res: Response) => {
    try {
      const token = String(req.params.token);
      console.log('[share] token=%j len=%d', token, token.length);
      const dbg = await pool.query(
        `SELECT current_database() AS db,
                count(*) FILTER (WHERE status='approved') AS approved,
                (SELECT share_token FROM gt_presentations ORDER BY created_at DESC LIMIT 1) AS latest
         FROM gt_presentations`
      );
      console.log('[share] db=%s approved=%s latest=%j', dbg.rows[0].db, dbg.rows[0].approved, dbg.rows[0].latest);
      const who = await pool.query(
        `SELECT inet_server_addr() AS host, inet_server_port() AS port, current_user AS usr`
      );
      console.log('[share] host=%s port=%s user=%s', who.rows[0].host, who.rows[0].port, who.rows[0].usr);
      // Raw pool, NO tenant context — intentionally cross-tenant, scoped by the
      // unguessable share_token AND status='approved'. Returns ONLY the public
      // fields; never id, tenant_id, status, or share_token.
      const result = await pool.query<{ title: string | null; slides: unknown }>(
        `SELECT title, slides
           FROM gt_presentations
          WHERE share_token = $1 AND status = 'approved'`,
        [token],
      );
      console.log('[share] rows=%d', result.rows.length);

      const deck = result.rows[0];
      if (!deck) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Presentation not found' } });
        return;
      }
      res.json({ title: deck.title, slides: deck.slides });
    } catch (err) {
      console.error('[Storyteller:/share/:token]', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: messageOf(err) } });
    }
  });

  return router;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
