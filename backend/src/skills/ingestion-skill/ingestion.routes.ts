/**
 * Ingestion routes — mounted at /api/v1/ingest.
 *
 *   GET    /connect/gdrive            start OAuth (JWT required)
 *   GET    /connect/gdrive/callback   OAuth callback (no JWT — Google redirects here)
 *   PATCH  /connect/gdrive/folder     set folder_id after OAuth (JWT)
 *   POST   /sync                      trigger folder sync (JWT)
 *   GET    /sources                   paginated source list (JWT)
 *   GET    /sources/:id               single source + run status (JWT)
 *   DELETE /sources/:id               remove a source row; nodes stay (JWT)
 *
 * JWT is read via verifyAccessToken — tenant_id comes from the token,
 * never from the request body or path.
 */

import { Router, type Request, type Response } from 'express';
import { readFileSync } from 'fs';
import path from 'path';
import type { Pool } from 'pg';
import { verifyAccessToken, type JwtPayload } from '../../auth/token.service';
import { createTenantDb } from '../../db';
import { emitEvent } from '../../agent-core/event.store';
import { IngestionAgent } from './ingestion.agent';

/* ── Load SQL files once at module init ─────────────────────────────────── */

const SQL_GET_SOURCES = readFileSync(
  path.join(__dirname, 'queries', 'get-sources.sql'),
  'utf-8',
);
const SQL_GET_SOURCE = readFileSync(
  path.join(__dirname, 'queries', 'get-source.sql'),
  'utf-8',
);

/* ── Auth guard (copied verbatim from vani.routes.ts) ───────────────────── */

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

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/* ── Router ─────────────────────────────────────────────────────────────── */

