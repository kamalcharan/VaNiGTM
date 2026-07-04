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
      const result = await StorytellerAgent.buildDeck(pool, jwt.tenant_id);
      res.json(result);
    } catch (err) {
      console.error('[Storyteller:/build]', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: messageOf(err) } });
    }
  });

  // ── GET /:id ─────────────────────────────────────────────────────────────
  router.get('/:id', async (req: Request, res: Response) => {
    const jwt = requireAuth(req, res);
    if (!jwt) return;

    // Stage 4: fetch the deck for jwt.tenant_id via createTenantDb.
    res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'GET /:id not implemented yet' } });
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
      console.error('[Storyteller:/:id/approve]', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: messageOf(err) } });
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
    // Stage 4: raw pool (no tenant context), scoped by share_token + approved.
    res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'GET /share/:token not implemented yet' } });
  });

  return router;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
