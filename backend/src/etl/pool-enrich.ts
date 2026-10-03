/**
 * Enriching the common pool — release 4 (P2-C), the prototype
 * documents/prototypes/p2c-pool-enrich.html made real. Decisions D-Q19 E1–E7.
 *
 *   slice → estimate → start → the run (worker, POOL_ENRICH_REQUESTED) →
 *   what it did → withdraw
 *
 * One company at a time:
 *   check   the site answers and is not a parked page          code
 *   read    About, Contact, Products                          code (lib/site-reader)
 *   LOW     which emails, phones, social links are its own    route LOW
 *   HIGH    what it does, industry, company or individual,
 *           B2B/B2C, size, a small graph                      route HIGH
 *   write   two ENRICHMENT source rows (crawl = what code read, llm_pass = what
 *           a model read), each value labelled with page, model and
 *           confidence; the pool graph (271); then re-derive, Complete test,
 *           score — exactly as a delivery would be
 *
 * The rules the prototype promised, and where they live:
 *   - Records, not tokens (E4): ENRICH_POOL_DAILY_RECORDS a UTC day; the
 *     model calls are `meter: 'pool'`, never any tenant's budget.
 *   - Only companies that have a website (E5); a JavaScript-only site is
 *     "unreadable", named, not guessed at (E6).
 *   - Ranked below what a delivery said (E1): rederive puts enrichment loads
 *     after delivery loads (pool-merge.ts). Nothing is overwritten.
 *   - A run is two loads (load_kind 'enrichment'); withdrawing retires both
 *     and takes back its graph facts; the run stays in the history.
 *   - Below ENRICH_POOL_MIN_CONFIDENCE nothing is written for that field; a
 *     company with nothing above it is "abstained" and waits for a person.
 *   - No model left today → the run STOPS and says so (LLM_ROUTE_EXHAUSTED);
 *     the companies it did not reach are released from today's records.
 *   - A worker restart resumes: a run is keyed by its EVENT; the next run of
 *     the same event picks up the checkpoint and skips what is done.
 *
 * The pool's tables have no tenant_id; the admin gate in pool-skill is the
 * protection. The run belongs to the admin's tenant (its gt_agent_runs and
 * gt_llm_calls rows), which is who started it — never who pays for it.
 */
import type { Pool, PoolClient } from 'pg';
import { withTenantClient } from '../db';
import { appendStep, saveCheckpoint } from '../agent-core/agent.runner';
import { callLLMValidated } from '../agent-core/llm.client';
import { readRouterConfig } from '../agent-core/llm.router.config';
import { readRouteState } from '../agent-core/llm.router';
import { charsPerToken } from '../agent-core/llm.gate';
import { emitEvent } from '../agent-core/event.store';
import * as site from '../lib/site-reader';
import { readEnrichConfig, type EnrichConfig } from './enrich.config';
import { assess, rederive, withPoolTx } from './pool-merge';
import { withdrawPoolRun, writePoolGraph, type PoolEdgeIn } from './pool-graph';
import * as R from './pool-enrich-read';
import { readWorkerConfig } from '../agent-core/worker.config';

export const EVENT = 'POOL_ENRICH_REQUESTED' as const;
export const LEVELS = ['raw', 'identified', 'qualified', 'reachable', 'campaign_ready', 'strong'] as const;
type Level = typeof LEVELS[number];
const PARTS = ['identity', 'firmographics', 'digital', 'contact'] as const;
const rank = (l: string | null | undefined) => Math.max(0, LEVELS.indexOf((l ?? 'raw') as Level));
const fmt = (n: number) => n.toLocaleString('en-US');

export class EnrichError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'EnrichError'; }
}

/* ── The slice ─────────────────────────────────────────────────────────── */

export interface Slice {
  /** A delivery's load id, or 'all'. */
  delivery: string;
  /** Only companies at Raw or Identified. */
  raw_or_identified: boolean;
  /** Only companies with no industry. */
  industry_missing: boolean;
}

/**
 * Companies a run may read: live (not merged, not junk), with a website (E5),
 * not read yet by a run that still stands, in the delivery and filters chosen.
 */
function sliceWhere(slice: Slice): { where: string; params: unknown[] } {
  const params: unknown[] = [];
  const w = [
    `c.merged_into_id IS NULL`, `c.lifecycle_state <> 'junk'`, `c.domain_normalized IS NOT NULL`,
    `NOT EXISTS (SELECT 1 FROM gt_universe_company_sources s
                   JOIN gt_source_loads l ON l.id = s.load_id AND l.status = 'active' AND l.load_kind = 'enrichment'
                  WHERE s.company_id = c.id AND s.raw ? 'run_event')`,
    // Not already promised to a run that is queued or still reading.
    `NOT EXISTS (SELECT 1 FROM gt_events e WHERE e.event_type = 'POOL_ENRICH_REQUESTED' AND e.status IN ('pending', 'processing')
                  AND e.payload->'company_ids' ? c.id::text)`,
  ];
  if (slice.delivery && slice.delivery !== 'all') {
    params.push(Number(slice.delivery));
    w.push(`EXISTS (SELECT 1 FROM gt_universe_company_sources s WHERE s.company_id = c.id AND s.load_id = $${params.length})`);
  }
  if (slice.raw_or_identified) w.push(`coalesce(c.coverage_parts->>'level', 'raw') IN ('raw', 'identified')`);
  if (slice.industry_missing) w.push(`c.industry_id IS NULL AND coalesce(cardinality(c.nic_codes), 0) = 0`);
  return { where: w.join(' AND '), params };
}

