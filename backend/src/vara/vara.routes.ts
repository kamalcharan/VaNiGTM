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
import type { Pool, PoolClient } from 'pg';
import jwt from 'jsonwebtoken';
import { extractJwt } from '../auth/auth.routes';

/**
 * The tenant industry (a VARCHAR on vn_tenant_profiles) is free text: "Technology
 * & SaaS", "technology - saas", "Tech / SaaS" — all mean the same industry, and
 * vani_domain_pack.domain uses a canonical slug. This is the deterministic
 * mapping between the two: lowercase, collapse non-alnum runs to '-', trim.
 * Kept small and pure so a seed migration and a runtime lookup use the same
 * form without having to import anything.
 */
function slugifyIndustry(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')   // strip combining marks
    .replace(/[&/]/g, ' ')             // ampersand and slash become word breaks, not "and"
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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
  const jds = await pool.query(
    `SELECT 1 FROM vara_jd WHERE tenant_id = $1 AND status = 'published' LIMIT 1`,
    [vaniTenantId],
  );
  const firstJdPublished = jds.rows.length > 0;
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
      {
        id: 'first_jd_published',
        label: 'A first JD is published',
        pass: firstJdPublished,
      },
    ],
    ready: candidate.length > 0 && origins.length > 0 && firstJdPublished,
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

  /* ── GET /api/v1/vara/onboarding/context ──────────────────────────────
   * Workspace. Everything the doorway needs to render in one call:
   *   - the tenant's declared industry (raw + slug)
   *   - the registry families we have starting playbooks for under that
   *     industry (vani_domain_pack.payload.vara.starter), read directly
   *     — no tenant-scoped pack binding on the read path so a tenant sees
   *     what's available before they've committed to anything
   *   - the tenant's brand data (name, website — colors land when the
   *     brand step is built; keys are present so the client can render
   *     null-safe)
   *   - the tenant's own published JDs, so the doorway's Duplicate/Edit
   *     list is server-truth rather than sessionStorage
   *
   * NO_INDUSTRY is a distinct 409 so the client renders the "set your
   * industry first" state rather than an empty family list. An unknown
   * industry with zero packs is a *live* empty state (200 with families:[])
   * — the Other affordance handles it. */
  router.get('/onboarding/context', async (req, res) => {
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

      const profile = await pool.query(
        `SELECT name, display_name, website, industry
           FROM vn_tenant_profiles WHERE tenant_id = $1`,
        [auth.tenant_id],
      );
      const rawIndustry = (profile.rows[0]?.industry ?? '').trim();
      if (!rawIndustry) {
        res.status(409).json({
          error: { code: 'NO_INDUSTRY', message: 'Set your industry in Smart Profile — Vara reads it from there' },
        });
        return;
      }
      const industrySlug = slugifyIndustry(rawIndustry);

      // Latest published pack per family under this industry. `vara`
      // namespace inside payload — packs whose payload has no `vara.starter`
      // are hidden from Vara's context (they belong to other agents).
      const packs = await pool.query(
        `SELECT DISTINCT ON (code) code, version, payload
           FROM vani_domain_pack
          WHERE domain = $1
            AND payload -> 'vara' -> 'starter' IS NOT NULL
          ORDER BY code, version DESC`,
        [industrySlug],
      );
      const families = packs.rows.map((r: any) => ({
        pack_code: r.code,
        pack_version: r.version,
        name: r.payload.family_name,
        hint: r.payload.hint ?? null,
        suggested_titles: r.payload.suggested_titles ?? [],
        starter: r.payload.vara.starter,
      }));

      // Tenant's own published JDs — latest version per jd_id so Edit lands
      // on the current version. Facts + must_haves + knockouts are what the
      // doorway needs to render the row and prefill on Duplicate/Edit.
      const jds = await pool.query(
        `SELECT DISTINCT ON (jd.id)
                jd.id, jd.title, rf.name AS family, ver.version,
                ver.facts, ver.must_haves, ver.knockouts, ver.threshold
           FROM vara_jd jd
           JOIN vani_role_family rf ON rf.id = jd.family_id
           JOIN vara_jd_version ver ON ver.jd_id = jd.id
          WHERE jd.tenant_id = $1 AND jd.status = 'published'
          ORDER BY jd.id, ver.version DESC`,
        [vani.id],
      );

      const sub = await pool.query(
        `SELECT ta.status FROM vani_tenant_agent ta
           JOIN vani_agent a ON a.id = ta.agent_id AND a.code = 'vara'
          WHERE ta.tenant_id = $1`,
        [vani.id],
      );

      res.json({
        industry: { raw: rawIndustry, slug: industrySlug },
        brand: {
          name: profile.rows[0]?.display_name || profile.rows[0]?.name || 'Your workspace',
          website: profile.rows[0]?.website ?? null,
          // Colors + site_quote arrive with the brand-capture step. Emitting
          // the keys as null keeps the client's inheritance card null-safe.
          colors: null,
          site_quote: null,
        },
        families,
        published_jds: jds.rows.map((r: any) => ({
          id: r.id,
          title: r.title,
          family: r.family,
          version: r.version,
          facts: {
            ...r.facts,
            musthaves: r.must_haves,
            knockouts: r.knockouts,
            threshold: r.threshold,
          },
        })),
        subscription: sub.rows[0]?.status ?? 'none',
      });
    } catch (err: any) {
      console.error('[Vara:onboarding:context]', err);
      res.status(500).json({ error: { code: 'CONTEXT_FAILED', message: 'Could not read Vara onboarding context' } });
    }
  });

  /* ── POST /api/v1/vara/jd/compose ─────────────────────────────────────
   * Workspace. Publishes a JD as v1 of a new identity, in one transaction:
   *
   *   vani_role_family      — upsert (tenant + name)
   *   vara_family_profile   — upsert (family_id) with pack-derived defaults
   *   vara_scoring_config   — insert v1 for this family (append-only)
   *   vara_jd               — insert
   *   vara_jd_version       — insert v1 (append-only)
   *   vara_jd.current_version_id — point at the v1 row
   *   vani_tenant_agent     — flip 'activating' → 'live' on FIRST publish
   *   vani_audit_log        — the deed and its actor
   *
   * Idempotency contract: an Idempotency-Key header is honoured within one
   * process's lifetime by a transaction-scoped advisory lock hashed from
   * (tenant, key). A concurrent double-submit with the same key waits, and
   * finds the JD its predecessor just created (via freshness check on
   * (tenant, family, title, created_by) within 60s) — returning the same
   * id instead of creating a duplicate.
   *
   * Full cross-process store-and-replay (a retry after a browser reload)
   * needs a `vani_idempotency` table — flagged as a schema change to raise
   * with Charan before it lands, per repo-wide rule 4. Until then the UI's
   * useSkillMutation ref-guard plus this advisory lock cover the "double
   * click Publish" and "retry inside the same session" cases; a hard refresh
   * mid-flight can still produce a second JD, so the client warns before
   * publish and the server keeps the audit trail so a duplicate is visible
   * rather than silent. Edit (v2+) is not this endpoint's shape yet — it
   * will land as POST /vara/jd/:id/version. */
  router.post('/jd/compose', async (req, res) => {
    let client: PoolClient | null = null;
    try {
      const auth = extractJwt(req);
      if (!auth) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } });
        return;
      }

      const { family, title, facts } = req.body ?? {};
      if (typeof family !== 'string' || !family.trim()) {
        res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'family required' } }); return;
      }
      if (typeof title !== 'string' || title.trim().length < 3) {
        res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'title is too short' } }); return;
      }
      if (!facts || typeof facts !== 'object') {
        res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'facts required' } }); return;
      }
      const musthaves = Array.isArray(facts.musthaves) ? facts.musthaves : [];
      const knockouts = Array.isArray(facts.knockouts) ? facts.knockouts : [];
      const threshold = typeof facts.threshold === 'number'
        ? Math.max(0, Math.min(100, Math.trunc(facts.threshold)))
        : 30;
      if (musthaves.length === 0) {
        res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'at least one must-have is required to publish' } }); return;
      }

      const idemKey = typeof req.header('Idempotency-Key') === 'string'
        ? req.header('Idempotency-Key')!.trim()
        : null;

      client = await pool.connect();
      await client.query('BEGIN');

      // Advisory lock for the concurrent-duplicate case. Held for the whole
      // transaction, released on COMMIT/ROLLBACK. Two concurrent requests
      // with the same idempotency key serialise; without a key they use a
      // per-tenant lock, so a double-click on Publish still can't race.
      const lockKey = idemKey
        ? `${auth.tenant_id}:jd-compose:${idemKey}`
        : `${auth.tenant_id}:jd-compose:${title.trim()}`;
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey]);

      // vn → vani bridge (may provision on first touch — Domain step should
      // already have but we don't require the caller to have run this
      // endpoint after that specifically).
      const vaniRow = await client.query(
        `SELECT vt.id, vt.name FROM vani_tenant vt
           JOIN vn_tenants t ON t.slug = vt.slug
          WHERE t.id = $1`,
        [auth.tenant_id],
      );
      if (!vaniRow.rows.length) {
        await client.query('ROLLBACK');
        res.status(409).json({
          error: { code: 'TENANT_NOT_PROVISIONED', message: 'Complete the Domain step first' },
        });
        return;
      }
      const vaniTenantId: string = vaniRow.rows[0].id;

      // Freshness check for idempotency-in-practice — a same-key retry
      // within 60s finds the JD its predecessor just created. Deliberately
      // narrow: this replays the outcome, it does not silently return a
      // pre-existing unrelated JD with the same title.
      if (idemKey) {
        const fresh = await client.query(
          `SELECT jd.id AS jd_id, ver.id AS version_id, ver.version, jd.title, rf.name AS family
             FROM vara_jd jd
             JOIN vara_jd_version ver ON ver.jd_id = jd.id
             JOIN vani_role_family rf ON rf.id = jd.family_id
            WHERE jd.tenant_id = $1
              AND jd.title = $2
              AND rf.name = $3
              AND jd.created_at > now() - interval '60 seconds'
            ORDER BY ver.version DESC
            LIMIT 1`,
          [vaniTenantId, title.trim(), family.trim()],
        );
        if (fresh.rows.length) {
          await client.query('COMMIT');
          res.json({
            jd_id: fresh.rows[0].jd_id,
            version_id: fresh.rows[0].version_id,
            version: fresh.rows[0].version,
            family: fresh.rows[0].family,
            title: fresh.rows[0].title,
            replayed: true,
          });
          return;
        }
      }

      // Family row (tenant-scoped). Upsert on (tenant_id, name) — the schema
      // is (tenant_id, name) unique. Description carries the pack code so a
      // pack-derived family and an Other family are distinguishable later.
      const packMatch = await pool.query(
        `SELECT code, version, payload
           FROM vani_domain_pack
          WHERE payload ->> 'family_name' = $1
            AND payload -> 'vara' -> 'starter' IS NOT NULL
          ORDER BY version DESC LIMIT 1`,
        [family.trim()],
      );
      const packRow = packMatch.rows[0] ?? null;

      const famUp = await client.query(
        `INSERT INTO vani_role_family (tenant_id, name, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, name) DO UPDATE
           SET description = COALESCE(vani_role_family.description, EXCLUDED.description)
         RETURNING id`,
        [
          vaniTenantId,
          family.trim(),
          packRow ? `pack:${packRow.code}` : 'ad-hoc',
        ],
      );
      const familyId: string = famUp.rows[0].id;

      // Family profile — Vara's talent-side overlay (1:1 with vani_role_family).
      // Insert only if missing; do not overwrite an existing profile's threshold.
      await client.query(
        `INSERT INTO vara_family_profile (tenant_id, family_id, default_threshold)
         VALUES ($1, $2, $3)
         ON CONFLICT (family_id) DO NOTHING`,
        [vaniTenantId, familyId, threshold],
      );

      // Scoring config v1 for this family. Append-only guard trigger allows
      // inserts but never updates/deletes; version bumps handle real edits.
      const cfgRow = await client.query(
        `INSERT INTO vara_scoring_config (tenant_id, family_id, version, weights, components, threshold_default)
         VALUES ($1, $2, 1, $3::jsonb, $4::jsonb, $5)
         ON CONFLICT (tenant_id, family_id, version) DO UPDATE
           SET threshold_default = vara_scoring_config.threshold_default
         RETURNING id`,
        [
          vaniTenantId,
          familyId,
          JSON.stringify({ skill: 55, avail: 25, exp: 20 }),
          JSON.stringify({ musthaves }),
          threshold,
        ],
      );
      const scoringConfigId: string = cfgRow.rows[0].id;

      // Point the family profile at the freshly written config, if it does
      // not already have a live pointer. Later versions will move this via
      // the calibration flow, not here.
      await client.query(
        `UPDATE vara_family_profile
            SET active_config_id = COALESCE(active_config_id, $1)
          WHERE family_id = $2`,
        [scoringConfigId, familyId],
      );

      // The JD row + its v1.
      const jdIns = await client.query(
        `INSERT INTO vara_jd (tenant_id, family_id, title, status, created_by)
         VALUES ($1, $2, $3, 'published', $4)
         RETURNING id`,
        [vaniTenantId, familyId, title.trim(), null],
      );
      const jdId: string = jdIns.rows[0].id;

      const jdFacts: Record<string, unknown> = { ...facts };
      delete (jdFacts as any).musthaves;
      delete (jdFacts as any).knockouts;
      delete (jdFacts as any).threshold;

      const verIns = await client.query(
        `INSERT INTO vara_jd_version
           (tenant_id, jd_id, version, facts, must_haves, knockouts, threshold, created_by)
         VALUES ($1, $2, 1, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7)
         RETURNING id, version`,
        [
          vaniTenantId,
          jdId,
          JSON.stringify(jdFacts),
          JSON.stringify(musthaves),
          JSON.stringify(knockouts),
          threshold,
          // created_by references vani_user(id); the JWT carries a vn_users
          // id which is a different spine. Until a vn_user → vani_user
          // bridge exists (schema change to raise), leave null. The audit
          // row below still captures actor_id (a vn_users id — the audit
          // log takes any uuid).
          null,
        ],
      );
      const versionId: string = verIns.rows[0].id;

      await client.query(
        `UPDATE vara_jd SET current_version_id = $1 WHERE id = $2`,
        [versionId, jdId],
      );

      // First publish flips subscription 'activating' → 'live'. Subsequent
      // publishes leave it as-is. 'none' or missing means activation never
      // ran; do not silently upgrade — that would let the JD compose path
      // bypass the activation gate.
      const agent = await client.query(`SELECT id FROM vani_agent WHERE code = 'vara'`);
      const agentId = agent.rows[0]?.id;
      let liveFirstTime = false;
      if (agentId) {
        const sub = await client.query(
          `SELECT status FROM vani_tenant_agent
            WHERE tenant_id = $1 AND agent_id = $2`,
          [vaniTenantId, agentId],
        );
        const status = sub.rows[0]?.status ?? null;
        if (status === 'activating') {
          await client.query(
            `UPDATE vani_tenant_agent SET status = 'live'
              WHERE tenant_id = $1 AND agent_id = $2`,
            [vaniTenantId, agentId],
          );
          liveFirstTime = true;
        }
      }

      // Audit rows — one for JD publish, one for the subscription flip if it
      // happened. Payload refers to ids per V-13 (audit holds no PII).
      await client.query(
        `INSERT INTO vani_audit_log (tenant_id, agent_id, actor_type, actor_id, entity, entity_id, action, before, after)
         VALUES ($1, $2, 'human', $3, 'vara_jd', $4, 'jd_published', '{}'::jsonb, $5::jsonb)`,
        [vaniTenantId, agentId, auth.user_id, jdId,
         JSON.stringify({ jd_id: jdId, version_id: versionId, family_id: familyId, scoring_config_id: scoringConfigId })],
      );
      if (liveFirstTime) {
        await client.query(
          `INSERT INTO vani_audit_log (tenant_id, agent_id, actor_type, actor_id, entity, entity_id, action, before, after)
           VALUES ($1, $2, 'human', $3, 'vani_tenant_agent', $2, 'went_live', $4::jsonb, $5::jsonb)`,
          [vaniTenantId, agentId, auth.user_id,
           JSON.stringify({ status: 'activating' }),
           JSON.stringify({ status: 'live', first_jd_id: jdId })],
        );
      }

      await client.query('COMMIT');

      res.json({
        jd_id: jdId,
        version_id: versionId,
        version: 1,
        family_id: familyId,
        scoring_config_id: scoringConfigId,
        subscription_status: liveFirstTime ? 'live' : undefined,
        live_first_time: liveFirstTime,
        replayed: false,
      });
    } catch (err: any) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch { /* ignored */ }
      }
      console.error('[Vara:jd:compose]', err);
      res.status(500).json({ error: { code: 'COMPOSE_FAILED', message: 'Could not publish this JD' } });
    } finally {
      if (client) client.release();
    }
  });

  /* ── GET /api/v1/vara/prompts ─────────────────────────────────────────
   * Workspace. The Prompt Studio's list view. Returns one row per key
   * that starts with 'vara.' — currently active system version + the
   * tenant's active override if any + a version_history summary.
   *
   * Scoped by key prefix rather than by JWT role: any authed member of
   * the tenant can READ; the mutate endpoint below is the one that gets
   * an admin check when we build multi-role admin. */
  router.get('/prompts', async (req, res) => {
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

      // System rows visible to everyone (RLS admits tenant_id IS NULL);
      // tenant rows visible only to matching tenant (RLS). We fetch both
      // and reshape.
      const rows = await pool.query(
        `SELECT key, scope, version, body, variables, active, approved_at, tenant_id
           FROM vani_prompt
          WHERE key LIKE 'vara.%'
          ORDER BY key, scope, version DESC`,
      );

      // Group by key. For each key: latest active system + latest active
      // tenant-override (if the tenant is the caller's), plus version counts.
      interface PromptView {
        key: string;
        system: { version: number; body: string; variables: string[] } | null;
        override: { version: number; body: string; approved_at: string | null } | null;
        system_versions: number;
        override_versions: number;
      }
      const byKey = new Map<string, PromptView>();
      for (const r of rows.rows) {
        const view = byKey.get(r.key) ?? {
          key: r.key,
          system: null,
          override: null,
          system_versions: 0,
          override_versions: 0,
        };
        if (r.scope === 'system') {
          view.system_versions += 1;
          if (r.active && (!view.system || r.version > view.system.version)) {
            view.system = { version: r.version, body: r.body, variables: r.variables ?? [] };
          }
        } else {
          // r.scope === 'tenant' — RLS already confined to caller's tenant
          view.override_versions += 1;
          if (r.active && (!view.override || r.version > view.override.version)) {
            view.override = {
              version: r.version,
              body: r.body,
              approved_at: r.approved_at ? r.approved_at.toISOString() : null,
            };
          }
        }
        byKey.set(r.key, view);
      }

      res.json({ prompts: Array.from(byKey.values()) });
    } catch (err: any) {
      console.error('[Vara:prompts:list]', err);
      res.status(500).json({ error: { code: 'PROMPTS_FAILED', message: 'Could not read prompts' } });
    }
  });

  /* ── PATCH /api/v1/vara/prompts/:key ──────────────────────────────────
   * Workspace. Save a tenant override for one prompt key. In one transaction:
   *   1. Deactivate any currently-active override for (key, this tenant)
   *   2. Insert a new tenant row at version = max(prior tenant version)+1
   *      with active=true, self-approved (MVP; a separate-approver flow
   *      splits this into save + approve without changing the schema).
   *
   * Idempotent by shape: repeating with the SAME body still deactivates
   * old + inserts a new-version row — which is not strictly a no-op in
   * the version stream, but is safe (history keeps growing, active flag
   * ends up on the latest row). A true no-op detection needs a body-hash
   * comparison; skipped for MVP to keep the SQL small.
   *
   * DELETE (clear the override, fall back to system) is a separate call
   * arriving with the Prompt Studio's "Revert to system" button. */
  router.patch('/prompts/:key', async (req, res) => {
    let client: PoolClient | null = null;
    try {
      const auth = extractJwt(req);
      if (!auth) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } });
        return;
      }
      const key = req.params.key;
      if (!key.startsWith('vara.')) {
        res.status(400).json({ error: { code: 'INVALID_KEY', message: 'Only vara.* keys are editable here' } });
        return;
      }
      const body = req.body?.body;
      if (typeof body !== 'string' || body.trim().length < 10) {
        res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'body is required and must be substantial' } });
        return;
      }

      const vani = await vaniTenantFor(pool, auth.tenant_id);
      if (!vani) {
        res.status(409).json({
          error: { code: 'TENANT_NOT_PROVISIONED', message: 'Complete the Domain step first' },
        });
        return;
      }

      // System version must exist for the key — otherwise the tenant is
      // overriding nothing, and the resolver would still return the
      // override (which is fine), but there'd be no `variables` contract
      // to validate against. Refuse loudly so a typo in the key doesn't
      // silently create a dead override.
      const sys = await pool.query(
        `SELECT variables FROM vani_prompt
          WHERE key = $1 AND scope = 'system' AND active = true
          ORDER BY version DESC LIMIT 1`,
        [key],
      );
      if (!sys.rows.length) {
        res.status(404).json({
          error: { code: 'UNKNOWN_PROMPT_KEY', message: `No system prompt for key "${key}"` },
        });
        return;
      }
      const systemVars: string[] = sys.rows[0].variables ?? [];

      // Every variable the system contract declares must appear in the
      // override body (as a {{name}} token). Dropping one would silently
      // break the caller.
      for (const v of systemVars) {
        if (!body.includes(`{{${v}}}`)) {
          res.status(400).json({
            error: { code: 'OVERRIDE_MISSING_VARIABLE',
                     message: `Override drops required variable {{${v}}}` },
          });
          return;
        }
      }

      client = await pool.connect();
      await client.query('BEGIN');

      // Deactivate any active tenant override for this key.
      await client.query(
        `UPDATE vani_prompt SET active = false
          WHERE key = $1 AND scope = 'tenant' AND tenant_id = $2 AND active = true`,
        [key, vani.id],
      );

      // Bump version = max prior tenant version + 1 (or 1 if none).
      const nextVerRow = await client.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
           FROM vani_prompt WHERE key = $1 AND scope = 'tenant' AND tenant_id = $2`,
        [key, vani.id],
      );
      const nextVersion: number = nextVerRow.rows[0].next_version;

      // Insert the new active row. Self-approve for MVP.
      const ins = await client.query(
        `INSERT INTO vani_prompt (key, version, scope, tenant_id, body, variables, active, approved_by, approved_at)
         VALUES ($1, $2, 'tenant', $3, $4, $5::jsonb, true, NULL, now())
         RETURNING id, version, approved_at`,
        [key, nextVersion, vani.id, body, JSON.stringify(systemVars)],
      );

      // approved_by references vani_user(id); JWT carries a vn_users.id
      // (different spine — same bridge gap called out on vara_jd.created_by).
      // Same fix: leave null for now, audit_log captures actor_id. Flagged
      // as one bridge to build together.
      await client.query(
        `INSERT INTO vani_audit_log (tenant_id, agent_id, actor_type, actor_id, entity, entity_id, action, before, after)
         SELECT $1, a.id, 'human', $2, 'vani_prompt', $3, 'override_activated',
                '{}'::jsonb, jsonb_build_object('key', $4::text, 'version', $5::int)
           FROM vani_agent a WHERE a.code = 'vara'`,
        [vani.id, auth.user_id, ins.rows[0].id, key, nextVersion],
      );

      await client.query('COMMIT');
      res.json({ key, version: nextVersion, active: true, approved_at: ins.rows[0].approved_at });
    } catch (err: any) {
      if (client) { try { await client.query('ROLLBACK'); } catch { /* ignore */ } }
      console.error('[Vara:prompts:patch]', err);
      res.status(500).json({ error: { code: 'PROMPT_SAVE_FAILED', message: 'Could not save prompt override' } });
    } finally {
      if (client) client.release();
    }
  });

  /* ── DELETE /api/v1/vara/prompts/:key ─────────────────────────────────
   * Workspace. "Revert to system prompt": deactivate the tenant's active
   * override. History is preserved (append-only rules stand); resolver
   * now falls through to the newest system version. */
  router.delete('/prompts/:key', async (req, res) => {
    try {
      const auth = extractJwt(req);
      if (!auth) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } });
        return;
      }
      const key = req.params.key;
      if (!key.startsWith('vara.')) {
        res.status(400).json({ error: { code: 'INVALID_KEY', message: 'Only vara.* keys are editable here' } });
        return;
      }
      const vani = await vaniTenantFor(pool, auth.tenant_id);
      if (!vani) {
        res.status(409).json({
          error: { code: 'TENANT_NOT_PROVISIONED', message: 'Complete the Domain step first' },
        });
        return;
      }

      const upd = await pool.query(
        `UPDATE vani_prompt SET active = false
          WHERE key = $1 AND scope = 'tenant' AND tenant_id = $2 AND active = true
          RETURNING id`,
        [key, vani.id],
      );
      if (!upd.rows.length) {
        res.status(404).json({ error: { code: 'NO_ACTIVE_OVERRIDE', message: 'No active override to revert' } });
        return;
      }

      await pool.query(
        `INSERT INTO vani_audit_log (tenant_id, agent_id, actor_type, actor_id, entity, entity_id, action, before, after)
         SELECT $1, a.id, 'human', $2, 'vani_prompt', $3, 'override_reverted',
                jsonb_build_object('key', $4::text), '{}'::jsonb
           FROM vani_agent a WHERE a.code = 'vara'`,
        [vani.id, auth.user_id, upd.rows[0].id, key],
      );

      res.json({ key, reverted: true });
    } catch (err: any) {
      console.error('[Vara:prompts:delete]', err);
      res.status(500).json({ error: { code: 'PROMPT_REVERT_FAILED', message: 'Could not revert prompt override' } });
    }
  });

  return router;
}
