/**
 * Scores stored where they are read (POA D-Q4–D-Q8, release 3):
 *
 *   pool company       gt_universe_companies.coverage_score / coverage_parts
 *                      (migration 266) — always the PLATFORM default
 *   tenant's company   gt_prospects.score / score_reasons (migration 196) —
 *                      the tenant's own profile, or the default
 *
 * The stored parts are compact ({ level, parts: { identity: [earned, weight] … },
 * profile, at }); the item-by-item evidence is recomputed for the one company a
 * person opens — 600k rows of evidence would cost more than it explains.
 *
 * Re-scoring is plain arithmetic over columns: no model, no tokens. It runs on
 * the worker (SCORE_REFRESH_REQUESTED) after a profile change, a delivery
 * lands, or the admin asks; the pool's matching job scores each company it
 * re-tests as it goes.
 */
import type { Pool, PoolClient } from 'pg';
import { withTenantClient } from '../db';
import { appendStep } from '../agent-core/agent.runner';
import { completeTest, type GoldenForTest } from '../etl/complete-test';
import { computeScore, type ScoreInput, type ScoreProfile, type ScoreResult } from './score';
import { platformProfile, resolveProfile } from './profiles';

const CHUNK = 1000;

export function compact(r: ScoreResult): Record<string, unknown> {
  return {
    level: r.level, level_reason: r.level_reason,
    parts: Object.fromEntries(r.parts.map((p) => [p.key, [p.earned, p.weight]])),
    profile: r.profile, at: new Date().toISOString(),
  };
}

/** A pool company row → what the score reads. */
export function poolInput(c: Record<string, any>): ScoreInput {
  return {
    ...c,
    complete: c.lifecycle_state === 'complete',
    people_named: 0, people_titled: 0, researched: false, signals: 0, exit_gate: false,
  };
}

/** Score the given pool companies with the platform default (inside the caller's transaction). */
export async function scorePoolCompanies(client: PoolClient | Pool, ids: string[], profile?: ScoreProfile): Promise<number> {
  if (!ids.length) return 0;
  const prof = profile ?? await platformProfile(client);
  const rows = (await client.query(`SELECT * FROM gt_universe_companies WHERE id = ANY($1::bigint[])`, [ids])).rows;
  for (const c of rows) {
    const r = computeScore(poolInput(c), prof, { pool: true });
    await client.query(
      `UPDATE gt_universe_companies SET coverage_score = $2, coverage_parts = $3::jsonb WHERE id = $1`,
      [c.id, r.score, JSON.stringify(compact(r))]);
  }
  return rows.length;
}

/** Every pool company, in chunks, with the platform default. */
export async function rescorePool(pool: Pool, onChunk?: (done: number) => Promise<void>): Promise<number> {
  const prof = await platformProfile(pool);
  let after = '0';
  let done = 0;
  for (;;) {
    const ids = (await pool.query<{ id: string }>(
      `SELECT id::text FROM gt_universe_companies WHERE id > $1 AND merged_into_id IS NULL ORDER BY id LIMIT $2`,
      [after, CHUNK])).rows.map((r) => r.id);
    if (!ids.length) return done;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      done += await scorePoolCompanies(client, ids, prof);
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
    after = ids[ids.length - 1];
    await onChunk?.(done);
  }
}

/** A tenant's company (gt_prospects + what the tenant knows about it) → what the score reads. */
export function prospectInput(p: Record<string, any>): ScoreInput {
  // The pool copy's verdict when the company came from the pool; otherwise the
  // Complete test on the tenant's own fields (a tenant list rarely says
  // company-or-individual, so enrichment decides it — release 4).
  const complete = p.pool_state === 'complete' || completeTest({
    name: p.name, name_key: p.name_key, domain_normalized: p.domain_normalized, domain_status: p.pool_domain_status ?? null,
    cin: null, llpin: null, gstin: null, pin: p.pin, city: p.city, state_code: p.state_code,
    industry_id: p.industry_id, nic_codes: null, is_individual: p.pool_is_individual ?? null, legal_status: null,
    duplicate_of_id: null, needs_review: false, linked_sources: 1,
  } as GoldenForTest).complete;
  return {
    name: p.name, domain_normalized: p.domain_normalized, domain_status: p.pool_domain_status ?? null,
    city: p.city, state_code: p.state_code, pin: p.pin, address_line: p.address_line,
    is_individual: p.pool_is_individual ?? null, industry_id: p.industry_id,
    employees_band: p.employees_band, revenue_band: p.revenue_band, description: p.description,
    year_founded: p.year_founded, linkedin_url: p.linkedin_url, email: p.email, phone: p.phone,
    complete,
    people_named: Number(p.people_named ?? 0), people_titled: Number(p.people_titled ?? 0),
    researched: Boolean(p.researched), signals: 0, exit_gate: false,
  };
}

