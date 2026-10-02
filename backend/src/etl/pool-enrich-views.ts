/**
 * What the enrichment screens read (release 4, prototype p2c-pool-enrich.html):
 *
 *   workbench   tab 1 — VaNi's suggestion, the pool by level, Qualified or
 *               better, websites, today's records, the gaps and what fills
 *               them, deliveries, runs
 *   runView     tabs 3 and 4 — one run live (feed, before/now, counts), then
 *               what it did (by part, models, not read and why, withdraw)
 *   provenance  tab 5 — where each value of a pool company came from
 *
 * Read-only. Numbers are counted from the pool as it is; nothing is cached.
 */
import type { Pool } from 'pg';
import { withTenantClient } from '../db';
import { platformProfile } from '../scoring/profiles';
import { counts, EVENT, LEVELS, recordLimit, snapshot, type CompanyResult, type Snapshot } from './pool-enrich';

const LIVE = `c.merged_into_id IS NULL AND c.lifecycle_state <> 'junk'`;
const QUALIFIED_PLUS = `coalesce(c.coverage_parts->>'level', 'raw') IN ('qualified', 'reachable', 'campaign_ready', 'strong')`;
const READ_BY_A_RUN = `EXISTS (SELECT 1 FROM gt_universe_company_sources s
                         JOIN gt_source_loads l ON l.id = s.load_id AND l.status = 'active' AND l.load_kind = 'enrichment'
                        WHERE s.company_id = c.id AND s.raw ? 'run_event')`;

/* ── Runs ──────────────────────────────────────────────────────────────── */

export interface RunSummary {
  event_id: string; run_no: number; delivery_label: string; records: number;
  status: 'queued' | 'running' | 'finished' | 'stopped' | 'failed' | 'withdrawn';
  created_at: string; attempted: number; before_avg: number | null; after_avg: number | null;
}

function statusOf(run: { status: string } | null, cp: Record<string, any> | null, eventStatus?: string): RunSummary['status'] {
  if (cp?.withdrawn_at) return 'withdrawn';
  if (!run) return eventStatus === 'failed' ? 'stopped' : 'queued';   // stopped before a worker took it
  if (run.status === 'completed') return cp?.stopped ? 'stopped' : 'finished';
  if (run.status === 'failed') return 'failed';
  return run.status === 'queued' ? 'queued' : 'running';
}

export async function listRuns(pool: Pool, limit = 20): Promise<RunSummary[]> {
  const rows = (await pool.query<any>(
    `SELECT e.id::text AS event_id, e.payload, e.created_at, e.status AS event_status, r.status, r.checkpoint
       FROM gt_events e
       LEFT JOIN LATERAL (SELECT status, checkpoint FROM gt_agent_runs WHERE event_id = e.id ORDER BY id DESC LIMIT 1) r ON true
      WHERE e.event_type = $1 ORDER BY e.created_at DESC LIMIT $2`, [EVENT, limit])).rows;
  return rows.map((r) => ({
    event_id: r.event_id, run_no: Number(r.payload.run_no), delivery_label: r.payload.delivery_label, records: Number(r.payload.records),
    status: statusOf(r.status ? { status: r.status } : null, r.checkpoint, r.event_status), created_at: r.created_at,
    attempted: Number(r.checkpoint?.attempted ?? 0), before_avg: r.checkpoint?.before?.avg ?? null, after_avg: r.checkpoint?.after?.avg ?? null,
  }));
}

/* ── Tab 1: the workbench ──────────────────────────────────────────────── */

