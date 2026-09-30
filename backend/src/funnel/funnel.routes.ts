/**
 * /api/v1/funnel — crawl before signup (Track E1, D3).
 *
 *   POST /site          PUBLIC  { website, token? } → { token, status, card, … }
 *   GET  /site/:token   PUBLIC  poll a preview
 *   POST /claim         JWT     { token } → attach the preview to the signed-in tenant
 *   POST /access-request PUBLIC the closed-beta Request access form → a lead
 *                               (Idempotency-Key honoured: store-and-replay)
 *
 * The three public routes belong on the public list in
 * deploy/vani-main-vps/api.vikuna.io.conf's header.
 *
 * The visitor's IP comes from X-Real-IP, which nginx sets from the actual
 * connection and overwrites on every request; the API is reachable only
 * through nginx. Outside that (local dev) the socket address is used.
 */
import { Router, type Request, type Response } from 'express';
import type { Pool } from 'pg';
import { verifyAccessToken } from '../auth/token.service';
import { FunnelError } from './funnel.config';
import { claimSite, requestAccess, siteStatus, submitSite } from './funnel.service';

function clientIp(req: Request): string {
  const real = req.headers['x-real-ip'];
  return (typeof real === 'string' && real.trim()) || req.socket.remoteAddress || 'unknown';
}

function fail(res: Response, scope: string, err: unknown): void {
  if (err instanceof FunnelError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message.replace(/^[A-Z_]+: /, '') } });
    return;
  }
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[Funnel:${scope}]`, msg);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'The website preview failed — please try again.' } });
}

export function createFunnelRouter(pool: Pool): Router {
  const router = Router();

  router.post('/site', async (req: Request, res: Response) => {
    try {
      const website = String(req.body?.website ?? '');
      const token = typeof req.body?.token === 'string' ? req.body.token : null;
      res.json(await submitSite(pool, { website, ip: clientIp(req), token }));
    } catch (err) { fail(res, 'site', err); }
  });

  router.get('/site/:token', async (req: Request, res: Response) => {
    try {
      res.json(await siteStatus(pool, String(req.params.token)));
    } catch (err) { fail(res, 'status', err); }
  });

  router.post('/claim', async (req: Request, res: Response) => {
    const auth = req.headers.authorization;
    let tenantId: string;
    try {
      if (!auth?.startsWith('Bearer ')) throw new Error('missing');
      tenantId = verifyAccessToken(auth.slice(7)).tenant_id;
    } catch {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Sign in to keep this preview' } });
      return;
    }
    try {
      res.json(await claimSite(pool, tenantId, String(req.body?.token ?? '')));
    } catch (err) { fail(res, 'claim', err); }
  });

  router.post('/access-request', async (req: Request, res: Response) => {
    try {
      const key = req.headers['idempotency-key'];
      const b = req.body ?? {};
      res.json(await requestAccess(pool, {
        name: b.name, email: b.email, role_title: b.role_title, company: b.company,
        country_code: b.country_code, mobile: b.mobile, token: b.token, consent_text: b.consent_text,
        ip: clientIp(req), idempotencyKey: typeof key === 'string' && key.trim() ? key.trim().slice(0, 200) : null,
      }));
    } catch (err) { fail(res, 'access', err); }
  });

  return router;
}
