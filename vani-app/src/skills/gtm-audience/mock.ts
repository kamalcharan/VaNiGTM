/**
 * G1 mock handlers. In-memory state so the pathway can be walked end to end.
 *
 * `prospect-skill.get_records` and the four `etl.*` steps are REAL on the API
 * and are mocked here for mock mode only — they are never previewed on the
 * live transport (lib/preview.ts keeps them out). Research and people stay
 * preview until their slice lands; a real prospect id that reaches them gets
 * a labelled placeholder, never an invented brief.
 */
import { GTM_JOURNEY_STATE } from '@/skills/gtm-shell/mock';
import {
  BRIEF_FIXTURES, BUDGET_PER_BRIEF, BUDGET_TOTAL, HOT_ROWS, PEOPLE_FIXTURES, UPLOAD_RESULT, UPLOAD_ROWS,
  type BatchStatus, type Brief, type HotRow, type LandingResult, type Person, type RecordRow,
} from './mock-data';

export type AudienceStep = 'bring' | 'find' | 'qualify' | 'people';
const ORDER: AudienceStep[] = ['bring', 'find', 'qualify', 'people'];

export interface AudienceState {
  step: AudienceStep;
  done: AudienceStep[];
  finished: boolean;
  cohort: string[];
  batch_id: string | null;
  verdicts: Record<string, Brief['verdict']>;
  promoted: string[];
}

/** What is known about a company id — from the mock rows, or from what the
 *  screen passed to start_research when the rows were real. */
export interface Known { id: string; name: string; ref: string; city: string; size: number; size_label: string; source_label: string; }
const KNOWN = new Map<string, Known>();
export const knownCompany = (id: string) => KNOWN.get(id);

const S = {
  reached: new Set<AudienceStep | 'done'>(['bring']),
  uploaded: false,
  cohort: new Set<string>(),
  batchStartedAt: null as number | null,
  batchId: null as string | null,
  verdicts: {} as Record<string, Brief['verdict']>,
  promoted: [] as string[],
};

function toRecord(h: HotRow, i: number): RecordRow {
  return { id: h.id, ref: h.ref, name: h.name, relationship: 'dataset', domain_normalized: h.has_domain ? `${h.id}.example` : null, city: h.city, state_code: null,
    industry_raw: 'Hospitals', industry_canonical: 'healthcare', industry_sub: null, employees_band: `${h.size} beds`, completeness: h.weak ? 0.35 : 0.8, validity: 1,
    freshness: h.fresh_days === 0 ? 'current' : h.fresh_days < 60 ? 'current' : 'recent', duplicate: false, is_active: true, source_label: h.source_label, tags: [], research_status: S.verdicts[h.id] ? 'decided' : S.cohort.has(h.id) && batchDone() ? 'done' : null };
}
function remember(h: HotRow) { KNOWN.set(h.id, { id: h.id, name: h.name, ref: h.ref, city: h.city, size: h.size, size_label: `${h.size} beds`, source_label: h.source_label }); }

function records(): RecordRow[] {
  const out: HotRow[] = HOT_ROWS.map((r) => ({ ...r }));
  if (S.uploaded) for (const u of UPLOAD_ROWS) {
    if (u.dup) { const r = out.find((x) => x.id === u.id); if (r) { r.also_mine = true; r.source_label = `${r.source_label} · your list`; } }
    else out.push(u as HotRow);
  }
  out.forEach(remember);
  return out.map(toRecord);
}

const batchDone = () => S.batchStartedAt !== null && Date.now() - S.batchStartedAt > 700 * (S.cohort.size + 2);

function state(): AudienceState {
  const finished = S.reached.has('done');
  const step: AudienceStep = finished ? 'people' : [...ORDER].reverse().find((x) => S.reached.has(x)) ?? 'bring';
  const done = finished ? [...ORDER] : ORDER.slice(0, ORDER.indexOf(step));
  GTM_JOURNEY_STATE.audience = done.includes('qualify');
  GTM_JOURNEY_STATE.people = finished;
  return { step, done, finished, cohort: [...S.cohort], batch_id: S.batchId, verdicts: { ...S.verdicts }, promoted: [...S.promoted] };
}

function briefFor(id: string): Brief {
  const k = KNOWN.get(id);
  const fx = BRIEF_FIXTURES[id];
  const ident = { name: k?.name ?? id, ref: k?.ref ?? '', city: k?.city ?? '', size_label: k?.size_label ?? '', source_label: k?.source_label ?? '' };
  if (fx) return { prospect_id: id, ...ident, ...fx, verdict: S.verdicts[id] ?? null };
  return { prospect_id: id, ...ident, fit: {}, open_with: 'audit', preview_placeholder: true, verdict: S.verdicts[id] ?? null,
    evidence: [{ claim: 'Research is not wired to the API yet — the real brief lands here.', source: 'lib/preview.ts', excerpt: 'This row came from your real prospects; its research runs once research-skill is integrated.' }] };
}

/** Everyone promoted so far, with their CONT id and company. */
export function promotedPeople(): (Person & { contact_ref: string; company: Known | undefined })[] {
  return S.promoted.map((id, i) => {
    const p = Object.values(PEOPLE_FIXTURES).flat().find((x) => x.id === id)!;
    const company = KNOWN.get(p.prospect_id);
    return { ...p, company_name: company?.name ?? p.prospect_id, contact_ref: `CONT-${String(i + 1).padStart(4, '0')}`, company };
  });
}

