/**
 * The common pool's merge step: per-source rows → golden companies → the
 * Complete test. Common pool P1 sprint B (POA §4 P1; P0 §1, §2.5, §4).
 *
 *   gt_universe_company_sources   one row per source per company (landing.ts writes)
 *        │  match ladder (P0 §4) — company_id is set, never anything else
 *        ▼
 *   gt_universe_companies         the golden record, derived field by field
 *        │  Complete test (complete-test.ts)
 *        ▼
 *   lifecycle_state = complete    THE CORE POOL (S1); everything else is staging
 *
 * Rules this file keeps:
 *  - Source rows are never edited except to record which company they resolved
 *    to (company_id). Raw stays raw.
 *  - Duplicates are FLAGGED, never merged (D-P3): rung 2b (same domain, a
 *    different name — FTCCI's sister companies) and rung 5 (a near name in the
 *    same state) create a new company with duplicate_of_id and needs_review.
 *  - The golden record is DERIVED: every run rewrites it from its active
 *    sources, so a re-tuned tier or a retired delivery is one re-run away.
 *  - Idempotent and resumable: a row is unresolved while company_id IS NULL,
 *    so a crashed job resumes by running again. Chunks are serialised by an
 *    advisory lock, so two jobs cannot both create the same company.
 */
import type { Pool, PoolClient } from 'pg';
import { appendStep } from '../agent-core/agent.runner';
import { scorePoolCompanies } from '../scoring/rescore';
import { completeTest, type GoldenForTest } from './complete-test';
import { readPoolConfig, type PoolConfig } from './pool.config';

const RESOLVE_LOCK = 0x706f6f6c; // 'pool' — one resolver at a time

// Scalar fields survivorship decides, in golden-record column order.
const SCALARS = [
  'name', 'domain_normalized', 'website', 'email', 'phone', 'address_line', 'city',
  'state_code', 'pin', 'country', 'employees_band', 'revenue_band', 'linkedin_url',
  'year_founded', 'description', 'cin', 'llpin', 'gstin', 'legal_status', 'company_class',
  'incorporated_on', 'paid_up_capital_inr', 'is_individual', 'is_foreign', 'twitter_url',
  'facebook_url', 'domain_status',
] as const;
const ARRAYS = ['nic_codes', 'role_emails', 'phones'] as const;

export type Rung = 'cin' | 'domain' | 'domain_flag' | 'name_pin' | 'name_city' | 'name_flag' | 'new';

export interface ResolveCounts { resolved: number; linked: number; created: number; flagged: number; companies: number }

interface SourceRow {
  id: string; name: string; name_key: string | null; domain_normalized: string | null;
  cin: string | null; llpin: string | null; gstin: string | null;
  pin: string | null; city: string | null; state_code: string | null;
}