export async function workbench(pool: Pool) {
  const t = (await pool.query<any>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE ${QUALIFIED_PLUS})::int AS qualified_plus,
            count(*) FILTER (WHERE c.domain_normalized IS NOT NULL)::int AS with_website,
            count(*) FILTER (WHERE c.domain_normalized IS NOT NULL AND c.website IS NULL
                               AND c.email ILIKE '%@' || c.domain_normalized)::int AS website_from_email,
            count(*) FILTER (WHERE c.industry_id IS NULL AND coalesce(cardinality(c.nic_codes), 0) = 0)::int AS gap_industry,
            count(*) FILTER (WHERE c.is_individual IS NULL)::int AS gap_type,
            count(*) FILTER (WHERE c.domain_normalized IS NOT NULL AND NOT EXISTS (
                     SELECT 1 FROM gt_universe_company_sources s
                       JOIN gt_source_loads l ON l.id = s.load_id AND l.status = 'active' AND l.load_kind = 'enrichment'
                      WHERE s.company_id = c.id AND (s.email IS NOT NULL OR s.phone IS NOT NULL)))::int AS gap_contact,
            count(*) FILTER (WHERE c.domain_normalized IS NULL)::int AS gap_website
       FROM gt_universe_companies c WHERE ${LIVE}`)).rows[0];
  const lv = (await pool.query<{ level: string; n: number }>(
    `SELECT coalesce(c.coverage_parts->>'level', 'raw') AS level, count(*)::int AS n FROM gt_universe_companies c WHERE ${LIVE} GROUP BY 1`)).rows;
  const levels = Object.fromEntries(LEVELS.map((l) => [l, lv.find((x) => x.level === l)?.n ?? 0]));

  const deliveries = (await pool.query<any>(
    `SELECT l.id::text, l.label, l.as_of, l.loaded_at, d.code AS source_code,
            count(DISTINCT c.id)::int AS companies,
            count(DISTINCT c.id) FILTER (WHERE ${QUALIFIED_PLUS})::int AS qualified_plus,
            count(DISTINCT c.id) FILTER (WHERE c.domain_normalized IS NOT NULL
                                           AND coalesce(c.coverage_parts->>'level', 'raw') IN ('raw', 'identified')
                                           AND NOT ${READ_BY_A_RUN})::int AS eligible
       FROM gt_source_loads l
       JOIN gt_data_sources d ON d.id = l.source_id
       LEFT JOIN gt_universe_company_sources s ON s.load_id = l.id
       LEFT JOIN gt_universe_companies c ON c.id = s.company_id AND ${LIVE}
      WHERE l.tenant_id IS NULL AND l.status = 'active' AND l.load_kind = 'delivery'
      GROUP BY l.id, d.code ORDER BY companies DESC, l.id`)).rows;

  const best = deliveries.filter((d) => d.eligible > 0).sort((a, b) => b.eligible - a.eligible)[0];
  const runs = await listRuns(pool);
  const profile = await platformProfile(pool);
  return {
    total: t.total, levels, qualified_plus: t.qualified_plus, with_website: t.with_website, website_from_email: t.website_from_email,
    profile: { version: profile.version },
    limit: await recordLimit(pool),
    gaps: [
      { key: 'industry', label: 'Industry not mapped', companies: t.gap_industry, filled_by: 'site read', enrich: { raw_or_identified: true, industry_missing: true } },
      { key: 'type', label: 'Company or individual unknown', companies: t.gap_type, filled_by: 'site read', enrich: { raw_or_identified: true, industry_missing: false } },
      { key: 'contact', label: 'No company email / phone from the site', companies: t.gap_contact, filled_by: 'site read (contact)', enrich: { raw_or_identified: true, industry_missing: false } },
      { key: 'website', label: 'No website at all', companies: t.gap_website, filled_by: 'domain lookup · not yet (E5)', enrich: null },
    ],
    deliveries: deliveries.map((d) => ({
      id: d.id, label: d.label, source_code: d.source_code, companies: d.companies, qualified_plus: d.qualified_plus,
      qualified_pct: d.companies ? Math.round((100 * d.qualified_plus) / d.companies) : 0, as_of: d.as_of, loaded_at: d.loaded_at, eligible: d.eligible,
    })),
    runs,
    suggestion: best ? {
      delivery: best.id, delivery_label: best.label, eligible: best.eligible, records: Math.min(100, best.eligible),
    } : null,
  };
}

/* ── Tabs 3 and 4: one run ─────────────────────────────────────────────── */

const KINDS = new Set(['plan', 'check', 'read', 'skip', 'move', 'bad', 'done', 'restore']);

export async function runView(pool: Pool, tenantId: string, eventId: string) {
  const ev = (await pool.query<any>(
    `SELECT id::text, payload, created_at, status, error FROM gt_events WHERE id = $1 AND event_type = $2`, [eventId, EVENT])).rows[0];
  if (!ev) return null;
  const runs = (await pool.query<any>(
    `SELECT id::text, status, steps, checkpoint, started_at, completed_at, duration_ms, error_trace
       FROM gt_agent_runs WHERE event_id = $1 ORDER BY id`, [eventId])).rows;
  const last = runs[runs.length - 1] ?? null;
  const cp = last?.checkpoint ?? null;
  const ids: string[] = (ev.payload.company_ids ?? []).map(String);
  const status = statusOf(last, cp, ev.status);
  const finished = ['finished', 'stopped', 'withdrawn'].includes(status);
  const done: Record<string, CompanyResult> = cp?.done ?? {};
  const c = counts({ done });

  // The feed: the run's own steps, plus the router's moves, in order.
  const feed = runs.flatMap((r: any) => (r.steps ?? []) as any[])
    .filter((s) => KINDS.has(s.step_name) || s.step_name === 'llm_route')
    .map((s) => ({ ts: s.ts, kind: s.step_name === 'llm_route' ? 'move' : s.step_name, text: s.action, model: s.output_summary ?? null, status: s.status }));

  // Models and tokens, from the router's own record of every call.
  const calls = await withTenantClient(pool, tenantId, async (cl) => (await cl.query<any>(
    `SELECT provider_code, model, step, outcome, count(*)::int AS n, coalesce(sum(prompt_tokens + answer_tokens), 0)::bigint AS tokens
       FROM gt_llm_calls WHERE run_id = ANY($1::text[]) GROUP BY 1, 2, 3, 4`, [runs.map((r: any) => r.id)])).rows);
  const byProvider = new Map<string, { provider: string; model: string; companies: number; tokens: number; bad: number; quota_spent: boolean }>();
  for (const x of calls) {
    const p = byProvider.get(x.provider_code) ?? { provider: x.provider_code, model: x.model, companies: 0, tokens: 0, bad: 0, quota_spent: false };
    p.tokens += Number(x.tokens);
    if (x.step === 'pool_read' && x.outcome === 'ok') p.companies += x.n;
    if (x.outcome === 'invalid') p.bad += x.n;
    if (x.outcome === 'rate_limited') p.quota_spent = true;
    byProvider.set(x.provider_code, p);
  }
  for (const f of feed) {
    if (f.kind !== 'move') continue;
    for (const p of byProvider.values()) if (new RegExp(`\\b${p.provider}\\b[^;]*(spent|quota|429)`, 'i').test(f.text)) p.quota_spent = true;
  }
  const models = [...byProvider.values()].sort((a, b) => b.companies - a.companies);
  const tokens = models.reduce((n, m) => n + m.tokens, 0);
  const paidTokens = models.filter((m) => m.provider === 'haiku').reduce((n, m) => n + m.tokens, 0);

  const before: Snapshot | null = cp?.before ?? (ids.length ? await snapshot(pool, ids) : null);
  const now: Snapshot | null = finished && cp?.after ? cp.after : ids.length ? await snapshot(pool, ids) : null;
  const touched = Object.values(done).filter((r) => r.outcome === 'read' || r.outcome === 'js_only' || r.outcome === 'not_live' || r.outcome === 'abstained').length;
  const started = runs[0]?.started_at ?? null;
  const ended = cp?.finished_at ?? last?.completed_at ?? null;

  return {
    event_id: eventId, run_no: Number(ev.payload.run_no), delivery_label: ev.payload.delivery_label, records: ids.length,
    status, created_at: ev.created_at, started_at: started, finished_at: finished ? ended : null,
    duration_ms: started && ended ? new Date(ended).getTime() - new Date(started).getTime() : null,
    progress: { done: Object.keys(done).length, total: ids.length },
    counts: { ...c, unreadable: c.js_only + c.not_live, not_reached: status === 'stopped' ? ids.length - Object.keys(done).length : 0 },
    before, now,
    feed, models, bad_answers: models.reduce((n, m) => n + m.bad, 0), tokens, paid_tokens: paidTokens,
    estimate: ev.payload.estimate ?? null, stopped: cp?.stopped ?? (!last && ev.status === 'failed' ? ev.error ?? 'STOPPED_BY_PERSON' : null),
    stop_requested_at: cp?.stop_requested_at ?? null,
    error: last?.status === 'failed' ? String(last.error_trace ?? '').split('\n')[0].slice(0, 400) : null,
    withdrawn_at: cp?.withdrawn_at ?? null, touched,
    abstained: Object.entries(done).filter(([, r]) => r.outcome === 'abstained').map(([id, r]) => ({ company_id: id, name: r.name })),
  };
}

/* ── Tab 5: where each value came from ─────────────────────────────────── */

const LABEL: Record<string, string> = {
  industry_id: 'Industry', description: 'What it does', email: 'Company email', phone: 'Phone',
  linkedin_url: 'LinkedIn', twitter_url: 'X', facebook_url: 'Facebook', is_individual: 'Company or individual',
  employees_band: 'Size', domain_status: 'Website checked', website: 'Website', address_line: 'Address', city: 'City',
};
const ORDER = ['industry_id', 'description', 'email', 'phone', 'linkedin_url', 'twitter_url', 'facebook_url', 'is_individual', 'employees_band', 'domain_status'];

/**
 * For each field a person reads first: its value, and where it came from —
 * "run #1 · /about · groq · gpt-oss-120b · 0.91", or the delivery that said
 * it. Where a delivery and a run disagree, the delivery wins and the run's
 * value is named beside it ("wins over the site's …").
 */
export function provenance(company: Record<string, any>, sources: Array<Record<string, any>>, industryName: string | null) {
  const fs: Record<string, { row?: number }> = company.field_sources ?? {};
  const byId = new Map(sources.map((s) => [Number(s.id), s]));
  const enrichment = sources.filter((s) => s.load_kind === 'enrichment' && s.load_status === 'active' && s.raw?.run_event);
  const show = (f: string, v: unknown) => (f === 'industry_id' ? industryName : f === 'is_individual' ? (v === true ? 'individual' : v === false ? 'company' : null) : v);
  const from = (s: Record<string, any>, f: string): string => {
    if (s.load_kind !== 'enrichment') return `${s.source_name ?? s.source_code} delivery`;
    const page = s.raw?.pages?.[f] ?? s.raw?.where?.[f] ?? null;
    const conf = s.raw?.confidence?.[f];
    const who = s.method === 'llm' ? (s.model ?? 'model') : s.raw?.confirmed_by && (f === 'email' || f === 'phone') ? 'page text' : 'code';
    return [`run #${s.raw?.run_no}`, page, who, conf != null ? Number(conf).toFixed(2) : null].filter(Boolean).join(' · ');
  };
  const rows: Array<{ field: string; label: string; value: string; from: string; wins_over?: string }> = [];
  for (const f of ORDER) {
    const w = fs[f]?.row ? byId.get(Number(fs[f].row)) : undefined;
    const v = show(f, company[f]);
    if (!w || v === null || v === undefined || v === '') continue;
    const row: (typeof rows)[number] = { field: f, label: LABEL[f] ?? f, value: String(v), from: from(w, f) };
    if (w.load_kind !== 'enrichment') {
      const other = enrichment.find((s) => s[f] != null && String(s[f]) !== String(company[f]));
      if (other) row.wins_over = String(show(f, other[f]));
    }
    rows.push(row);
    if (f === 'industry_id') {
      const raw = sources.find((s) => s.load_kind === 'delivery' && s.industry_raw);
      if (raw) rows.push({ field: 'industry_raw', label: 'Industry (raw)', value: `"${raw.industry_raw}"`, from: `${raw.source_name ?? raw.source_code} delivery · kept as delivered` });
    }
  }
  const lastRead = enrichment.filter((s) => s.method === 'crawl').sort((a, b) => Number(b.raw?.run_no ?? 0) - Number(a.raw?.run_no ?? 0))[0];
  return {
    rows,
    enrichment: lastRead ? {
      run_no: Number(lastRead.raw.run_no), event_id: lastRead.raw.run_event, site: lastRead.raw.site as 'live' | 'js_only' | 'not_live',
      reason: lastRead.raw.reason ?? null, before: lastRead.raw.before ?? null, refreshed_at: company.last_enriched_at ?? null,
    } : null,
  };
}
