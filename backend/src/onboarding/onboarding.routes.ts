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

  // vani:domain, vani:team, vani:llm_provider write to the vani_ spine and are
  // disabled in the catalog until it is confirmed applied — isStepOfLane()
  // rejects them before we ever get here. When they are enabled, their writers
  // go here, inside this same transaction.
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
      console.error('[Onboarding:step]', err);
      res.status(500).json({ error: { code: 'UPDATE_FAILED', message: 'Failed to update onboarding step' } });
    } finally {
      client.release();
    }
  });

  return router;
}
