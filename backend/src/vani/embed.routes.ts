/**
 * The embed channel — PLATFORM-owned, not any agent's.
 *
 * A tenant pastes ONE script tag. Every agent live for that workspace is
 * reachable through it: Vara answers candidates, Nova will answer whatever
 * Nova answers. This moved off `/vara/*` on 2026-08-27 for one reason that
 * outranks tidiness — **the snippet is the only artefact we can never
 * migrate**. Rename a route and redeploy; but a `<script src=…>` pasted into
 * someone's Wix site is theirs for the life of that site, and no deploy of
 * ours can reach in and change it. So it carries no agent's name.
 *
 * Two audiences, strictly separated:
 *
 *   WORKSPACE (authed, platform origin) — GET /tenant/embed issues the
 *   snippet and reports which agents are live on it.
 *
 *   TENANT ENVIRONMENT (public, any origin) — POST /embed/boot is the
 *   widget's first call from inside the tenant's page. It cannot require a
 *   session: the visitor is a stranger on someone else's website. What it
 *   requires instead is a tenant-scoped embed token AND a parent origin
 *   present in `vani_tenant_domain.embed_origins`.
 *
 * ── Threat model, stated honestly ─────────────────────────────────────────
 * The embed token identifies a tenant; it grants nothing by itself. Boot
 * re-checks the origin allowlist on every call, so revocation is an UPDATE to
 * embed_origins, not a token hunt. `parent_origin` is self-reported (browsers
 * do not forward the ancestor origin cross-site), so a non-browser caller can
 * claim any origin — which yields exactly what boot returns: the tenant's
 * public name and what its live agents publicly offer. Nothing private rides
 * on boot. Visitor SUBMISSIONS get the short-lived session minted here plus
 * server-side rate limits; the browser-enforced tier (frame-ancestors CSP
 * built from the same allowlist) is nginx work, tracked in the channels doc.
 */