export function readSlice(p: Record<string, unknown>): Slice {
  const d = String(p.delivery ?? 'all').trim() || 'all';
  if (d !== 'all' && !/^\d+$/.test(d)) throw new EnrichError('BAD_SLICE', 'delivery must be a delivery id or "all".');
  return { delivery: d, raw_or_identified: p.raw_or_identified !== false, industry_missing: p.industry_missing === true };
}

export async function countSlice(pool: Pool, slice: Slice): Promise<number> {
  const { where, params } = sliceWhere(slice);
  return (await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM gt_universe_companies c WHERE ${where}`, params)).rows[0].n;
}

async function sliceIds(pool: Pool, slice: Slice, limit: number): Promise<string[]> {
  const { where, params } = sliceWhere(slice);
  params.push(limit);
  return (await pool.query<{ id: string }>(
    `SELECT c.id::text FROM gt_universe_companies c WHERE ${where} ORDER BY c.id LIMIT $${params.length}`, params)).rows.map((r) => r.id);
}

/* ── Today's records (E4) ──────────────────────────────────────────────── */

/**
 * Records used today: a run that finished counts the companies it reached; one
 * still queued or running counts everything it reserved.
 */
export async function recordsUsedToday(pool: Pool): Promise<number> {
  const rows = (await pool.query<{ records: number; status: string | null; attempted: number | null }>(
    `SELECT (e.payload->>'records')::int AS records,
            CASE WHEN r.status IS NULL AND e.status = 'failed' THEN 'failed' ELSE r.status END AS status,
            (r.checkpoint->>'attempted')::int AS attempted
       FROM gt_events e
       LEFT JOIN LATERAL (SELECT status, checkpoint FROM gt_agent_runs WHERE event_id = e.id ORDER BY id DESC LIMIT 1) r ON true
      WHERE e.event_type = $1
        AND e.created_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`, [EVENT])).rows;
  return rows.reduce((n, r) => n + (r.status === 'completed' || r.status === 'failed' ? (r.attempted ?? 0) : r.records), 0);
}

export async function recordLimit(pool: Pool) {
  const daily = readEnrichConfig().dailyRecords;
  const used = await recordsUsedToday(pool);
  return { daily, used, left: Math.max(0, daily - used) };
}

/* ── Industries the HIGH call may answer ───────────────────────────────── */

async function industryList(db: Pool | PoolClient): Promise<{ names: string[]; idOf: Map<string, number>; nameOf: Map<number, string> }> {
  const rows = (await db.query<{ id: number; name: string }>(
    `SELECT id, name FROM gt_industries WHERE is_active ORDER BY sort_order, name`)).rows;
  const idOf = new Map<string, number>();
  const nameOf = new Map<number, string>();
  for (const r of rows) { if (!idOf.has(r.name.toLowerCase())) idOf.set(r.name.toLowerCase(), r.id); nameOf.set(r.id, r.name); }
  return { names: [...new Set(rows.map((r) => r.name))], idOf, nameOf };
}

/* ── The estimate (tab 2, card 3) ──────────────────────────────────────── */

export interface ProviderLine { code: string; model: string; companies: number; text: string; off: boolean; paid: boolean }
export interface Estimate {
  records: number; limit: { daily: number; used: number; left: number };
  per_company: { high: number; low: number; measured: boolean };
  tokens: number;
  providers: ProviderLine[];
  unplaced: number;
  minutes: number | null;
  minutes_measured: boolean;
}

export async function estimate(pool: Pool, tenantId: string, records: number): Promise<Estimate> {
  const cfg = readEnrichConfig();
  const limit = await recordLimit(pool);
  const rcfg = readRouterConfig();
  const state = await readRouteState(pool, 'enrichment');
  const cpt = charsPerToken();

  // Measured from earlier runs where there are some; the planned ceiling otherwise.
  const m = await withTenantClient(pool, tenantId, async (c) => ({
    steps: (await c.query<{ step: string; t: number; n: number }>(
      `SELECT step, avg(prompt_tokens + answer_tokens)::int AS t, count(*)::int AS n FROM gt_llm_calls
        WHERE purpose = 'enrichment' AND step IN ('pool_read', 'pool_contacts') AND outcome = 'ok'
          AND created_at > now() - interval '30 days' GROUP BY step`)).rows,
    latency: (await c.query<{ provider_code: string; s: number }>(
      `SELECT provider_code, (avg(latency_ms) / 1000.0)::float AS s FROM gt_llm_calls
        WHERE purpose = 'enrichment' AND step = 'pool_read' AND outcome = 'ok' AND latency_ms IS NOT NULL
          AND created_at > now() - interval '30 days' GROUP BY provider_code`)).rows,
  }));
  const ind = await industryList(pool);
  const tpl = R.readingPrompt('', '', ind.names, []);
  const plannedHigh = Math.ceil((tpl.system.length + tpl.user.length) / cpt) + cfg.readTokens + cfg.highMaxTokens;
  const lowTpl = R.contactsPrompt('', '', Array.from({ length: 6 }, () => ({ kind: 'phone' as const, value: '+91 00 0000 0000', where: '/contact' })));
  const plannedLow = Math.ceil((lowTpl.system.length + lowTpl.user.length) / cpt) + cfg.lowMaxTokens;
  const mh = m.steps.find((s) => s.step === 'pool_read');
  const ml = m.steps.find((s) => s.step === 'pool_contacts');
  const high = mh?.t ?? plannedHigh;
  const low = ml?.t ?? plannedLow;

  let remaining = records;
  let seconds = 0;
  let timed = true;
  const providers: ProviderLine[] = [];
  for (const code of rcfg.routes.high) {
    const p = rcfg.providers[code];
    if (!p) continue;
    const st = state[code];
    const base = { code, model: p.model, paid: p.paid };
    if (!st?.enabled) {
      providers.push({ ...base, companies: 0, off: true, text: p.paid ? 'off — nothing is paid' : 'switched off for enrichment' });
      continue;
    }
    const capTokens = p.tpd > 0 ? Math.floor(Math.max(0, p.tpd - st.tokensToday) / high) : Infinity;
    const capCalls = p.daily > 0 ? Math.max(0, p.daily - st.callsToday) : Infinity;
    const cap = Math.min(capTokens, capCalls);
    const take = Math.min(cap, remaining);
    remaining -= take;
    const lat = m.latency.find((l) => l.provider_code === code)?.s;
    if (lat) seconds += take * lat; else if (take > 0) timed = false;
    let text: string;
    if (cap === Infinity) {
      text = take > 0 ? `the rest, one at a time${lat ? ` ≈ ${Math.round(lat)} s each` : ' — speed measured after the first run'}` : 'not needed';
    } else if (cap === 0) {
      text = capTokens <= capCalls ? `today's ${fmt(p.tpd)} tokens are spent` : `today's ${fmt(p.daily)} requests are spent`;
    } else {
      text = capTokens <= capCalls
        ? `≈ ${fmt(take)} companies before its ${fmt(Math.round(p.tpd / 1000))}K tokens/day run out`
        : `≈ ${fmt(take)} companies (${fmt(p.daily)} ${p.paid ? '' : 'free '}requests a day)`;
    }
    if (p.paid) text += ' — paid per token';
    providers.push({ ...base, companies: take, off: false, text });
  }

  // A finished run's real pace beats the sum of model latencies (it includes reading the pages).
  const pace = (await pool.query<{ s: number | null }>(
    `SELECT avg(r.duration_ms / 1000.0 / nullif((r.checkpoint->>'attempted')::int, 0))::float AS s
       FROM gt_agent_runs r WHERE r.agent_name = $1 AND r.status = 'completed' AND r.created_at > now() - interval '30 days'`, [EVENT])).rows[0].s;
  const minutes = pace ? Math.ceil((records * pace) / 60) : timed && seconds > 0 ? Math.ceil(seconds / 60) : null;
  return {
    records, limit, per_company: { high, low, measured: Boolean(mh) }, tokens: records * (high + low),
    providers, unplaced: remaining, minutes, minutes_measured: Boolean(pace),
  };
}

/* ── Start ─────────────────────────────────────────────────────────────── */

/**
 * The run that is queued or reading now, if any. Pool runs share the free
 * models' quotas and the one platform model, so ONE runs at a time, platform-wide
 * (Charan, 2026-10-03: "we should not allow more than 1 to run").
 */
export async function activeRun(pool: Pool): Promise<{ event_id: string; run_no: number } | null> {
  const r = (await pool.query<{ event_id: string; run_no: number }>(
    `SELECT id::text AS event_id, (payload->>'run_no')::int AS run_no FROM gt_events
      WHERE event_type = $1 AND status IN ('pending', 'processing') ORDER BY created_at LIMIT 1`, [EVENT])).rows[0];
  return r ?? null;
}

export async function startEnrichRun(pool: Pool, tenantId: string, userId: string, slice: Slice, records: number) {
  if (!Number.isInteger(records) || records < 1) throw new EnrichError('BAD_RECORDS', 'Say how many companies this run reads (a whole number ≥ 1).');
  const busy = await activeRun(pool);
  if (busy) {
    throw new EnrichError('ANOTHER_RUN_ACTIVE',
      `Run #${busy.run_no} is still queued or running — one enrichment run at a time. Open it from the pool page, let it finish or stop it, then start this one.`);
  }
  const limit = await recordLimit(pool);
  if (records > limit.left) {
    throw new EnrichError('DAILY_RECORDS_SPENT',
      `Only ${fmt(limit.left)} of today's ${fmt(limit.daily)} records are left (ENRICH_POOL_DAILY_RECORDS). Start a smaller run, or tomorrow.`);
  }
  const ids = await sliceIds(pool, slice, records);
  if (!ids.length) throw new EnrichError('EMPTY_SLICE', 'No company in this slice is waiting to be read — pick another slice.');
  // Rebuilt from the real quota left now (prototype: "The estimate is rebuilt … when you press Start").
  const est = await estimate(pool, tenantId, ids.length);
  const label = slice.delivery === 'all' ? 'All deliveries'
    : (await pool.query<{ label: string }>(`SELECT label FROM gt_source_loads WHERE id = $1`, [Number(slice.delivery)])).rows[0]?.label ?? `delivery #${slice.delivery}`;
  const runNo = (await pool.query<{ n: number }>(`SELECT count(*)::int + 1 AS n FROM gt_events WHERE event_type = $1`, [EVENT])).rows[0].n;
  const eventId = await emitEvent(pool, tenantId, 'POOL_ENRICH_REQUESTED', 'human', {
    run_no: runNo, slice, delivery_label: label, records: ids.length, company_ids: ids, estimate: est, requested_by: userId,
  }, `enrich-${runNo}`);
  return { event_id: eventId, run_no: runNo, records: ids.length, estimate: est };
}

