/**
 * Onboarding — the agent's engine, over HTTP.
 *
 * One mechanism, two tiers. `?lane=` selects what is being onboarded: the
 * product lane for the organisation, an agent's lane when that agent is
 * activated. Adding an agent's lane is a `registerLane()` call in lanes.ts —
 * nothing here changes.
 *
 * ── Two-phase commit (CLAUDE.md) ──────────────────────────────────────────
 *
 * A step both WRITES ITS DATA and MARKS ITSELF DONE. Those must not half-apply:
 * a profile saved without its step marked leaves the user redoing it, and a step
 * marked without its profile saved leaves the org with a gap nothing will ask
 * about again. So it is one endpoint, one transaction — never two calls the UI
 * sequences.
 *
 * ── Idempotency (CLAUDE.md) ───────────────────────────────────────────────
 *
 * This endpoint is idempotent BY CONSTRUCTION rather than by a stored key.
 * The write is an upsert on `vn_tenant_onboarding`'s unique (tenant_id,
 * step_id), and the payload writes are field assignments, not inserts of new
 * rows with generated ids. Replaying a request therefore produces the same row
 * and the same response.
 *
 * That is why no key store is needed HERE. It is not a general solution: the
 * first endpoint that creates a row with a generated id will need a real
 * store-and-replay table, and that is a schema change to raise then, not to
 * pre-build now.
 */

import { Router } from 'express';
import type { Pool, PoolClient } from 'pg';
import { extractJwt } from '../auth/auth.routes';
import { getLane, isStepOfLane, requiredSteps, type Lane } from './lanes';

/** Fields each step is allowed to write. Anything else in `data` is ignored. */
const USER_PROFILE_FIELDS = [
  'name', 'first_name', 'last_name', 'designation', 'country_code', 'mobile', 'bio',
] as const;

const BUSINESS_PROFILE_FIELDS = [
  'name', 'display_name', 'type', 'description', 'website', 'industry',
  'email', 'phone', 'city', 'state', 'country', 'postal_code', 'gstin', 'pan',
] as const;

function pick(data: Record<string, unknown>, allowed: readonly string[]) {
  const out: Record<string, unknown> = {};
  for (const f of allowed) {
    if (data[f] !== undefined && data[f] !== null && data[f] !== '') out[f] = data[f];
  }
  return out;
}

/** Build `SET a = $2, b = $3` plus values, starting at $2. */
function setClause(fields: Record<string, unknown>, from = 2) {
  const keys = Object.keys(fields);
  return {
    sql: keys.map((k, i) => `${k} = $${i + from}`).join(', '),
    values: keys.map((k) => fields[k]),
    count: keys.length,
  };
}

/**
 * A step-payload failure the tenant can act on. The PATCH handler maps these
 * to their status/code instead of the blanket 500.
 */
class StepPayloadError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

/**
 * The vn_ → vani_ tenant bridge. The JWT carries a vn_tenants id, but the
 * platform spine keys on vani_tenant(id) — a separate table. The designed
 * bridge is the slug (unique in both): resolve the vani_tenant row for this
 * vn tenant, provisioning it on first touch. That IS V-01 ("tenant
 * provisioned") happening lazily — a real row, no special case, name taken
 * from the tenant profile the business_profile step already wrote.
 *
 * Runs inside the caller's transaction like everything else here.
 */