import { Router } from 'express';
import type { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { extractJwt } from '../auth/auth.routes';
import { varaOffers } from '../vara/offers';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

/** Long-lived: it only names the tenant. Rotation = changing embed_origins. */
const EMBED_TOKEN_TTL = '365d';
/** Short-lived: what a booted widget uses for visitor calls. */
const EMBED_SESSION_TTL = '30m';

interface EmbedTokenClaims {
  tid: string; // vani_tenant.id
  /** Platform scope, not an agent's — one token serves every live agent. */
  scope: 'vani-embed';
}

/**
 * What each agent contributes to a boot.
 *
 * A map rather than a plugin loader, deliberately: there is one agent today,
 * and inventing a registration mechanism against a single implementation is
 * how abstractions come out wrong. When Nova lands, this becomes a
 * registration call and the map goes away. Named here so that is a decision
 * someone makes, not a thing they discover.
 *
 * An agent with nothing to offer a visitor is a FIRST-CLASS case — Nova's two
 * pathways are things it does FOR the tenant, so it may never appear here.
 */
const OFFER_PROVIDERS: Record<string, (pool: Pool, vaniTenantId: string) => Promise<unknown[]>> = {
  vara: varaOffers,
};

/** The vn_ → vani_ slug bridge (reads only, no provisioning). */
async function vaniTenantFor(pool: Pool, vnTenantId: string): Promise<{ id: string; name: string } | null> {
  const r = await pool.query(
    `SELECT vt.id, vt.name FROM vani_tenant vt
       JOIN vn_tenants t ON t.slug = vt.slug
      WHERE t.id = $1`,
    [vnTenantId],
  );
  return r.rows[0] ?? null;
}

export function createEmbedRouter(pool: Pool): Router {
  const router = Router();

  /* ── GET /api/v1/tenant/embed ──────────────────────────────────────────
   * Workspace. The snippet the tenant pastes, the domains it may run on, and
   * which agents are live on it.
   *
   * Deliberately does NOT return any agent's readiness checklist. Whether
   * Vara is ready is Vara's rule, answered by /vara/status; a platform screen
   * that hard-codes one agent's preconditions is the thing this whole slice
   * exists to undo. */
  router.get('/tenant/embed', async (req, res) => {
    try {
      const auth = extractJwt(req);
      if (!auth) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } });
        return;
      }
      const vani = await vaniTenantFor(pool, auth.tenant_id);
      if (!vani) {
        res.status(409).json({
          error: { code: 'TENANT_NOT_PROVISIONED', message: 'Complete the Domain step first' },
        });
        return;
      }

      const claims: EmbedTokenClaims = { tid: vani.id, scope: 'vani-embed' };
      const token = jwt.sign(claims, JWT_SECRET, { expiresIn: EMBED_TOKEN_TTL });

      const agents = await pool.query(
        `SELECT a.code, a.name, ta.status
           FROM vani_tenant_agent ta
           JOIN vani_agent a ON a.id = ta.agent_id
          WHERE ta.tenant_id = $1
          ORDER BY a.name`,
        [vani.id],
      );

      // Every declared domain, whatever its purpose. `purpose` stopped being a
      // gate on 2026-08-26 — the origin allowlist is the control.
      const domains = await pool.query(
        `SELECT id, domain, embed_origins, boot_pings
           FROM vani_tenant_domain
          WHERE tenant_id = $1
          ORDER BY created_at`,
        [vani.id],
      );

      res.json({
        token,
        agents: agents.rows,
        domains: domains.rows,
        // The console substitutes its own origin for CONSOLE_ORIGIN at render
        // time — the API does not know where the widget assets are served from.
        snippet:
          `<script src="CONSOLE_ORIGIN/embed/vani.js" data-vani-token="${token}" defer></script>`,
      });
    } catch (err: any) {
      console.error('[Embed:snippet]', err);
      res.status(500).json({ error: { code: 'EMBED_FAILED', message: 'Could not issue the embed token' } });
    }
  });

  /* ── POST /api/v1/embed/boot ───────────────────────────────────────────
   * PUBLIC. The widget's first call from inside the tenant's page. Returns
   * only what that page could already show its visitors: the tenant's name
   * and what its live agents offer — plus a short-lived session. */
  router.post('/embed/boot', async (req, res) => {
    try {
      const { token, parent_origin } = req.body ?? {};
      if (typeof token !== 'string' || typeof parent_origin !== 'string') {
        res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'token and parent_origin required' } });
        return;
      }

      let claims: EmbedTokenClaims;
      try {
        claims = jwt.verify(token, JWT_SECRET) as EmbedTokenClaims;
        if (claims.scope !== 'vani-embed') throw new Error('wrong scope');
      } catch {
        res.status(401).json({ error: { code: 'EMBED_TOKEN_INVALID', message: 'The embed token is not valid' } });
        return;
      }

      // The allowlist check — every boot, so removing an origin takes effect
      // immediately. Exact string match on scheme+host(+port), as stored.
      const allowed = await pool.query(
        `SELECT 1 FROM vani_tenant_domain
          WHERE tenant_id = $1 AND $2 = ANY(embed_origins)`,
        [claims.tid, parent_origin],
      );
      if (!allowed.rows.length) {
        res.status(403).json({
          error: { code: 'EMBED_ORIGIN_NOT_ALLOWED', message: 'This site is not allowlisted for the workspace' },
        });
        return;
      }

      const live = await pool.query(
        `SELECT a.code, a.name
           FROM vani_tenant_agent ta
           JOIN vani_agent a ON a.id = ta.agent_id
          WHERE ta.tenant_id = $1 AND ta.status = 'live'
          ORDER BY a.name`,
        [claims.tid],
      );
      if (!live.rows.length) {
        res.status(403).json({
          error: { code: 'NO_AGENT_LIVE', message: 'No agent is live for this workspace yet' },
        });
        return;
      }

      // Site-alive telemetry, written only once both gates have passed so the
      // map records boots that actually succeeded. One merging UPDATE: `||`
      // replaces the value at an existing key, so the map stays bounded by
      // origin count no matter how much traffic the page gets.
      await pool.query(
        `UPDATE vani_tenant_domain
            SET boot_pings = boot_pings || jsonb_build_object($2::text, now())
          WHERE tenant_id = $1 AND $2 = ANY(embed_origins)`,
        [claims.tid, parent_origin],
      );

      const tenant = await pool.query(`SELECT name FROM vani_tenant WHERE id = $1`, [claims.tid]);

      // Each live agent contributes its own offers. An agent with no provider
      // registered contributes an empty list rather than breaking the boot —
      // that is the Nova case, not an error.
      const agents = await Promise.all(
        live.rows.map(async (a: any) => ({
          code: a.code,
          name: a.name,
          offers: OFFER_PROVIDERS[a.code] ? await OFFER_PROVIDERS[a.code](pool, claims.tid) : [],
        })),
      );

      const session = jwt.sign(
        { tid: claims.tid, scope: 'vani-visitor', origin: parent_origin },
        JWT_SECRET,
        { expiresIn: EMBED_SESSION_TTL },
      );

      res.json({
        tenant: { name: tenant.rows[0]?.name ?? 'This workspace' },
        agents,
        session,
      });
    } catch (err: any) {
      console.error('[Embed:boot]', err);
      res.status(500).json({ error: { code: 'BOOT_FAILED', message: 'Could not boot the widget' } });
    }
  });

  return router;
}