/* ── Snapshots: levels, average, parts ─────────────────────────────────── */

export interface Snapshot { levels: Record<Level, number>; avg: number; parts: Record<string, number>; weights: Record<string, number>; n: number }

export async function snapshot(db: Pool | PoolClient, ids: string[]): Promise<Snapshot> {
  const rows = ids.length ? (await db.query<{ level: string; score: number | null; parts: Record<string, [number, number]> | null }>(
    `SELECT coalesce(coverage_parts->>'level', 'raw') AS level, coverage_score AS score, coverage_parts->'parts' AS parts
       FROM gt_universe_companies WHERE id = ANY($1::bigint[])`, [ids])).rows : [];
  const levels = Object.fromEntries(LEVELS.map((l) => [l, 0])) as Record<Level, number>;
  const parts: Record<string, number> = Object.fromEntries(PARTS.map((p) => [p, 0]));
  const weights: Record<string, number> = Object.fromEntries(PARTS.map((p) => [p, 0]));
  let sum = 0;
  for (const r of rows) {
    levels[(LEVELS as readonly string[]).includes(r.level) ? r.level as Level : 'raw']++;
    sum += Number(r.score ?? 0);
    for (const p of PARTS) {
      parts[p] += Number(r.parts?.[p]?.[0] ?? 0);
      weights[p] = Math.max(weights[p], Number(r.parts?.[p]?.[1] ?? 0));   // the part's weight in the profile that scored it
    }
  }
  const n = rows.length || 1;
  for (const p of PARTS) parts[p] = Math.round((parts[p] / n) * 10) / 10;
  return { levels, avg: Math.round(sum / n), parts, weights, n: rows.length };
}