export const AUDIENCE_MOCK_READS: Record<string, (p: Record<string, unknown>) => unknown> = {
  'gtm.audience_state': () => state(),
  // REAL on the API (mock mode only): the tenant's own prospects.
  'prospect-skill.get_records': () => { const r = records(); return { scope: 'mine', records: r, total: r.length, recipe: 'record-list' }; },
  'etl.headers': () => ({ file_id: 'mock-file', filename: UPLOAD_RESULT.file, headers: ['Hospital Name', 'City', 'Website', 'Beds (approx)'],
    sample_rows: [{ 'Hospital Name': 'Lotus Valley Hospital', City: 'Coimbatore', Website: '', 'Beds (approx)': 310 }, { 'Hospital Name': 'Cedar Ridge Medical College', City: 'Mysuru', Website: 'cedarridge.example', 'Beds (approx)': 700 }],
    total_rows: 4, suggested_mapping: { 'Hospital Name': 'company.name', City: 'company.city', Website: 'company.website', 'Beds (approx)': 'company.employees_band' }, extraction_plan: null }),
  'research-skill.batch_status': (): BatchStatus | null => {
    if (!S.batchStartedAt || !S.batchId) return null;
    const ids = [...S.cohort]; const elapsed = Date.now() - S.batchStartedAt;
    const lines: BatchStatus['lines'] = [{ at: '0:03', text: 'Reading your offers and vocabulary from the Smart Profile' }];
    ids.forEach((id, i) => { if (elapsed > 700 * (i + 1)) lines.push({ at: `${i * 2}:${String(10 + i * 7).padStart(2, '0')}`, text: `${KNOWN.get(id)?.name ?? id} — site read, 2 searches, brief written` }); });
    const done = batchDone();
    if (done) lines.push({ at: `${ids.length * 2}:00`, text: `${ids.length} briefs · ${ids.length * BUDGET_PER_BRIEF} of ${BUDGET_TOTAL} budget used`, done: true });
    return { batch_id: S.batchId, state: done ? 'running' : 'running', budget_used: ids.length * BUDGET_PER_BRIEF, budget_total: BUDGET_TOTAL, lines, ...(done ? { state: 'done' as const } : {}) };
  },
  'research-skill.get_briefs': (): { briefs: Brief[] } => ({ briefs: batchDone() ? [...S.cohort].map(briefFor) : [] }),
  'contact-skill.list_brief_contacts': (): { people: Person[] } => {
    const worth = [...S.cohort].filter((id) => S.verdicts[id] === 'yes');
    return { people: worth.flatMap((id) => (PEOPLE_FIXTURES[id] ?? []).map((p) => ({ ...p, company_name: KNOWN.get(id)?.name ?? id, contact_ref: S.promoted.includes(p.id) ? `CONT-${String(S.promoted.indexOf(p.id) + 1).padStart(4, '0')}` : null }))) };
  },
};

export const AUDIENCE_MOCK_WRITES: Record<string, (p: Record<string, unknown>) => unknown> = {
  'gtm.advance': (p) => { S.reached.add(p.to as AudienceStep | 'done'); return state(); },
  'gtm.restart': () => { S.reached = new Set(['bring']); S.uploaded = false; S.cohort = new Set(); S.batchStartedAt = null; S.batchId = null; S.verdicts = {}; S.promoted = []; return state(); },
  // The ETL steps, REAL on the API (mock mode only).
  'etl.upload': (p) => ({ file_id: 'mock-file', filename: String(p.filename ?? UPLOAD_RESULT.file), size: 18_204, import_type: 'company' }),
  'etl.create_session': () => ({ session_id: 'mock-session', status: 'staged', total_records: UPLOAD_RESULT.rows, import_type: 'company' }),
  'etl.process': (): LandingResult => { S.uploaded = true; return { session_id: 'mock-session', status: 'completed', processed: UPLOAD_RESULT.rows, successful: UPLOAD_RESULT.added, failed: 0, duplicate: UPLOAD_RESULT.merged, conflict: 0, campaign_locked: 0, orphans: 0, duration_ms: 412 }; },
  'research-skill.start_research': (p) => {
    const ids = ((p.prospect_ids as string[]) ?? []).map(String);
    for (const k of (p.prospects as Known[]) ?? []) KNOWN.set(String(k.id), { ...k, id: String(k.id) });
    S.cohort = new Set(ids); S.batchStartedAt = Date.now(); S.batchId = `batch-${S.batchStartedAt.toString(36)}`; S.verdicts = {};
    return { batch_id: S.batchId, budget_used: ids.length * BUDGET_PER_BRIEF, budget_total: BUDGET_TOTAL };
  },
  'research-skill.decide_brief': (p) => { S.verdicts[String(p.prospect_id)] = p.verdict as Brief['verdict']; return { ok: true }; },
  'contact-skill.promote_from_brief': (p) => { const id = String(p.person_id); if (!S.promoted.includes(id)) S.promoted.push(id); return { contact_ref: `CONT-${String(S.promoted.indexOf(id) + 1).padStart(4, '0')}` }; },
  'contact-skill.unpromote': (p) => { S.promoted = S.promoted.filter((x) => x !== String(p.person_id)); return { ok: true }; },
};