/** Find the company a source row belongs to. Exported for tests. */
export async function matchSource(client: PoolClient, s: SourceRow, cfg: PoolConfig):
  Promise<{ rung: Rung; companyId: string | null; flagOf: string | null }> {
  // 1 — a registry identity.
  if (s.cin || s.llpin || s.gstin) {
    const r = await client.query(
      `SELECT id::text FROM gt_universe_companies
        WHERE merged_into_id IS NULL
          AND ((cin = $1) OR (llpin = $2) OR (gstin = $3))
        ORDER BY id LIMIT 1`, [s.cin, s.llpin, s.gstin]);
    if (r.rows[0]) return { rung: 'cin', companyId: r.rows[0].id, flagOf: null };
  }
  const nk = s.name_key ?? '';
  // 2 / 2b — the same domain. The same name ⇒ the same company; a different
  // name on one website is a sister company or a division: flagged, not linked.
  if (s.domain_normalized) {
    const r = await client.query(
      `SELECT id::text, similarity(COALESCE(name_key,''), $2) AS sim FROM gt_universe_companies
        WHERE merged_into_id IS NULL AND domain_normalized = $1
        ORDER BY sim DESC, id LIMIT 1`, [s.domain_normalized, nk]);
    const hit = r.rows[0];
    if (hit) {
      return Number(hit.sim) >= cfg.matchDomainNameMin
        ? { rung: 'domain', companyId: hit.id, flagOf: null }
        : { rung: 'domain_flag', companyId: null, flagOf: hit.id };
    }
  }
  if (!nk) return { rung: 'new', companyId: null, flagOf: null };
  // 3 — the same name and PIN.
  if (s.pin) {
    const r = await client.query(
      `SELECT id::text FROM gt_universe_companies
        WHERE merged_into_id IS NULL AND name_key = $1 AND pin = $2 ORDER BY id LIMIT 1`, [nk, s.pin]);
    if (r.rows[0]) return { rung: 'name_pin', companyId: r.rows[0].id, flagOf: null };
  }
  // 4 — a near-identical name in the same city.
  if (s.city) {
    const r = await client.query(
      `SELECT id::text FROM gt_universe_companies
        WHERE merged_into_id IS NULL AND lower(city) = lower($2)
          AND similarity(COALESCE(name_key,''), $1) >= $3
        ORDER BY similarity(COALESCE(name_key,''), $1) DESC, id LIMIT 1`, [nk, s.city, cfg.matchLinkMin]);
    if (r.rows[0]) return { rung: 'name_city', companyId: r.rows[0].id, flagOf: null };
  }
  // 5 — a similar name in the same state: a person decides.
  if (s.state_code) {
    const r = await client.query(
      `SELECT id::text FROM gt_universe_companies
        WHERE merged_into_id IS NULL AND state_code = $2
          AND similarity(COALESCE(name_key,''), $1) >= $3
        ORDER BY similarity(COALESCE(name_key,''), $1) DESC, id LIMIT 1`, [nk, s.state_code, cfg.matchReviewMin]);
    if (r.rows[0]) return { rung: 'name_flag', companyId: null, flagOf: r.rows[0].id };
  }
  return { rung: 'new', companyId: null, flagOf: null };
}

/**
 * Rewrite each company from its ACTIVE sources: per field, the value from the
 * most trusted source (load tier_override, else the source's tier), then the
 * freshest, then the latest row. Lists are unioned. Industry falls back to the
 * delivery's default (a vertical directory classifies itself) with that said
 * in field_sources.
 */
export async function rederive(client: PoolClient, companyIds: string[]): Promise<void> {
  if (!companyIds.length) return;
  const r = await client.query(
    `SELECT s.*, s.id::text AS sid, s.company_id::text AS cid, ds.code AS source_code,
            COALESCE(l.tier_override, ds.tier) AS eff_tier,
            COALESCE(s.source_as_of, l.as_of) AS as_of, l.default_industry_id, l.load_kind
       FROM gt_universe_company_sources s
       JOIN gt_source_loads l ON l.id = s.load_id AND l.status = 'active'
       JOIN gt_data_sources ds ON ds.id = s.source_id
      WHERE s.company_id = ANY($1::bigint[])`, [companyIds]);
  const byCompany = new Map<string, any[]>();
  for (const row of r.rows) {
    const list = byCompany.get(row.cid) ?? [];
    list.push(row);
    byCompany.set(row.cid, list);
  }
  const asTime = (d: any) => (d ? new Date(d).getTime() : -Infinity);
  // A person's decision is a source row (pool-decisions.ts) that speaks for
  // ONE field only; it never competes for any other.
  const speaksFor = (x: any, f: string) => !x.raw?.decision || x.raw.decision === f;
  for (const [cid, rows] of byCompany) {
    // What an enrichment run read (a site, a model) ranks below anything a
    // delivery said, whatever the tiers (D-Q19 E1): the site's phone never
    // replaces the directory's, both are kept, and the run can be withdrawn.
    // A person's decision is not an enrichment reading and keeps its tier.
    const read = (x: any) => (x.load_kind === 'enrichment' && !x.raw?.decision ? 1 : 0);
    rows.sort((a, b) => (read(a) - read(b)) || (b.eff_tier - a.eff_tier) || (asTime(b.as_of) - asTime(a.as_of)) || (Number(b.sid) - Number(a.sid)));
    const set: Record<string, unknown> = {};
    const fieldSources: Record<string, unknown> = {};
    const present = (v: unknown) => v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '');
    for (const f of SCALARS) {
      const win = rows.find((x) => speaksFor(x, f) && present(x[f]));
      set[f] = win ? win[f] : null;
      if (win) fieldSources[f] = { source: win.source_code, row: Number(win.sid), as_of: win.as_of };
    }
    const nameWin = rows.find((x) => speaksFor(x, 'name') && present(x.name));
    set.name_key = nameWin?.name_key ?? null;
    for (const f of ARRAYS) {
      const all = new Set<string>();
      for (const x of rows) if (speaksFor(x, f)) for (const v of (x[f] ?? []) as string[]) if (present(v)) all.add(v);
      set[f] = [...all];
    }
    const ind = rows.find((x) => speaksFor(x, 'industry_id') && x.industry_id);
    const indDefault = ind ? null : rows.find((x) => !x.raw?.decision && x.default_industry_id);
    set.industry_id = ind?.industry_id ?? indDefault?.default_industry_id ?? null;
    if (ind) fieldSources.industry_id = { source: ind.source_code, row: Number(ind.sid), as_of: ind.as_of };
    else if (indDefault) fieldSources.industry_id = { source: indDefault.source_code, via: 'delivery default', as_of: indDefault.as_of };
    const codes = [...new Set(rows.map((x) => x.source_code))];
    const asOfs = rows.map((x) => x.as_of).filter(Boolean).map((d) => new Date(d).getTime());
    const cols = [...SCALARS, 'name_key', ...ARRAYS, 'industry_id'];
    const params: unknown[] = cols.map((c) => set[c]);
    params.push(JSON.stringify(fieldSources), codes, asOfs.length ? new Date(Math.max(...asOfs)) : null, cid);
    const n = cols.length;
    await client.query(
      `UPDATE gt_universe_companies SET
         ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')},
         field_sources = $${n + 1}::jsonb, source_codes = $${n + 2}::text[],
         best_as_of = $${n + 3}::date, updated_at = now()
       WHERE id = $${n + 4}`, params);
  }
}