/* ── The run ───────────────────────────────────────────────────────────── */

export type Outcome = 'read' | 'js_only' | 'not_live' | 'abstained' | 'failed' | 'stopped';
export interface CompanyResult {
  outcome: Outcome; name: string; detail?: string; model?: string | null;
  before: { score: number; level: string }; after?: { score: number; level: string };
}

interface RunState {
  run_no: number; event_id: string; loads: { crawl: number; llm: number }; company_ids: string[];
  before: Snapshot; done: Record<string, CompanyResult>; attempted: number; started_at: string;
  run_ids: string[]; stopped?: string; finished_at?: string; after?: Snapshot;
}

async function makeLoads(pool: Pool, runNo: number): Promise<{ crawl: number; llm: number }> {
  return withPoolTx(pool, async (client) => {
    const src = (await client.query<{ code: string; id: number }>(`SELECT code, id FROM gt_data_sources WHERE code IN ('crawl', 'llm_pass')`)).rows;
    const id = (code: string) => {
      const s = src.find((x) => x.code === code);
      if (!s) throw new EnrichError('NO_ENRICHMENT_SOURCE', `The "${code}" data source is missing (migration 264).`);
      return s.id;
    };
    const mk = async (code: string, what: string) => Number((await client.query<{ id: string }>(
      `INSERT INTO gt_source_loads (source_id, label, tenant_id, load_kind, as_of) VALUES ($1, $2, NULL, 'enrichment', current_date) RETURNING id`,
      [id(code), `Enrichment run #${runNo} · ${what}`])).rows[0].id);
    return { crawl: await mk('crawl', 'read from the site'), llm: await mk('llm_pass', 'read by a model') };
  });
}

const RUN_LOCK = 0x656e7231; // 'enr1' — one enrichment run reads at a time, across every worker

/** POOL_ENRICH_REQUESTED — the worker job. */
export async function runPoolEnrichJob(pool: Pool, tenantId: string, payload: Record<string, unknown>, runId: string | number): Promise<void> {
  // Held on its own connection for the whole run: a second run claimed in the
  // same batch, or by a second worker, is refused with the reason instead of
  // reading alongside. A worker that dies frees the lock with its connection.
  const lock = await pool.connect();
  try {
    const got = (await lock.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [RUN_LOCK])).rows[0].ok;
    if (!got) {
      throw new EnrichError('ANOTHER_RUN_ACTIVE',
        'Another enrichment run is reading right now — this one did not start, and read nothing. Start it again when that one finishes.');
    }
    try { await runLocked(pool, tenantId, payload, runId); }
    finally { await lock.query('SELECT pg_advisory_unlock($1)', [RUN_LOCK]).catch(() => {}); }
  } finally {
    lock.release();
  }
}