export function createIngestionRouter(pool: Pool): Router {
  const router = Router();

  // ── GET /connect/gdrive ────────────────────────────────────────────────
  // Builds the Google OAuth consent URL and redirects the browser to it.
  // tenant_id is passed via the `state` parameter so the callback can
  // re-associate the token with the right tenant (the callback has no JWT).
  router.get('/connect/gdrive', (req: Request, res: Response) => {
    const jwt = requireAuth(req, res);
    if (!jwt) return;

    const clientId    = process.env.GDRIVE_CLIENT_ID;
    const redirectUri = process.env.GDRIVE_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      res.status(500).json({
        error: {
          code: 'GDRIVE_OAUTH_NOT_CONFIGURED',
          message: 'GDRIVE_CLIENT_ID and GDRIVE_REDIRECT_URI must be set',
        },
      });
      return;
    }

    const params = new URLSearchParams({
      client_id:     clientId,
      redirect_uri:  redirectUri,
      response_type: 'code',
      scope:         'https://www.googleapis.com/auth/drive.readonly',
      access_type:   'offline',
      prompt:        'consent',
      state:         jwt.tenant_id,
    });

    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  // ── GET /connect/gdrive/callback ───────────────────────────────────────
  // Google redirects here with ?code=…&state=tenant_id. No JWT — anyone
  // arriving here is post-OAuth. We rely on `state` to identify the tenant
  // and on Google to have authenticated them.
  router.get('/connect/gdrive/callback', async (req: Request, res: Response) => {
    try {
      const code  = typeof req.query.code  === 'string' ? req.query.code  : null;
      const state = typeof req.query.state === 'string' ? req.query.state : null;
      const error = typeof req.query.error === 'string' ? req.query.error : null;

      if (error) {
        res.status(400).json({
          error: { code: 'GDRIVE_OAUTH_DENIED', message: `Google returned: ${error}` },
        });
        return;
      }

      if (!code || !state) {
        res.status(400).json({
          error: { code: 'MISSING_FIELDS', message: 'code and state are required' },
        });
        return;
      }

      const tenantId = state; // tenant_id was passed via state in the auth URL

      const clientId     = process.env.GDRIVE_CLIENT_ID;
      const clientSecret = process.env.GDRIVE_CLIENT_SECRET;
      const redirectUri  = process.env.GDRIVE_REDIRECT_URI;
      if (!clientId || !clientSecret || !redirectUri) {
        res.status(500).json({
          error: {
            code: 'GDRIVE_OAUTH_NOT_CONFIGURED',
            message: 'GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REDIRECT_URI must be set',
          },
        });
        return;
      }

      // Exchange the auth code for access + refresh tokens.
      const tokenBody = new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
      });

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    tokenBody,
        signal:  AbortSignal.timeout(20_000),
      });

      if (!tokenResponse.ok) {
        const detail = await tokenResponse.text().catch(() => '');
        res.status(502).json({
          error: {
            code: 'GDRIVE_TOKEN_EXCHANGE_FAILED',
            message: `${tokenResponse.status} ${tokenResponse.statusText} — ${detail.slice(0, 200)}`,
          },
        });
        return;
      }

      const token = await tokenResponse.json() as {
        access_token:  string;
        refresh_token?: string;
        expires_in?:    number;
        scope?:         string;
      };

      const expiresAt = new Date(Date.now() + (token.expires_in ?? 3600) * 1000);

      // Upsert credentials (folder_id stays null — PATCH /connect/gdrive/folder
      // completes setup once the tenant picks a folder).
      const db = createTenantDb(pool, tenantId);
      await db.query(
        `INSERT INTO gt_tenant_integrations
            (tenant_id, provider, access_token, refresh_token, expires_at, scope)
         VALUES
            ($tenant_id, 'gdrive', $access_token, $refresh_token, $expires_at, $scope)
         ON CONFLICT (tenant_id, provider) DO UPDATE
            SET access_token  = EXCLUDED.access_token,
                refresh_token = COALESCE(EXCLUDED.refresh_token, gt_tenant_integrations.refresh_token),
                expires_at    = EXCLUDED.expires_at,
                scope         = EXCLUDED.scope,
                updated_at    = now()`,
        {
          tenant_id:     tenantId,
          access_token:  token.access_token,
          refresh_token: token.refresh_token ?? null,
          expires_at:    expiresAt,
          scope:         token.scope ?? null,
        },
      );

      // FOLDER_CONNECTED wakes the IngestionAgent.syncFolder handler.
      // syncFolder will no-op (or throw GDRIVE_FOLDER_NOT_CONFIGURED) until
      // the tenant picks a folder via PATCH /connect/gdrive/folder — that's
      // expected and recoverable.
      await emitEvent(pool, tenantId, 'FOLDER_CONNECTED', 'system', {
        source: 'oauth_callback',
      });

      res.json({
        success: true,
        message: 'Google Drive connected. Pick a folder via PATCH /api/v1/ingest/connect/gdrive/folder.',
      });
    } catch (err) {
      console.error('[Ingest:/connect/gdrive/callback]', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: messageOf(err) } });
    }
  });

  // ── PATCH /connect/gdrive/folder ───────────────────────────────────────
  // Tenant picks the Drive folder to sync from. Body: { folder_id, folder_name }.
  router.patch('/connect/gdrive/folder', async (req: Request, res: Response) => {
    const jwt = requireAuth(req, res);
    if (!jwt) return;

    try {
      const folderId   = typeof req.body?.folder_id   === 'string' ? req.body.folder_id.trim()   : '';
      const folderName = typeof req.body?.folder_name === 'string' ? req.body.folder_name.trim() : '';

      if (folderId.length === 0) {
        res.status(400).json({
          error: { code: 'MISSING_FIELDS', message: 'folder_id is required' },
        });
        return;
      }

      const db = createTenantDb(pool, jwt.tenant_id);
      const result = await db.query<{ id: string }>(
        `UPDATE gt_tenant_integrations
            SET folder_id   = $folder_id,
                folder_name = $folder_name,
                updated_at  = now()
          WHERE tenant_id = $tenant_id AND provider = 'gdrive'
          RETURNING id`,
        {
          tenant_id:   jwt.tenant_id,
          folder_id:   folderId,
          folder_name: folderName.length > 0 ? folderName : null,
        },
      );

      if (result.rows.length === 0) {
        res.status(400).json({
          error: { code: 'GDRIVE_NOT_CONNECTED', message: 'Connect Google Drive first via GET /connect/gdrive' },
        });
        return;
      }

      res.json({ success: true });
    } catch (err) {
      console.error('[Ingest:/connect/gdrive/folder]', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: messageOf(err) } });
    }
  });

  // ── POST /sync ─────────────────────────────────────────────────────────
  router.post('/sync', async (req: Request, res: Response) => {
    const jwt = requireAuth(req, res);
    if (!jwt) return;

    try {
      const db = createTenantDb(pool, jwt.tenant_id);
      const integ = await db.query<{ folder_id: string | null }>(
        `SELECT folder_id
           FROM gt_tenant_integrations
          WHERE tenant_id = $tenant_id AND provider = 'gdrive'`,
        { tenant_id: jwt.tenant_id },
      );

      if (integ.rows.length === 0) {
        res.status(400).json({
          error: { code: 'GDRIVE_NOT_CONNECTED', message: 'Connect Google Drive first via GET /connect/gdrive' },
        });
        return;
      }
      if (!integ.rows[0].folder_id) {
        res.status(400).json({
          error: {
            code: 'GDRIVE_FOLDER_NOT_SET',
            message: 'Pick a folder via PATCH /connect/gdrive/folder',
          },
        });
        return;
      }

      const result = await IngestionAgent.syncFolder(pool, jwt.tenant_id);
      res.json(result);
    } catch (err) {
      console.error('[Ingest:/sync]', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: messageOf(err) } });
    }
  });

  // ── GET /sources ───────────────────────────────────────────────────────
  router.get('/sources', async (req: Request, res: Response) => {
    const jwt = requireAuth(req, res);
    if (!jwt) return;

    try {
      const limit  = Math.min(parseIntOrDefault(req.query.limit,  20), 100);
      const offset = Math.max(parseIntOrDefault(req.query.offset, 0), 0);

      const db = createTenantDb(pool, jwt.tenant_id);
      const result = await db.query(SQL_GET_SOURCES, {
        tenant_id: jwt.tenant_id,
        limit,
        offset,
      });

      res.json({ sources: result.rows, total: result.rows.length });
    } catch (err) {
      console.error('[Ingest:/sources]', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: messageOf(err) } });
    }
  });

  // ── GET /sources/:id ───────────────────────────────────────────────────
  router.get('/sources/:id', async (req: Request, res: Response) => {
    const jwt = requireAuth(req, res);
    if (!jwt) return;

    try {
      const db = createTenantDb(pool, jwt.tenant_id);
      const result = await db.query(SQL_GET_SOURCE, {
        source_id: req.params.id,
        tenant_id: jwt.tenant_id,
      });

      if (result.rows.length === 0) {
        res.status(404).json({
          error: { code: 'SOURCE_NOT_FOUND', message: 'No source with that id for this tenant' },
        });
        return;
      }

      res.json({ source: result.rows[0] });
    } catch (err) {
      console.error('[Ingest:/sources/:id]', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: messageOf(err) } });
    }
  });

  // ── DELETE /sources/:id ────────────────────────────────────────────────
  // Removes the source row only — gt_kg_nodes survives. Nodes may have been
  // edited or confirmed by the tenant; knowledge outlives the source.
  router.delete('/sources/:id', async (req: Request, res: Response) => {
    const jwt = requireAuth(req, res);
    if (!jwt) return;

    try {
      const db = createTenantDb(pool, jwt.tenant_id);
      const existing = await db.query<{ id: string }>(
        `SELECT id FROM gt_kb_sources
          WHERE id = $source_id AND tenant_id = $tenant_id`,
        { source_id: req.params.id, tenant_id: jwt.tenant_id },
      );

      if (existing.rows.length === 0) {
        res.status(404).json({
          error: { code: 'SOURCE_NOT_FOUND', message: 'No source with that id for this tenant' },
        });
        return;
      }

      await db.query(
        `DELETE FROM gt_kb_sources
          WHERE id = $source_id AND tenant_id = $tenant_id`,
        { source_id: req.params.id, tenant_id: jwt.tenant_id },
      );

      res.json({ deleted: true });
    } catch (err) {
      console.error('[Ingest:DELETE /sources/:id]', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: messageOf(err) } });
    }
  });

  return router;
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function parseIntOrDefault(value: unknown, fallback: number): number {
  if (typeof value !== 'string') return fallback;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}