const PROSPECTS = `
  SELECT p.*, u.lifecycle_state AS pool_state, u.domain_status AS pool_domain_status, u.is_individual AS pool_is_individual,
         (SELECT count(*) FROM gt_contacts c WHERE c.tenant_id = p.tenant_id AND c.prospect_id = p.id AND c.is_active) AS people_named,
         (SELECT count(*) FROM gt_contacts c WHERE c.tenant_id = p.tenant_id AND c.prospect_id = p.id AND c.is_active
             AND coalesce(trim(c.job_title), '') <> '') AS people_titled,
         EXISTS (SELECT 1 FROM gt_account_briefs b WHERE b.tenant_id = p.tenant_id AND b.prospect_id = p.id
                    AND b.status IN ('drafted', 'approved')) AS researched
    FROM gt_prospects p
    LEFT JOIN gt_universe_companies u ON u.id = p.universe_company_id
   WHERE p.tenant_id = $1 AND p.is_active AND p.id > $2
   ORDER BY p.id LIMIT $3`;

/** Every company of one tenant, with the tenant's profile in force. */
export async function rescoreTenant(pool: Pool, tenantId: string, onChunk?: (done: number) => Promise<void>): Promise<number> {
  const prof = await resolveProfile(pool, tenantId);
  let after = '0';
  let done = 0;
  for (;;) {
    const n = await withTenantClient(pool, tenantId, async (c) => {
      const rows = (await c.query(PROSPECTS, [tenantId, after, CHUNK])).rows;
      for (const p of rows) {
        const r = computeScore(prospectInput(p), prof);
        await c.query(
          `UPDATE gt_prospects SET score = $3, score_reasons = $4::jsonb WHERE tenant_id = $1 AND id = $2`,
          [tenantId, p.id, r.score, JSON.stringify(compact(r))]);
      }
      if (rows.length) after = String(rows[rows.length - 1].id);
      return rows.length;
    });
    if (!n) return done;
    done += n;
    await onChunk?.(done);
  }
}

/** One tenant company, scored now with the evidence — for the record a person opens. */
export async function explainProspect(pool: Pool, tenantId: string, prospectId: string): Promise<ScoreResult | null> {
  const prof = await resolveProfile(pool, tenantId);
  return withTenantClient(pool, tenantId, async (c) => {
    const rows = (await c.query(PROSPECTS.replace('AND p.id > $2', 'AND p.id = $2'), [tenantId, prospectId, 1])).rows;
    return rows[0] ? computeScore(prospectInput(rows[0]), prof) : null;
  });
}

/** One pool company, scored now with the evidence. */
export async function explainPoolCompany(pool: Pool, companyId: string): Promise<ScoreResult | null> {
  const prof = await platformProfile(pool);
  const c = (await pool.query(`SELECT * FROM gt_universe_companies WHERE id = $1`, [companyId])).rows[0];
  return c ? computeScore(poolInput(c), prof, { pool: true }) : null;
}

/**
 * SCORE_REFRESH_REQUESTED — the worker job. payload.scope: 'pool' (admin) or
 * 'tenant' (the emitting tenant's companies).
 */
export async function runScoreRefreshJob(
  pool: Pool, tenantId: string, payload: Record<string, unknown>, runId: string | number,
): Promise<number> {
  const scope = payload.scope === 'pool' ? 'pool' : 'tenant';
  const note = (done: number) => appendStep(pool, runId, {
    step_name: 'score_chunk', action: `Scored ${done.toLocaleString('en-US')} ${scope === 'pool' ? 'pool companies' : 'companies'} so far`, status: 'ok',
  });
  const n = scope === 'pool' ? await rescorePool(pool, note) : await rescoreTenant(pool, tenantId, note);
  await appendStep(pool, runId, { step_name: 'score', action: `Re-scored ${n.toLocaleString('en-US')} ${scope === 'pool' ? 'pool companies with the platform default' : 'companies'}`, status: 'ok' });
  return n;
}