async function runLocked(pool: Pool, tenantId: string, payload: Record<string, unknown>, runId: string | number): Promise<void> {
  const cfg = readEnrichConfig();
  const runIdS = String(runId);
  const eventId = (await pool.query<{ event_id: string | null }>(`SELECT event_id::text FROM gt_agent_runs WHERE id = $1`, [runId])).rows[0]?.event_id;
  if (!eventId) throw new EnrichError('NO_EVENT', `Run ${runId} has no event — an enrichment run is always started from one.`);
  const ids = (payload.company_ids as string[] | undefined)?.map(String) ?? [];
  const runNo = Number(payload.run_no);

  // Resume: the last run of this same event, if it got anywhere.
  const prev = (await pool.query<{ checkpoint: RunState | null }>(
    `SELECT checkpoint FROM gt_agent_runs WHERE event_id = $1 AND id <> $2 AND checkpoint ? 'loads' ORDER BY id DESC LIMIT 1`, [eventId, runId])).rows[0]?.checkpoint;
  let st: RunState;
  if (prev) {
    st = { ...prev, run_ids: [...(prev.run_ids ?? []), runIdS], stopped: undefined };
    await appendStep(pool, runId, { step_name: 'restore', action: `Resumed run #${runNo}: ${fmt(Object.keys(prev.done ?? {}).length)} of ${fmt(ids.length)} companies were already done`, status: 'ok' });
  } else {
    st = {
      run_no: runNo, event_id: eventId, loads: await makeLoads(pool, runNo), company_ids: ids,
      before: await snapshot(pool, ids), done: {}, attempted: 0, started_at: new Date().toISOString(), run_ids: [runIdS],
    };
  }
  await saveCheckpoint(pool, runId, st as unknown as Record<string, unknown>);

  const rcfg = readRouterConfig();
  const state = await readRouteState(pool, 'enrichment');
  // Every model's switch, said both ways — an "on" left unsaid was read as off.
  const route = rcfg.routes.high.map((c) => `${c} (${state[c]?.enabled ? (rcfg.providers[c]?.paid ? 'ON, paid' : 'ON') : 'off'})`).join(' → ');
  const lim = await recordLimit(pool);
  await appendStep(pool, runId, {
    step_name: 'plan',
    action: `Route HIGH for pool company facts: ${route}. ${fmt(ids.length)} records of today's ${fmt(lim.daily)}.`,
    status: 'ok',
  });

  const ind = await industryList(pool);
  for (const id of ids) {
    if (st.done[id]) continue;
    // A person may stop the run (pool-skill.stop_enrich_run): checked before
    // every company, so the one being read finishes and nothing is cut halfway.
    const stop = (await pool.query<{ at: string | null; by: string | null }>(
      `SELECT checkpoint->>'stop_requested_at' AS at, checkpoint->>'stop_requested_by' AS by FROM gt_agent_runs WHERE id = $1`, [runId])).rows[0];
    if (stop?.at) {
      st.stopped = `STOPPED_BY_PERSON: stopped at ${stop.at}`;
      await appendStep(pool, runId, { step_name: 'move', action: `Stopped by a person — ${fmt(ids.length - Object.keys(st.done).length)} companies not reached, released from today's records`, status: 'ok' });
      break;
    }
    let res: CompanyResult;
    try {
      res = await enrichOne(pool, tenantId, runIdS, st, id, cfg, ind);
    } catch (e) {
      const msg = (e as Error).message;
      if (/^LLM_ROUTE_EXHAUSTED/.test(msg)) {
        // No model left today: stop, say so, and release what was not reached.
        st.stopped = msg;
        await appendStep(pool, runId, { step_name: 'move', action: `No model left for route HIGH or LOW — the run stops here. ${msg.slice(0, 400)}`, status: 'error' });
        break;
      }
      const name = (await pool.query<{ name: string }>(`SELECT name FROM gt_universe_companies WHERE id = $1`, [id])).rows[0]?.name ?? `#${id}`;
      res = { outcome: 'failed', name, detail: msg.slice(0, 300), before: { score: 0, level: 'raw' } };
      await appendStep(pool, runId, { step_name: 'bad', action: `${name}: failed — ${msg.slice(0, 200)}`, status: 'error' });
    }
    st.done[id] = res;
    st.attempted = Object.keys(st.done).length;
    await saveCheckpoint(pool, runId, { done: st.done, attempted: st.attempted });
  }

  st.finished_at = new Date().toISOString();
  st.after = await snapshot(pool, ids);
  const c = counts(st);
  await saveCheckpoint(pool, runId, { finished_at: st.finished_at, after: st.after, stopped: st.stopped ?? null, attempted: st.attempted });
  await appendStep(pool, runId, {
    step_name: 'done',
    action: `${fmt(st.attempted)} done · ${fmt(c.read)} read · ${fmt(c.js_only)} JavaScript-only · ${fmt(c.not_live)} not live · `
      + `${fmt(c.abstained)} abstained${c.failed ? ` · ${fmt(c.failed)} failed` : ''} · ${fmt(c.moved_up)} moved up a level`
      + (st.stopped ? ` · stopped: ${fmt(ids.length - st.attempted)} not reached, released from today's records` : ''),
    status: st.stopped ? 'error' : 'ok',
  });
}

export function counts(st: Pick<RunState, 'done'>) {
  const c = { read: 0, js_only: 0, not_live: 0, abstained: 0, failed: 0, moved_up: 0 };
  for (const r of Object.values(st.done ?? {})) {
    if (r.outcome in c) (c as any)[r.outcome]++;
    if (r.after && rank(r.after.level) > rank(r.before.level)) c.moved_up++;
  }
  return c;
}

/* ── One company ───────────────────────────────────────────────────────── */

