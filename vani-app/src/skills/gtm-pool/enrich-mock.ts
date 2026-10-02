/**
 * Mock-mode fixtures for the enrichment screens (no session, pure UI work).
 * The numbers are the prototype's (documents/prototypes/p2c-pool-enrich.html)
 * so the screens can be held against it; nothing here is presented as real
 * data on the live transport.
 */
import type { EstimateResult, RunView, Snapshot, Workbench } from './useEnrich';

const LV = (a: number[]) => ({ raw: a[0], identified: a[1], qualified: a[2], reachable: a[3], campaign_ready: a[4], strong: a[5] });
const W = { identity: 20, firmographics: 20, digital: 10, contact: 20 };
const BEFORE: Snapshot = { levels: LV([22, 78, 0, 0, 0, 0]), avg: 24, parts: { identity: 12, firmographics: 3, digital: 4, contact: 5 }, weights: W, n: 100 };
const AFTER: Snapshot = { levels: LV([9, 40, 33, 18, 0, 0]), avg: 47, parts: { identity: 17, firmographics: 14, digital: 8, contact: 8 }, weights: W, n: 100 };

const WORKBENCH: Workbench = {
  total: 3239, levels: LV([1218, 1333, 276, 412, 0, 0]), qualified_plus: 688, with_website: 2063, website_from_email: 489,
  profile: { version: 1 }, limit: { daily: 5000, used: 0, left: 5000 },
  gaps: [
    { key: 'industry', label: 'Industry not mapped', companies: 2580, filled_by: 'site read', enrich: { raw_or_identified: true, industry_missing: true } },
    { key: 'type', label: 'Company or individual unknown', companies: 2960, filled_by: 'site read', enrich: { raw_or_identified: true, industry_missing: false } },
    { key: 'contact', label: 'No company email / phone from the site', companies: 1900, filled_by: 'site read (contact)', enrich: { raw_or_identified: true, industry_missing: false } },
    { key: 'website', label: 'No website at all', companies: 849, filled_by: 'domain lookup · not yet (E5)', enrich: null },
  ],
  deliveries: [
    { id: '12', label: 'FTCCI · Members', source_code: 'ftcci', companies: 2912, qualified_plus: 233, qualified_pct: 8, as_of: '2023-10-01', loaded_at: '2026-10-01T10:00:00Z', eligible: 1410 },
    { id: '14', label: 'analytica · Exhibitors', source_code: 'analytica', companies: 327, qualified_plus: 39, qualified_pct: 12, as_of: '2026-10-01', loaded_at: '2026-10-02T08:00:00Z', eligible: 0 },
  ],
  runs: [],
  suggestion: { delivery: '12', delivery_label: 'FTCCI · Members', eligible: 1410, records: 100 },
};

function estimate(p: Record<string, unknown>): EstimateResult {
  const matched = p.delivery === '14' ? 0 : p.industry_missing ? 980 : 1410;
  const records = Math.min(Number(p.records ?? 100), matched);
  return {
    slice: { delivery: String(p.delivery ?? 'all'), raw_or_identified: p.raw_or_identified !== false, industry_missing: p.industry_missing === true },
    matched,
    estimate: records ? {
      records, limit: { daily: 5000, used: 0, left: 5000 }, per_company: { high: 3000, low: 600, measured: false }, tokens: records * 3600,
      providers: [
        { code: 'groq', model: 'openai/gpt-oss-120b', companies: Math.min(55, records), off: false, paid: false, text: `≈ ${Math.min(55, records)} companies before its 200K tokens/day run out` },
        { code: 'openrouter', model: 'google/gemma-4-31b-it:free', companies: Math.min(25, Math.max(0, records - 55)), off: false, paid: false, text: `≈ ${Math.min(25, Math.max(0, records - 55))} companies (50 free requests a day)` },
        { code: 'qwen', model: 'qwen3', companies: Math.max(0, records - 80), off: false, paid: false, text: 'the rest, one at a time ≈ 40 s each' },
        { code: 'haiku', model: 'claude-haiku-4-5', companies: 0, off: true, paid: true, text: 'off — nothing is paid' },
      ],
      unplaced: 0, minutes: Math.ceil(records * 0.35), minutes_measured: false,
    } : null,
  };
}