/**
 * Run the Complete test on each company and set its lifecycle. Junk stays junk
 * (a person's decision); 'enriching' stays while it is still incomplete.
 */
export async function assess(client: PoolClient, companyIds: string[]): Promise<void> {
  if (!companyIds.length) return;
  const r = await client.query(
    `SELECT c.*, c.id::text AS cid,
            (SELECT count(*) FROM gt_universe_company_sources s
               JOIN gt_source_loads l ON l.id = s.load_id AND l.status = 'active'
              -- Deliveries only: a decision or an enrichment reading is not a
              -- source the company was matched from.
              WHERE s.company_id = c.id AND l.load_kind = 'delivery' AND NOT (s.raw ? 'decision'))::int AS linked_sources
       FROM gt_universe_companies c WHERE c.id = ANY($1::bigint[])`, [companyIds]);
  for (const c of r.rows) {
    const result = completeTest(c as GoldenForTest);
    let state: string;
    if (c.lifecycle_state === 'junk') state = 'junk';
    else if (result.complete) state = 'complete';
    else if (result.needs_person || result.checks.some((k) => k.status === 'fail')) state = 'held';
    else state = c.lifecycle_state === 'enriching' ? 'enriching' : 'candidate';
    await client.query(
      `UPDATE gt_universe_companies
          SET lifecycle_state = $2::text,
              admitted_at = CASE WHEN $2::text = 'complete' THEN COALESCE(admitted_at, now()) ELSE NULL END,
              complete_checks = $3::jsonb, updated_at = now()
        WHERE id = $1`,
      [c.cid, state, JSON.stringify({ passed: result.passed, total: result.total, checks: result.checks, at: new Date().toISOString() })]);
  }
  // Re-tested, so re-scored: the readiness score reads the lifecycle just set
  // (release 3, platform default — the pool is never scored by a tenant's profile).
  await scorePoolCompanies(client, companyIds);
}

/**
 * Resolve one chunk of unresolved pool source rows (optionally of one
 * delivery), then re-derive and assess every company it touched. One
 * transaction; returns null when nothing was left.
 */
