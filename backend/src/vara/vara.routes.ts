/**
 * Vara — activation and the candidate channel plumbing.
 *
 * Two audiences, strictly separated:
 *
 *   WORKSPACE (authed, platform origin) — activate the agent, get the embed
 *   snippet. These require a session and, for activation, an admin.
 *
 *   TENANT ENVIRONMENT (public, any origin) — the embed boot. The candidate
 *   surface runs INSIDE the tenant's own site (Wix, WordPress, anything that
 *   can carry a <script> tag), so this endpoint cannot require a session.
 *   What it requires instead is the pair the spec names (Section 3, "Tenant
 *   environment"): a tenant-scoped embed token AND a parent origin present in
 *   the tenant's `vani_tenant_domain.embed_origins` allowlist.
 *
 * ── Threat model, stated honestly ─────────────────────────────────────────
 * The embed token identifies a tenant; it grants nothing by itself. Boot
 * re-checks the origin allowlist on every call, so revocation is an UPDATE to
 * embed_origins, not a token hunt. `parent_origin` is self-reported by the
 * widget (browsers do not forward the ancestor origin cross-site), so a
 * non-browser caller can claim any origin — which yields exactly what boot
 * returns: the tenant's public name and its published roles. Nothing
 * candidate- or tenant-private rides on boot. Candidate SUBMISSIONS (next
 * slice) get the short-lived session minted here plus server-side rate
 * limits; the browser-enforced tier (frame-ancestors CSP built from the same
 * allowlist) is nginx work, tracked in the channels doc.
 */