async function enrichOne(
  pool: Pool, tenantId: string, runId: string, st: RunState, id: string, cfg: EnrichConfig,
  ind: { names: string[]; idOf: Map<string, number> },
): Promise<CompanyResult> {
  const c = (await pool.query<{ name: string; domain: string; score: number | null; level: string | null }>(
    `SELECT name, domain_normalized AS domain, coverage_score AS score, coverage_parts->>'level' AS level
       FROM gt_universe_companies WHERE id = $1`, [id])).rows[0];
  if (!c) return { outcome: 'failed', name: `#${id}`, detail: 'no longer in the pool', before: { score: 0, level: 'raw' } };
  const before = { score: Number(c.score ?? 0), level: c.level ?? 'raw' };
  const step = (step_name: string, action: string, model?: string | null, status: 'ok' | 'error' = 'ok') =>
    appendStep(pool, runId, { step_name, action, ...(model ? { output_summary: model } : {}), status });

  // 1 · Is the site live, and not a parked page?
  let home: Awaited<ReturnType<typeof site.fetchUrlText>> | null = null;
  let homeUrl = `https://${c.domain}/`;
  let failure = '';
  for (const u of [`https://${c.domain}/`, `http://${c.domain}/`]) {
    try { home = await site.fetchUrlText(u); homeUrl = u; break; }
    catch (e) { failure = (e as Error).message.replace(/^URL_[A-Z_]+: /, ''); }
  }
  const parked = home ? R.parkedReason(home.text) : null;
  if (!home || parked) {
    const reason = parked ?? `site down — ${failure.slice(0, 160)}`;
    await writeRows(pool, st, id, c.name, before, { site: 'not_live', reason }, null);
    await step('check', `${c.name}: ${c.domain} is ${parked ? 'a parked page' : 'not answering'} — marked "website not live"`);
    return { outcome: 'not_live', name: c.name, detail: reason, before, after: await scoreOf(pool, id) };
  }
  await step('check', `${c.name}: ${c.domain} is live`);

  // 2 · A JavaScript-only site has nothing to read without a browser (E6).
  const homePage = { path: '/', html: home.html, text: home.text };
  if (home.text.length < R.MIN_READABLE_CHARS) {
    const cands = R.contactCandidates([homePage], c.domain).filter((x) => x.kind !== 'email' && x.kind !== 'phone');
    await writeRows(pool, st, id, c.name, before, { site: 'js_only', social: cands }, null);
    await step('skip', `${c.name}: site is JavaScript-only — nothing to read without a browser (E6)`);
    return { outcome: 'js_only', name: c.name, before, after: await scoreOf(pool, id) };
  }

  // 3 · About, Contact, Products.
  const links = site.discoverSitePages(home.html, homeUrl, 40);
  const pages = [homePage];
  for (const u of R.pickPages(links, cfg.pagesPerCompany)) {
    try { const p = await site.fetchUrlText(u); if (p.text.length >= R.MIN_READABLE_CHARS) pages.push({ path: R.pathOf(u), html: p.html, text: p.text }); }
    catch { /* a page that does not answer is simply not read; the home page still is */ }
  }

  // 4 · LOW: which contacts are its own.
  const cands = R.contactCandidates(pages, c.domain);
  let own: R.Candidate[] = [];
  let lowModel: string | null = null;
  if (cands.length) {
    const lp = R.contactsPrompt(c.name, c.domain, cands);
    const ans = await callLLMValidated({
      tenantId, pool, runId, system: lp.system, messages: [{ role: 'user', content: lp.user }],
      maxTokens: cfg.lowMaxTokens, temperature: 0, priority: 'batch',
      route: 'low', dataClass: 'public_company', step: 'pool_contacts', purpose: 'enrichment', meter: 'pool',
      onServed: (s) => { lowModel = `${s.provider} · ${s.model}`; },
    }, R.contactsSchema(cands));
    own = cands.filter((x) => ans.own.includes(x.value));
  }

  // 5 · HIGH: what the company is.
  const budget = R.budgetSections(pages.map((p) => ({ path: p.path, text: p.text })), cfg.readTokens * charsPerToken());
  const hp = R.readingPrompt(c.name, c.domain, ind.names, budget.sections);
  let highModel: string | null = null;
  const reading = await callLLMValidated({
    tenantId, pool, runId, system: hp.system, messages: [{ role: 'user', content: hp.user }],
    maxTokens: cfg.highMaxTokens, temperature: 0, priority: 'batch',
    route: 'high', dataClass: 'public_company', step: 'pool_read', purpose: 'enrichment', meter: 'pool',
    onServed: (s) => { highModel = `${s.provider} · ${s.model}`; },
  }, R.readingSchema(ind.names, pages.map((p) => p.path)));

  // 6 · Write: only what is sure enough; nothing at all from the model when nothing is.
  const sure = (f: R.FactField) => Number(reading.confidence?.[f] ?? 0) >= cfg.minConfidence;
  const facts: ModelFacts = {
    description: sure('what_it_does') ? reading.what_it_does : null,
    industry_id: sure('industry') && reading.industry ? ind.idOf.get(reading.industry.toLowerCase()) ?? null : null,
    is_individual: sure('is_individual') ? reading.is_individual : null,
    employees_band: sure('employees_band') ? reading.employees_band ?? null : null,
  };
  const wrote = (Object.keys(facts) as Array<keyof ModelFacts>).filter((k) => facts[k] !== null && facts[k] !== undefined);
  const abstained = wrote.length === 0;
  await writeRows(pool, st, id, c.name, before,
    { site: 'live', social: own.filter((x) => x.kind !== 'email' && x.kind !== 'phone'), contacts: own.filter((x) => x.kind === 'email' || x.kind === 'phone'), model: lowModel },
    abstained ? null : { facts, reading, model: highModel!, graph: reading.graph ?? { nodes: [], edges: [] } });
  const read = pages.map((p) => p.path).filter((p) => p !== '/');
  if (abstained) {
    await step('bad', `${c.name}: read, but no model was sure enough — nothing written; waits for a person`, highModel);
    return { outcome: 'abstained', name: c.name, model: highModel, before, after: await scoreOf(pool, id) };
  }
  await step('read', `${c.name}: ${read.length ? read.join(', ') : 'home page'}`, highModel);
  return { outcome: 'read', name: c.name, model: highModel, before, after: await scoreOf(pool, id) };
}

interface ModelFacts { description: string | null; industry_id: number | null; is_individual: boolean | null; employees_band: string | null }
const FACT_PAGE: Record<keyof ModelFacts, R.FactField> = { description: 'what_it_does', industry_id: 'industry', is_individual: 'is_individual', employees_band: 'employees_band' };