export async function resolveChunk(pool: Pool, loadId: number | null, cfg = readPoolConfig()):
  Promise<ResolveCounts | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [RESOLVE_LOCK]);
    const rows = (await client.query(
      `SELECT s.id::text, s.name, s.name_key, s.domain_normalized, s.cin, s.llpin, s.gstin,
              s.pin, s.city, s.state_code
         FROM gt_universe_company_sources s
         JOIN gt_source_loads l ON l.id = s.load_id
        WHERE s.company_id IS NULL AND l.tenant_id IS NULL AND l.status = 'active'
          AND ($1::bigint IS NULL OR s.load_id = $1)
        ORDER BY s.id LIMIT $2`, [loadId, cfg.resolveChunkRows])).rows as SourceRow[];
    if (!rows.length) { await client.query('COMMIT'); return null; }

    const touched = new Set<string>();
    const counts: ResolveCounts = { resolved: 0, linked: 0, created: 0, flagged: 0, companies: 0 };
    for (const s of rows) {
      const m = await matchSource(client, s, cfg);
      let cid = m.companyId;
      if (!cid) {
        // Born with its identity fields, so the next row in this same chunk
        // can match it (two rows with one CIN must not make two companies).
        // Everything is re-derived from the sources below.
        const ins = await client.query(
          `INSERT INTO gt_universe_companies
             (name, name_key, domain_normalized, cin, llpin, gstin, pin, city, state_code, duplicate_of_id, needs_review)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id::text`,
          [s.name, s.name_key, s.domain_normalized, s.cin, s.llpin, s.gstin, s.pin, s.city, s.state_code,
           m.flagOf, Boolean(m.flagOf)]);
        cid = ins.rows[0].id as string;
        counts.created++;
        if (m.flagOf) counts.flagged++;
      } else {
        counts.linked++;
      }
      await client.query(`UPDATE gt_universe_company_sources SET company_id = $1, updated_at = now() WHERE id = $2`, [cid, s.id]);
      touched.add(cid!);
      counts.resolved++;
    }
    const ids = [...touched];
    await rederive(client, ids);
    await assess(client, ids);
    counts.companies = ids.length;
    await client.query('COMMIT');
    return counts;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** One transaction on the pool tables, serialised with the resolver. */
export async function withPoolTx<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [RESOLVE_LOCK]);
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Re-derive and re-assess companies in chunks (after a tier change, a retired delivery, a decision). */
export async function reassessAll(pool: Pool, cfg = readPoolConfig(), onlyIds?: string[]): Promise<number> {
  let after = '0';
  let total = 0;
  for (;;) {
    const ids = onlyIds
      ? (total ? [] : onlyIds)
      : (await pool.query(
        `SELECT id::text FROM gt_universe_companies WHERE merged_into_id IS NULL AND id > $1 ORDER BY id LIMIT $2`,
        [after, cfg.resolveChunkRows])).rows.map((r) => r.id as string);
    if (!ids.length) return total;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [RESOLVE_LOCK]);
      await rederive(client, ids);
      await assess(client, ids);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    total += ids.length;
    after = ids[ids.length - 1];
  }
}

/**
 * POOL_RESOLVE_REQUESTED — the worker job. Emitted after a common-pool
 * delivery lands, and by the admin's "Resolve the pool" action (load_id
 * omitted = every delivery; reassess = also re-derive every company).
 */
export async function runPoolResolveJob(
  pool: Pool, _tenantId: string, payload: Record<string, unknown>, runId: string | number,
): Promise<ResolveCounts> {
  const cfg = readPoolConfig();
  const loadId = payload.load_id == null ? null : Number(payload.load_id);
  const total: ResolveCounts = { resolved: 0, linked: 0, created: 0, flagged: 0, companies: 0 };
  for (;;) {
    const c = await resolveChunk(pool, loadId, cfg);
    if (!c) break;
    for (const k of Object.keys(total) as Array<keyof ResolveCounts>) total[k] += c[k];
    await appendStep(pool, runId, {
      step_name: 'resolve_chunk',
      action: `Matched ${c.resolved} source rows: ${c.linked} to existing companies, ${c.created} new (${c.flagged} flagged as possible duplicates)`,
      status: 'ok',
    });
  }
  if (payload.reassess === true) {
    const n = await reassessAll(pool, cfg);
    await appendStep(pool, runId, { step_name: 'reassess', action: `Re-derived and re-tested ${n} companies`, status: 'ok' });
  }
  const states = await pool.query(
    `SELECT lifecycle_state, count(*)::int AS n FROM gt_universe_companies WHERE merged_into_id IS NULL GROUP BY 1 ORDER BY 1`);
  await appendStep(pool, runId, {
    step_name: 'resolve',
    action: `Pool now: ${states.rows.map((r) => `${r.lifecycle_state} ${r.n}`).join(', ') || 'empty'}`,
    status: 'ok',
  });
  return total;
}
