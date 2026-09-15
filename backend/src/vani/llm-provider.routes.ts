/**
 * Settings → Model provider, over HTTP.
 *
 * Five endpoints, all JWT-scoped. The key goes in and never comes back: no
 * response here contains a stored credential, only the hint from
 * llm-provider.service (see its header).
 *
 * tenant_id comes from the JWT and never from the body (CLAUDE.md), which
 * matters more than usual here — a tenant_id in the body would let any
 * authenticated caller read or overwrite another workspace's API key.
 */

import { Router } from 'express';
import type { Pool } from 'pg';
import { extractJwt } from '../auth/auth.routes';
import {
  getProviderSummary,
  saveProvider,
  deleteProvider,
  testProvider,
  providerCatalogue,
  ProviderError,
} from './llm-provider.service';
import { isConfigured } from '../agent-core/secret.crypto';

export function createLlmProviderRouter(pool: Pool): Router {
  const router = Router();

  /**
   * Map a thrown error onto its status. ProviderError carries its own;
   * anything else is ours, logged with a [Scope] prefix and returned without
   * the stack (CLAUDE.md error handling).
   */
  function fail(res: any, err: unknown, scope: string) {
    if (err instanceof ProviderError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[LlmProvider] ${scope}:`, message);

    // A missing TENANT_SECRET_KEY is an operator problem, not a tenant one,
    // and saying so is the difference between a five-minute fix and an
    // afternoon. It names the variable but never its value.
    if (message.startsWith('SECRET_KEY_NOT_CONFIGURED')) {
      res.status(503).json({
        error: {
          code: 'ENCRYPTION_NOT_CONFIGURED',
          message: 'Model provider keys cannot be stored: this deployment has no '
                 + 'TENANT_SECRET_KEY set. Contact your administrator.',
        },
      });
      return;
    }
    res.status(500).json({ error: { code: 'PROVIDER_ERROR', message } });
  }

  function requireJwt(req: any, res: any) {
    const jwt = extractJwt(req);
    if (!jwt) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } });
      return null;
    }
    return jwt;
  }

  /* ── GET /api/v1/llm-provider/catalogue ─────────────────────────────── */

  router.get('/catalogue', (req, res) => {
    try {
      const jwt = requireJwt(req, res);
      if (!jwt) return;
      // encryptionReady is surfaced so the form can say WHY saving is
      // unavailable, up front, instead of failing on submit.
      res.json({ providers: providerCatalogue(), encryptionReady: isConfigured() });
    } catch (err) {
      fail(res, err, 'catalogue');
    }
  });

  /* ── GET /api/v1/llm-provider ───────────────────────────────────────── */

  router.get('/', async (req, res) => {
    try {
      const jwt = requireJwt(req, res);
      if (!jwt) return;

      const provider = await getProviderSummary(pool, jwt.tenant_id);
      // null is the platform posture, not an error — every tenant starts here.
      res.json({ provider, posture: provider ? 'byok' : 'platform' });
    } catch (err) {
      fail(res, err, 'get');
    }
  });

  /* ── PUT /api/v1/llm-provider ───────────────────────────────────────── */

  router.put('/', async (req, res) => {
    try {
      const jwt = requireJwt(req, res);
      if (!jwt) return;

      const provider = await saveProvider(pool, jwt.tenant_id, {
        providerCode: String(req.body?.provider_code ?? ''),
        key:          typeof req.body?.key === 'string' ? req.body.key.trim() : undefined,
        model:        typeof req.body?.model === 'string' ? req.body.model.trim() : undefined,
        baseUrl:      typeof req.body?.base_url === 'string' ? req.body.base_url.trim() : undefined,
      });

      res.json({ provider, posture: 'byok' });
    } catch (err) {
      fail(res, err, 'save');
    }
  });

  /* ── POST /api/v1/llm-provider/test ─────────────────────────────────── */

  router.post('/test', async (req, res) => {
    try {
      const jwt = requireJwt(req, res);
      if (!jwt) return;

      const result = await testProvider(pool, jwt.tenant_id);
      // 200 even when the test fails: the REQUEST succeeded, and the result
      // is the answer. A 502 here would be indistinguishable from our own
      // endpoint being down, which is the opposite of what a test should say.
      res.json(result);
    } catch (err) {
      fail(res, err, 'test');
    }
  });

  /* ── DELETE /api/v1/llm-provider ────────────────────────────────────── */

  router.delete('/', async (req, res) => {
    try {
      const jwt = requireJwt(req, res);
      if (!jwt) return;

      await deleteProvider(pool, jwt.tenant_id);
      res.json({ provider: null, posture: 'platform' });
    } catch (err) {
      fail(res, err, 'delete');
    }
  });

  return router;
}