async function resolveVaniTenant(client: PoolClient, vnTenantId: string): Promise<string> {
  const found = await client.query(
    `SELECT vt.id FROM vani_tenant vt
       JOIN vn_tenants t ON t.slug = vt.slug
      WHERE t.id = $1`,
    [vnTenantId],
  );
  if (found.rows.length) return found.rows[0].id;

  const created = await client.query(
    `INSERT INTO vani_tenant (slug, name)
     SELECT t.slug, COALESCE(p.display_name, p.name, t.slug)
       FROM vn_tenants t
       LEFT JOIN vn_tenant_profiles p ON p.tenant_id = t.id
      WHERE t.id = $1
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [vnTenantId],
  );
  if (!created.rows.length) {
    throw new StepPayloadError(500, 'TENANT_NOT_FOUND', 'No tenant row to bridge from');
  }
  return created.rows[0].id;
}

/**
 * Apply a step's payload. Runs INSIDE the caller's transaction — every write
 * here and the step mark itself commit or roll back together.
 */
async function applyStepPayload(
  client: PoolClient,
  stepId: string,
  tenantId: string,
  userId: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (stepId === 'user_profile') {
    const fields = pick(data, USER_PROFILE_FIELDS);
    if (!Object.keys(fields).length) return;
    const { sql, values } = setClause(fields);
    await client.query(
      `UPDATE vn_users SET ${sql}, updated_at = now() WHERE id = $1 AND tenant_id = $${values.length + 2}`,
      [userId, ...values, tenantId],
    );
    return;
  }

  if (stepId === 'business_profile') {
    const fields = pick(data, BUSINESS_PROFILE_FIELDS);
    if (!Object.keys(fields).length) return;
    const { sql, values } = setClause(fields);
    await client.query(
      `UPDATE vn_tenant_profiles SET ${sql}, updated_at = now() WHERE tenant_id = $1`,
      [tenantId, ...values],
    );
    return;
  }

  if (stepId === 'vani:domain') {
    // Normalise whatever shape the tenant pasted — URL, host:port, trailing
    // path — down to the bare host, then validate it really is one.
    const raw = typeof data.domain === 'string' ? data.domain.trim().toLowerCase() : '';
    const domain = raw
      .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/:\d+$/, '');
    if (!domain || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
      throw new StepPayloadError(400, 'INVALID_DOMAIN',
        'Enter a valid domain, like app.example.com');
    }
    const purpose = data.purpose === 'candidate' ? 'candidate' : 'workspace';

    const vaniTenantId = await resolveVaniTenant(client, tenantId);

    // vani_tenant_domain.domain is unique GLOBALLY, not per tenant — a domain
    // held by another workspace must never be silently re-pointed.
    const owner = await client.query(
      `SELECT tenant_id FROM vani_tenant_domain WHERE domain = $1`,
      [domain],
    );
    if (owner.rows.length && owner.rows[0].tenant_id !== vaniTenantId) {
      throw new StepPayloadError(409, 'DOMAIN_TAKEN',
        'That domain is already registered to another workspace');
    }

    // Upsert on the unique key — a replayed request lands on the same row,
    // which keeps this endpoint idempotent by construction (see header).
    await client.query(
      `INSERT INTO vani_tenant_domain (tenant_id, domain, purpose)
       VALUES ($1, $2, $3)
       ON CONFLICT (domain) DO UPDATE SET purpose = EXCLUDED.purpose`,
      [vaniTenantId, domain, purpose],
    );
    return;
  }

  // vani:team and vani:llm_provider stay disabled in the catalog (see
  // lanes.ts for why) — isStepOfLane() rejects them before we ever get here.
  // When they are enabled, their writers go here, inside this same transaction.
}

export function createOnboardingRouter(pool: Pool): Router {
  const router = Router();

  /** Resolve the lane from ?lane=, defaulting to the legacy GTM lane. */
  function resolveLane(raw: unknown): Lane | null {
    return getLane(typeof raw === 'string' && raw ? raw : 'gtm');
  }

  /* ── GET /api/v1/onboarding/status?lane=vani ───────────────────────── */

  router.get('/status', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } });
        return;
      }

      const lane = resolveLane(req.query.lane);
      if (!lane) {
        res.status(400).json({ error: { code: 'UNKNOWN_LANE', message: 'No such onboarding lane' } });
        return;
      }

      const stored = await pool.query(
        `SELECT step_id, status, completed_at, metadata FROM vn_tenant_onboarding
         WHERE tenant_id = $1`,
        [jwt.tenant_id],
      );
      const byId = new Map(stored.rows.map((r: any) => [r.step_id, r]));

      // Reconcile the catalog against what is stored. A step with no row is
      // pending — an absence, not a gap. Nothing is inserted on read.
      const steps = requiredSteps(lane).map((s) => {
        const row = byId.get(s.step_id);
        return {
          step_id: s.step_id,
          title: s.title,
          summary: s.summary,
          story: s.story ?? null,
          status: row?.status === 'completed' ? 'completed' : 'pending',
          completed_at: row?.completed_at ?? null,
        };
      });

      const nextIncomplete = steps.find((s) => s.status !== 'completed');

      res.json({
        lane: { id: lane.id, title: lane.title, scope: lane.scope },
        complete: !nextIncomplete,
        steps,
        next_incomplete_step: nextIncomplete ? nextIncomplete.step_id : null,
      });
    } catch (err: any) {
      console.error('[Onboarding:status]', err);
      res.status(500).json({ error: { code: 'FETCH_FAILED', message: 'Failed to get onboarding status' } });
    }
  });

  /* ── PATCH /api/v1/onboarding/step ─────────────────────────────────── */

  router.patch('/step', async (req, res) => {
    const client = await pool.connect();
    try {
      const jwt = extractJwt(req);
      if (!jwt) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } });
        return;
      }

      const { step_id, status, data, metadata } = req.body ?? {};
      if (!step_id || status !== 'completed') {
        res.status(400).json({
          error: { code: 'INVALID_INPUT', message: 'step_id and status "completed" required' },
        });
        return;
      }

      const lane = resolveLane(req.body?.lane ?? req.query.lane);
      if (!lane) {
        res.status(400).json({ error: { code: 'UNKNOWN_LANE', message: 'No such onboarding lane' } });
        return;
      }

      // Only a declared, enabled step of this lane may be written. Without this
      // the endpoint is an arbitrary-row writer keyed on a string from the client.
      if (!isStepOfLane(lane, step_id)) {
        res.status(400).json({
          error: { code: 'STEP_NOT_FOUND', message: `Step "${step_id}" is not a step of lane "${lane.id}"` },
        });
        return;
      }

      await client.query('BEGIN');

      // The step's own data and the completion mark: one transaction.
      await applyStepPayload(
        client,
        step_id,
        jwt.tenant_id,
        jwt.user_id,
        (data ?? {}) as Record<string, unknown>,
      );

      // Upsert, not update. The row may not exist — pending steps are absences
      // for every lane but the legacy one. This is also what makes a replayed
      // request land on the same row rather than creating a second.
      await client.query(
        `INSERT INTO vn_tenant_onboarding (id, tenant_id, step_id, status, completed_at, metadata, created_at)
         VALUES (gen_random_uuid(), $1, $2, 'completed', now(), COALESCE($3::jsonb, '{}'::jsonb), now())
         ON CONFLICT (tenant_id, step_id) DO UPDATE
           SET status = 'completed',
               completed_at = now(),
               metadata = COALESCE(EXCLUDED.metadata, vn_tenant_onboarding.metadata)`,
        [jwt.tenant_id, step_id, metadata ? JSON.stringify(metadata) : null],
      );

      const stored = await client.query(
        `SELECT step_id FROM vn_tenant_onboarding
         WHERE tenant_id = $1 AND status = 'completed'`,
        [jwt.tenant_id],
      );
      const done = new Set(stored.rows.map((r: any) => r.step_id));

      await client.query('COMMIT');

      const next = requiredSteps(lane).find((s) => !done.has(s.step_id));

      res.json({
        step: { step_id, status: 'completed' },
        lane: lane.id,
        next_step: next ? next.step_id : null,
        onboarding_complete: !next,
      });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      if (err instanceof StepPayloadError) {
        // The tenant can act on these (fix the domain, pick another) — a
        // blanket 500 would read as "the system is broken", which it is not.
        res.status(err.status).json({ error: { code: err.code, message: err.message } });
        return;
      }
      console.error('[Onboarding:step]', err);
      res.status(500).json({ error: { code: 'UPDATE_FAILED', message: 'Failed to update onboarding step' } });
    } finally {
      client.release();
    }
  });

  return router;
}