import { Router } from 'express';
import type { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { extractJwt } from '../auth/auth.routes';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

/** Long-lived: it only names the tenant. Rotation = changing embed_origins. */
const EMBED_TOKEN_TTL = '365d';
/** Short-lived: what a booted widget uses for candidate calls. */
const EMBED_SESSION_TTL = '30m';

interface EmbedTokenClaims {
  tid: string; // vani_tenant.id
  scope: 'vara-embed';
}

/** The vn_ → vani_ slug bridge, pool flavour (reads only, no provisioning). */
async function vaniTenantFor(pool: Pool, vnTenantId: string): Promise<{ id: string; name: string } | null> {
  const r = await pool.query(
    `SELECT vt.id, vt.name FROM vani_tenant vt
       JOIN vn_tenants t ON t.slug = vt.slug
      WHERE t.id = $1`,
    [vnTenantId],
  );
  return r.rows[0] ?? null;
}

/**
 * The readiness checklist, v1. The spec's full gate (Flow D1) needs comms
 * templates, consent text and a calibration approver — none of which exist in
 * the build yet. Gating on things that cannot be configured would make
 * activation impossible, and silently skipping them would misreport readiness.
 * So the checklist is EXACTLY what the running system can verify today, and
 * each item this list omits is named in the channels doc as arriving with its
 * feature. Grows with the build; never shrinks.
 */
async function readinessChecklist(pool: Pool, vaniTenantId: string) {
  const domains = await pool.query(
    `SELECT domain, purpose, embed_origins FROM vani_tenant_domain WHERE tenant_id = $1`,
    [vaniTenantId],
  );
  const candidate = domains.rows.filter((d: any) => d.purpose === 'candidate');
  const origins = candidate.flatMap((d: any) => d.embed_origins ?? []);
  return {
    checks: [
      {
        id: 'candidate_domain',
        label: 'A candidate-facing domain is declared',
        pass: candidate.length > 0,
      },
      {
        id: 'embed_origins',
        label: 'At least one embed origin is allowlisted on it',
        pass: origins.length > 0,
      },
    ],
    ready: candidate.length > 0 && origins.length > 0,
  };
}

export function createVaraRouter(pool: Pool): Router {
  const router = Router();

  /* ── GET /api/v1/vara/status ───────────────────────────────────────────
   * Workspace. What the landing page renders: subscription state + the
   * readiness checklist. Deliberately separate from /embed — reading state
   * must not mint a year-long token as a side effect. */
  router.get('/status', async (req, res) => {
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
      const checklist = await readinessChecklist(pool, vani.id);
      const sub = await pool.query(
        `SELECT ta.status FROM vani_tenant_agent ta
           JOIN vani_agent a ON a.id = ta.agent_id AND a.code = 'vara'
          WHERE ta.tenant_id = $1`,
        [vani.id],
      );
      res.json({ subscription: sub.rows[0]?.status ?? 'none', checklist });
    } catch (err: any) {
      console.error('[Vara:status]', err);
      res.status(500).json({ error: { code: 'FETCH_FAILED', message: 'Could not read Vara state' } });
    }
  });

  /* ── POST /api/v1/vara/activate ────────────────────────────────────────
   * Workspace, admin. Runs the readiness checklist; if it passes, the
   * subscription row goes live. Idempotent: activating a live agent re-answers
   * the same state. The row itself was seeded (or will be inserted here) —
   * activation is an upsert, not an assumption. */
  router.post('/activate', async (req, res) => {
    try {
      const auth = extractJwt(req);
      if (!auth) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } });
        return;
      }
      if (auth.role !== 'owner' && auth.role !== 'admin' && auth.is_admin !== true) {
        res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Activating an agent needs an admin' } });
        return;
      }

      const vani = await vaniTenantFor(pool, auth.tenant_id);
      if (!vani) {
        res.status(409).json({
          error: {
            code: 'TENANT_NOT_PROVISIONED',
            message: 'Complete the Domain step first — it provisions the workspace on the platform spine.',
          },
        });
        return;
      }

      const agent = await pool.query(`SELECT id FROM vani_agent WHERE code = 'vara'`);
      const agentId = agent.rows[0]?.id;
      if (!agentId) {
        res.status(500).json({ error: { code: 'AGENT_MISSING', message: 'Vara is not in the agent registry' } });
        return;
      }

      // Decision 2026-08-17: a correct activation code marks the subscription
      // `activating` — code accepted, Vara onboarding pending. Going `live` is
      // the ONBOARDING lane's finish line (flow being designed), not this
      // call's. The readiness checklist moves there with it; an already-live
      // subscription is left alone.
      const row = await pool.query(
        `INSERT INTO vani_tenant_agent (tenant_id, agent_id, status)
         VALUES ($1, $2, 'activating')
         ON CONFLICT (tenant_id, agent_id) DO UPDATE
           SET status = CASE WHEN vani_tenant_agent.status = 'live'
                             THEN 'live' ELSE 'activating' END
         RETURNING status, activated_at`,
        [vani.id, agentId],
      );

      await pool.query(
        `INSERT INTO vani_audit_log (tenant_id, agent_id, actor_type, actor_id, entity, entity_id, action, before, after)
         VALUES ($1, $2, 'human', $3, 'vani_tenant_agent', $2, 'activation_code_accepted', '{}'::jsonb, $4::jsonb)`,
        [vani.id, agentId, auth.user_id, JSON.stringify({ status: row.rows[0]?.status })],
      );

      res.json({ agent: 'vara', ...row.rows[0], onboarding: 'pending-design' });
    } catch (err: any) {
      console.error('[Vara:activate]', err);
      res.status(500).json({ error: { code: 'ACTIVATE_FAILED', message: 'Could not activate Vara' } });
    }
  });

  /* ── GET /api/v1/vara/embed ────────────────────────────────────────────
   * Workspace. The snippet the tenant pastes into their site — Wix, WordPress,
   * hand-written HTML; anything that carries a <script> tag. Also answers the
   * checklist and subscription state so the console can render setup honestly. */
  router.get('/embed', async (req, res) => {
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

      const claims: EmbedTokenClaims = { tid: vani.id, scope: 'vara-embed' };
      const token = jwt.sign(claims, JWT_SECRET, { expiresIn: EMBED_TOKEN_TTL });

      const checklist = await readinessChecklist(pool, vani.id);
      const sub = await pool.query(
        `SELECT ta.status FROM vani_tenant_agent ta
           JOIN vani_agent a ON a.id = ta.agent_id AND a.code = 'vara'
          WHERE ta.tenant_id = $1`,
        [vani.id],
      );

      const origins = await pool.query(
        `SELECT embed_origins FROM vani_tenant_domain WHERE tenant_id = $1 AND purpose = 'candidate'`,
        [vani.id],
      );

      res.json({
        token,
        subscription: sub.rows[0]?.status ?? 'none',
        checklist,
        embed_origins: origins.rows.flatMap((r: any) => r.embed_origins ?? []),
        // The console substitutes its own origin for CONSOLE_ORIGIN at render
        // time — the API does not know where the widget assets are served from.
        snippet:
          `<script src="CONSOLE_ORIGIN/embed/vara.js" data-vara-token="${token}" defer></script>`,
      });
    } catch (err: any) {
      console.error('[Vara:embed]', err);
      res.status(500).json({ error: { code: 'EMBED_FAILED', message: 'Could not issue the embed token' } });
    }
  });

  /* ── POST /api/v1/vara/embed/boot ──────────────────────────────────────
   * PUBLIC. The widget's first call from inside the tenant's page. Returns
   * only what that page could already show its visitors: the tenant's name
   * and published roles — plus a short-lived session for the calls after. */
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
        if (claims.scope !== 'vara-embed') throw new Error('wrong scope');
      } catch {
        res.status(401).json({ error: { code: 'EMBED_TOKEN_INVALID', message: 'The embed token is not valid' } });
        return;
      }

      // The allowlist check — every boot, so removing an origin takes effect
      // immediately. Exact string match on scheme+host(+port), as stored.
      const allowed = await pool.query(
        `SELECT 1 FROM vani_tenant_domain
          WHERE tenant_id = $1 AND purpose = 'candidate' AND $2 = ANY(embed_origins)`,
        [claims.tid, parent_origin],
      );
      if (!allowed.rows.length) {
        res.status(403).json({
          error: { code: 'EMBED_ORIGIN_NOT_ALLOWED', message: 'This site is not allowlisted for the workspace' },
        });
        return;
      }

      const live = await pool.query(
        `SELECT 1 FROM vani_tenant_agent ta
           JOIN vani_agent a ON a.id = ta.agent_id AND a.code = 'vara'
          WHERE ta.tenant_id = $1 AND ta.status = 'live'`,
        [claims.tid],
      );
      if (!live.rows.length) {
        res.status(403).json({ error: { code: 'AGENT_NOT_LIVE', message: 'Vara is not live for this workspace yet' } });
        return;
      }

      const tenant = await pool.query(`SELECT name FROM vani_tenant WHERE id = $1`, [claims.tid]);
      const roles = await pool.query(
        `SELECT id, title FROM vara_jd WHERE tenant_id = $1 AND status = 'published' ORDER BY created_at DESC`,
        [claims.tid],
      );

      const session = jwt.sign(
        { tid: claims.tid, scope: 'vara-candidate', origin: parent_origin },
        JWT_SECRET,
        { expiresIn: EMBED_SESSION_TTL },
      );

      res.json({
        tenant: { name: tenant.rows[0]?.name ?? 'This workspace' },
        roles: roles.rows,
        session,
      });
    } catch (err: any) {
      console.error('[Vara:embed:boot]', err);
      res.status(500).json({ error: { code: 'BOOT_FAILED', message: 'Could not boot the widget' } });
    }
  });

  return router;
}