async function scoreOf(pool: Pool, id: string) {
  const r = (await pool.query<{ score: number | null; level: string | null }>(
    `SELECT coverage_score AS score, coverage_parts->>'level' AS level FROM gt_universe_companies WHERE id = $1`, [id])).rows[0];
  return { score: Number(r?.score ?? 0), level: r?.level ?? 'raw' };
}

/**
 * The two enrichment source rows, the graph, then the company re-derived and
 * re-tested in one transaction — exactly what a delivery's rows go through.
 */
async function writeRows(
  pool: Pool, st: RunState, companyId: string, name: string, before: { score: number; level: string },
  crawl: { site: 'live' | 'js_only' | 'not_live'; reason?: string; social?: R.Candidate[]; contacts?: R.Candidate[]; model?: string | null },
  model: { facts: ModelFacts; reading: R.Reading; model: string; graph: NonNullable<R.Reading['graph']> } | null,
): Promise<void> {
  const recordId = `run:${st.event_id}:${companyId}`;
  const runBase = { run_event: st.event_id, run_no: st.run_no, run_id: st.run_ids[st.run_ids.length - 1], before };
  await withPoolTx(pool, async (client) => {
    const src = (await client.query<{ code: string; id: number }>(`SELECT code, id FROM gt_data_sources WHERE code IN ('crawl', 'llm_pass')`)).rows;
    const sid = (code: string) => src.find((x) => x.code === code)!.id;
    const emails = (crawl.contacts ?? []).filter((x) => x.kind === 'email');
    const phones = (crawl.contacts ?? []).filter((x) => x.kind === 'phone');
    const soc = (k: R.Candidate['kind']) => (crawl.social ?? []).find((x) => x.kind === k);
    const where: Record<string, string> = {};
    if (emails[0]) where.email = emails[0].where;
    if (phones[0]) where.phone = phones[0].where;
    for (const k of ['linkedin', 'twitter', 'facebook'] as const) { const s = soc(k); if (s) where[`${k}_url`] = s.where; }
    await client.query(
      `INSERT INTO gt_universe_company_sources
         (source_id, load_id, source_record_id, company_id, name, domain_status, email, role_emails, phone, phones,
          linkedin_url, twitter_url, facebook_url, method, model, raw, source_as_of)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10::text[], $11, $12, $13, 'crawl', $14, $15::jsonb, current_date)
       ON CONFLICT (source_id, source_record_id) DO UPDATE SET
         domain_status = EXCLUDED.domain_status, email = EXCLUDED.email, role_emails = EXCLUDED.role_emails,
         phone = EXCLUDED.phone, phones = EXCLUDED.phones, linkedin_url = EXCLUDED.linkedin_url,
         twitter_url = EXCLUDED.twitter_url, facebook_url = EXCLUDED.facebook_url, model = EXCLUDED.model,
         raw = EXCLUDED.raw, updated_at = now()`,
      [sid('crawl'), st.loads.crawl, recordId, companyId, name, crawl.site === 'not_live' ? null : 'found',
        emails[0]?.value ?? null, emails.map((x) => x.value), phones[0]?.value ?? null, phones.map((x) => x.value),
        soc('linkedin')?.value ?? null, soc('twitter')?.value ?? null, soc('facebook')?.value ?? null, crawl.model ?? null,
        JSON.stringify({ ...runBase, site: crawl.site, reason: crawl.reason ?? null, where, confirmed_by: crawl.model ?? null })]);
    if (model) {
      const f = model.facts;
      const pages: Record<string, string | null> = {};
      const confidence: Record<string, number | null> = {};
      for (const k of Object.keys(FACT_PAGE) as Array<keyof ModelFacts>) {
        if (f[k] === null || f[k] === undefined) continue;
        pages[k] = model.reading.pages?.[FACT_PAGE[k]] ?? null;
        confidence[k] = Number(model.reading.confidence?.[FACT_PAGE[k]] ?? 0);
      }
      const written = Object.values(confidence).filter((x): x is number => x !== null);
      await client.query(
        `INSERT INTO gt_universe_company_sources
           (source_id, load_id, source_record_id, company_id, name, description, industry_id, is_individual,
            employees_band, method, model, confidence, raw, source_as_of)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'llm', $10, $11, $12::jsonb, current_date)
         ON CONFLICT (source_id, source_record_id) DO UPDATE SET
           description = EXCLUDED.description, industry_id = EXCLUDED.industry_id, is_individual = EXCLUDED.is_individual,
           employees_band = EXCLUDED.employees_band, model = EXCLUDED.model, confidence = EXCLUDED.confidence,
           raw = EXCLUDED.raw, updated_at = now()`,
        [sid('llm_pass'), st.loads.llm, recordId, companyId, name, f.description, f.industry_id, f.is_individual,
          f.employees_band, model.model, written.length ? Math.min(...written) : null,
          JSON.stringify({ ...runBase, pages, confidence, b2b_b2c: model.reading.b2b_b2c ?? null, industry_answer: model.reading.industry })]);
      const g = model.graph;
      if (g.nodes.length) {
        await writePoolGraph(client, companyId,
          g.nodes.map((n) => ({ label: n.label, name: n.name.slice(0, 200), description: n.description ?? '', properties: { model: model.model, run_no: st.run_no } })),
          g.edges as PoolEdgeIn[], Number(runBase.run_id));
      }
    }
    await client.query(`UPDATE gt_universe_companies SET last_enriched_at = now() WHERE id = $1`, [companyId]);
    await rederive(client, [companyId]);
    await assess(client, [companyId]);
  });
}

/* ── Withdraw (tab 4) ──────────────────────────────────────────────────── */