const FEED = [
  ['plan', "Route HIGH for pool company facts: groq → openrouter → qwen → haiku (off). 100 records of today's 5,000.", null],
  ['check', 'Kavya Lab Instruments: kavyalab.example is live', null],
  ['read', 'Kavya Lab Instruments: /about, /contact, /products', 'groq · openai/gpt-oss-120b'],
  ['check', 'Sri Lakshmi Traders: lakshmitraders.example is a parked page — marked "website not live"', null],
  ['read', 'Deccan Biologics: /about, /contact', 'groq · openai/gpt-oss-120b'],
  ['skip', 'Nizam Analytical: site is JavaScript-only — nothing to read without a browser (E6)', null],
  ['move', "route high: skipped groq (today's tokens spent (198,400/200,000), this call ~3,000)", null],
  ['read', 'Hitech Glassware: /about, /products', 'openrouter · google/gemma-4-31b-it:free'],
  ['move', 'openrouter\'s answer failed validation — industry "Glassware" is not on the INDUSTRIES list; asking qwen', null],
  ['read', 'Aryan Pharma Chem: /about, /contact', 'qwen · qwen3'],
  ['done', '100 done · 86 read · 8 JavaScript-only · 5 not live · 1 abstained · 48 moved up a level', null],
] as const;

function run(eventId: string): RunView {
  const live = eventId.includes('live');
  const feed = FEED.slice(0, live ? 7 : FEED.length).map(([kind, text, model], i) => ({ ts: new Date(Date.UTC(2026, 9, 2, 6, i)).toISOString(), kind, text, model, status: 'ok' }));
  return {
    event_id: eventId, run_no: 1, delivery_label: 'FTCCI · Members', records: 100, status: live ? 'running' : 'finished',
    created_at: '2026-10-02T06:00:00Z', started_at: '2026-10-02T06:00:00Z', finished_at: live ? null : '2026-10-02T06:34:00Z', duration_ms: live ? null : 34 * 60000,
    progress: { done: live ? 46 : 100, total: 100 },
    counts: live ? { read: 39, js_only: 4, not_live: 2, abstained: 1, failed: 0, moved_up: 21, unreadable: 6, not_reached: 0 }
      : { read: 86, js_only: 8, not_live: 5, abstained: 1, failed: 0, moved_up: 48, unreadable: 13, not_reached: 0 },
    before: BEFORE, now: live ? { ...AFTER, levels: LV([16, 60, 15, 9, 0, 0]), avg: 35 } : AFTER,
    feed,
    models: [
      { provider: 'groq', model: 'openai/gpt-oss-120b', companies: 54, tokens: 196800, bad: 2, quota_spent: true },
      { provider: 'openrouter', model: 'google/gemma-4-31b-it:free', companies: 17, tokens: 61200, bad: 2, quota_spent: true },
      { provider: 'qwen', model: 'qwen3', companies: 15, tokens: 94400, bad: 0, quota_spent: false },
    ],
    bad_answers: 4, tokens: 352400, paid_tokens: 0, estimate: null, stopped: null, error: null,
    withdrawn_at: null, touched: 86, abstained: [{ company_id: '1204', name: 'Sri Venkateswara Agencies' }],
  };
}

const PROVENANCE = {
  rows: [
    { field: 'industry_id', label: 'Industry', value: 'Lab equipment', from: 'run #1 · /about · groq · openai/gpt-oss-120b · 0.91' },
    { field: 'industry_raw', label: 'Industry (raw)', value: '"Chemicals & Scientific"', from: 'FTCCI members delivery · kept as delivered' },
    { field: 'email', label: 'Company email', value: 'sales@kavyalab.example', from: 'run #1 · /contact · page text' },
    { field: 'phone', label: 'Phone', value: '+91 40 2345 6789', from: 'FTCCI members delivery', wins_over: '+91 40 2345 0000' },
    { field: 'description', label: 'What it does', value: 'HPLC columns and lab consumables for QC labs', from: 'run #1 · /products · groq · openai/gpt-oss-120b · 0.88' },
    { field: 'linkedin_url', label: 'LinkedIn', value: 'linkedin.com/company/kavya-lab', from: 'run #1 · site footer · code' },
  ],
  enrichment: { run_no: 1, event_id: 'mock-run-1', site: 'live' as const, reason: null, before: { score: 25, level: 'identified' }, refreshed_at: '2026-10-02T06:34:00Z' },
};

export const ENRICH_MOCK_READS: Record<string, (p: Record<string, unknown>) => unknown> = {
  'pool-skill.workbench': () => WORKBENCH,
  'pool-skill.enrich_estimate': (p) => estimate(p),
  'pool-skill.enrich_run': (p) => ({ run: run(String(p.event_id ?? 'mock-run-1')) }),
};
export const ENRICH_MOCK_WRITES: Record<string, (p: Record<string, unknown>) => unknown> = {
  'pool-skill.start_enrich': (p) => ({ event_id: 'mock-live-run', run_no: 1, records: Number(p.records ?? 100) }),
  'pool-skill.withdraw_enrich_run': () => ({ event_id: 'mock-run-1', run_no: 1, companies_rescored: 86 }),
};
/** The mock company (Kavya, after run #1) for tab 5. */
export const ENRICH_MOCK_PROVENANCE = PROVENANCE;