export async function withdrawRun(pool: Pool, eventId: string, userId: string) {
  const runs = (await pool.query<{ id: string; status: string; checkpoint: RunState | null }>(
    `SELECT id::text, status, checkpoint FROM gt_agent_runs WHERE event_id = $1 ORDER BY id`, [eventId])).rows;
  const last = runs[runs.length - 1];
  if (!last?.checkpoint?.loads) throw new EnrichError('NOT_FOUND', 'This run never started, so there is nothing to withdraw.');
  if (last.status === 'running' || last.status === 'queued') throw new EnrichError('STILL_RUNNING', 'This run is still going — withdraw it once it finishes.');
  const loads = [last.checkpoint.loads.crawl, last.checkpoint.loads.llm];
  const out = await withPoolTx(pool, async (client) => {
    const retired = (await client.query(
      `UPDATE gt_source_loads SET status = 'retired', updated_at = now() WHERE id = ANY($1::bigint[]) AND status = 'active' AND load_kind = 'enrichment' RETURNING id`, [loads])).rowCount ?? 0;
    if (!retired) throw new EnrichError('ALREADY_WITHDRAWN', 'This run was already withdrawn.');
    const ids = (await client.query<{ id: string }>(
      `SELECT DISTINCT company_id::text AS id FROM gt_universe_company_sources WHERE load_id = ANY($1::bigint[]) AND company_id IS NOT NULL`, [loads])).rows.map((r) => r.id);
    await rederive(client, ids);
    await assess(client, ids);
    let graph = { nodes_removed: 0, edges_removed: 0, nodes_kept: 0, edges_kept: 0 };
    for (const r of runs) {
      const g = await withdrawPoolRun(client, r.id);
      graph = { nodes_removed: graph.nodes_removed + g.nodes_removed, edges_removed: graph.edges_removed + g.edges_removed, nodes_kept: graph.nodes_kept + g.nodes_kept, edges_kept: graph.edges_kept + g.edges_kept };
    }
    return { companies_rescored: ids.length, graph };
  });
  await saveCheckpoint(pool, last.id, { withdrawn_at: new Date().toISOString(), withdrawn_by: userId });
  return { event_id: eventId, run_no: last.checkpoint.run_no, ...out };
}

/* ── Stop (tab 3) ──────────────────────────────────────────────────────── */

/**
 * Stop a run between two companies. Queued (no worker has it yet): the event
 * is closed and nothing is read. Running: a stop is asked for; the company
 * being read finishes, the run ends "stopped", and the companies it did not
 * reach are released from today's records. What it already wrote stays — it
 * is withdrawn separately, if wanted.
 */
export async function stopRun(pool: Pool, eventId: string, userId: string) {
  const ev = (await pool.query<{ status: string }>(`SELECT status FROM gt_events WHERE id = $1 AND event_type = $2`, [eventId, EVENT])).rows[0];
  if (!ev) throw new EnrichError('NOT_FOUND', 'No enrichment run has this id.');
  const run = (await pool.query<{ id: string; status: string; checkpoint: Record<string, unknown> | null }>(
    `SELECT id::text, status, checkpoint FROM gt_agent_runs WHERE event_id = $1 ORDER BY id DESC LIMIT 1`, [eventId])).rows[0];
  if (!run) {
    const closed = (await pool.query(
      `UPDATE gt_events SET status = 'failed', processed_at = now(), error = $2 WHERE id = $1 AND status = 'pending' RETURNING id`,
      [eventId, `STOPPED_BY_PERSON: stopped before it started (${userId})`])).rowCount;
    if (closed) return { event_id: eventId, stopped: 'before_start' as const };
    throw new EnrichError('STARTING', 'The worker is picking this run up right now — try Stop again in a few seconds.');
  }
  if (run.status !== 'running' && run.status !== 'queued') throw new EnrichError('NOT_RUNNING', 'This run has already finished.');
  // Is a worker actually on it? Only a live worker can act on a stop request;
  // one that died left the run "running" with nobody to read the request.
  if (!(await workerAlive(pool, eventId))) {
    const now = new Date().toISOString();
    await pool.query(
      `UPDATE gt_events SET status = 'failed', processed_at = now(), error = $2
        WHERE id = $1 AND status IN ('pending', 'processing')`,
      [eventId, `STOPPED_BY_PERSON: closed by ${userId} — no worker was working on it`]);
    await pool.query(
      `UPDATE gt_agent_runs
          SET status = 'completed', completed_at = now(),
              checkpoint = coalesce(checkpoint, '{}'::jsonb) || $2::jsonb
        WHERE event_id = $1 AND status IN ('queued', 'running')`,
      [eventId, JSON.stringify({ stopped: 'STOPPED_BY_PERSON: closed — no worker was working on it', stop_requested_at: now, stop_requested_by: userId, finished_at: now })]);
    return { event_id: eventId, stopped: 'closed' as const };
  }
  if (run.checkpoint?.stop_requested_at) return { event_id: eventId, stopped: 'requested' as const };
  await saveCheckpoint(pool, run.id, { stop_requested_at: new Date().toISOString(), stop_requested_by: userId });
  return { event_id: eventId, stopped: 'requested' as const };
}

/** A worker is on this run: its event is claimed and the heartbeat is fresh. */
export async function workerAlive(pool: Pool, eventId: string): Promise<boolean> {
  const r = (await pool.query<{ alive: boolean }>(
    `SELECT (status = 'processing' AND started_at > now() - make_interval(secs => $2)) AS alive FROM gt_events WHERE id = $1`,
    [eventId, readWorkerConfig().staleClaimSeconds])).rows[0];
  return Boolean(r?.alive);
}
