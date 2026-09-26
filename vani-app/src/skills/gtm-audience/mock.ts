/**
 * G1 mock handlers. In-memory state so the pathway can be walked end to end
 * in mock mode (no NEXT_PUBLIC_API_ORIGIN).
 *
 * Everything research and people here mirrors the REAL functions the screens
 * call — research-skill (start_research, batch_status, get_briefs,
 * decide_brief, get_budget) and contact-skill (list_brief_contacts,
 * promote_from_brief) — in their real shapes, so integration was a switch of
 * transport, not a rename. Only the pathway's POSITION (`gtm.audience_state`,
 * `gtm.advance`, `gtm.restart`) is still previewed on the live transport:
 * nothing on the API holds "where is this tenant in the pathway".
 */
import { GTM_JOURNEY_STATE } from '@/skills/gtm-shell/mock';
import {
  BRIEF_FIXTURES, BUDGET_TOTAL, HOT_ROWS, UPLOAD_RESULT, UPLOAD_ROWS,
  type BatchStatus, type Brief, type BriefContacts, type BriefList, type Budget, type Decision, type HotRow, type ImportSession, type ImportTag,
  type LandingResult, type Promoted, type RecordRow, type ResearchQueued, type SourceLoad, type StagedRow,
} from './mock-data';

export type AudienceStep = 'bring' | 'find' | 'qualify' | 'people';
const ORDER: AudienceStep[] = ['bring', 'find', 'qualify', 'people'];

export interface AudienceState {
  step: AudienceStep;
  done: AudienceStep[];
  finished: boolean;
}

/** What is known about a company id, for the mocks that join identity onto a brief. */
export interface Known { id: string; name: string; ref: string; city: string; size: number; size_label: string; source_label: string; }
const KNOWN = new Map<string, Known>();
export const knownCompany = (id: string) => KNOWN.get(id);

/**
 * Staging, per session — what the dashboard reads row by row. One mock import
 * yields: two rows added (Lotus Valley, Cedar Ridge), two already held
 * (Sunridge, Harbour — the pool had them), one HELD because it would change
 * Sunridge's city and website, and one FAILED because the name column was
 * empty on that row. Same shapes the real ki_import_staging rows carry.
 */
const STAGING = new Map<string, StagedRow[]>();
const HELD_ROW = (): StagedRow => ({ id: 'st-7', row_number: 7, processing_status: 'conflict', campaign_locked: false, conflict_kind: 'existing', error_messages: null,
  mapped_data: { company: { name: 'Sunridge Multispeciality Hospital', city: 'Pune (Hinjewadi)', website: 'sunridge-hospital.example' }, people: [] },
  raw_data: { 'Hospital Name': 'Sunridge Multispeciality Hospital', City: 'Pune (Hinjewadi)', Website: 'sunridge-hospital.example', 'Beds (approx)': 420 },
  field_diff: { city: { existing: 'Pune', incoming: 'Pune (Hinjewadi)', recommended: 'keep', reason: 'Yours is 21 days fresher and the file adds a district, not a new city.' },
    website: { existing: null, incoming: 'sunridge-hospital.example', recommended: 'take', reason: 'You hold nothing; the file supplies a value that validated.' } } });
const FAILED_ROW = (): StagedRow => ({ id: 'st-9', row_number: 9, processing_status: 'failed', campaign_locked: false, conflict_kind: null, field_diff: null,
  mapped_data: { company: { city: 'Salem', website: 'valley-care.example' }, people: [] }, raw_data: { 'Hospital Name': '', City: 'Salem', Website: 'valley-care.example', 'Beds (approx)': 90 },
  error_messages: ['company.name is required — the column mapped to it was empty on this row'] });
function seedStaging(sessionId: string) {
  const rows: StagedRow[] = [
    { id: `${sessionId}-1`, row_number: 1, processing_status: 'success', campaign_locked: false, conflict_kind: null, field_diff: null, error_messages: null, created_record_id: 'lotus', processed_at: new Date().toISOString(),
      mapped_data: { company: { name: 'Lotus Valley Hospital', city: 'Coimbatore', employees_band: '310' }, people: [{ full_name: 'R. Iyer', job_title: 'Head of Procurement' }] }, raw_data: { 'Hospital Name': 'Lotus Valley Hospital', City: 'Coimbatore', Website: '', 'Beds (approx)': 310 } },
    { id: `${sessionId}-2`, row_number: 2, processing_status: 'success', campaign_locked: false, conflict_kind: null, field_diff: null, error_messages: null, created_record_id: 'cedar', processed_at: new Date().toISOString(),
      mapped_data: { company: { name: 'Cedar Ridge Medical College', city: 'Mysuru', website: 'cedarridge.example', domain_normalized: 'cedarridge.example', employees_band: '700' }, people: [] }, raw_data: { 'Hospital Name': 'Cedar Ridge Medical College', City: 'Mysuru', Website: 'cedarridge.example', 'Beds (approx)': 700 } },
    { id: `${sessionId}-3`, row_number: 3, processing_status: 'duplicate', campaign_locked: false, conflict_kind: null, field_diff: null, error_messages: null, processed_at: new Date().toISOString(),
      mapped_data: { company: { name: 'Harbour View Hospital', city: 'Visakhapatnam' }, people: [] }, raw_data: { 'Hospital Name': 'Harbour View Hospital', City: 'Visakhapatnam', Website: 'harbour.example', 'Beds (approx)': 250 } },
    HELD_ROW(), FAILED_ROW(),
  ];
  STAGING.set(sessionId, rows);
  return rows;
}
const heldOf = (sid: string) => (STAGING.get(sid) ?? []).filter((r) => r.processing_status === 'conflict');
function recount(ss: ImportSession) {
  const rows = STAGING.get(String(ss.id)) ?? [];
  ss.successful_records = rows.filter((r) => r.processing_status === 'success').length;
  ss.duplicate_records = rows.filter((r) => r.processing_status === 'duplicate').length;
  ss.failed_records = rows.filter((r) => r.processing_status === 'failed').length;
  ss.processed_records = rows.filter((r) => r.processing_status !== 'pending').length;
  const held = rows.filter((r) => r.processing_status === 'conflict').length;
  const pending = rows.filter((r) => r.processing_status === 'pending').length;
  ss.status = pending ? 'staged' : held ? 'needs_review' : ss.failed_records ? 'completed_with_errors' : 'completed';
}

/** Tags, as the real GET /etl/tags returns them: platform ones first. */
const TAGS: ImportTag[] = [
  { id: 11, label: 'FTCCI Telangana', slug: 'ftcci-telangana', is_platform: true },
  { id: 21, label: 'Lead data', slug: 'lead-data', is_platform: false },
  { id: 22, label: 'Pilot Pharma', slug: 'pilot-pharma', is_platform: false },
];

/** The pool's deliveries — what an admin sees on /agents/gtm/pool. */
const POOL_LOADS: SourceLoad[] = [
  { id: '1', label: 'Deccan hospital directory · 2026', region: 'Telangana', state_code: 'TS', as_of: '2026-03-31', row_count: 6, status: 'active', loaded_at: '2026-09-02T09:14:00Z', is_pool: true, source_code: 'directory', source_name: 'Directory', source_kind: 'directory', tier: 50, records: 4, with_domain: 4, duplicates: 0, avg_completeness: '0.780', avg_validity: '1.000', tags: [{ id: 11, label: 'FTCCI Telangana', is_platform: true }] },
  { id: '2', label: 'Western supplier list', region: 'Karnataka', state_code: 'KA', as_of: null, row_count: 3, status: 'active', loaded_at: '2026-08-21T12:40:00Z', is_pool: true, source_code: 'directory', source_name: 'Directory', source_kind: 'directory', tier: 50, records: 2, with_domain: 2, duplicates: 0, avg_completeness: '0.610', avg_validity: '0.900', tags: [] },
];

interface Ruling { decision: Decision; note: string | null; at: string; }

const S = {
  reached: new Set<AudienceStep | 'done'>(['bring']),
  uploaded: false,
  sessions: [] as ImportSession[],
  /** Companies with a brief (a batch was queued for them), in order. */
  cohort: [] as string[],
  batchStartedAt: null as number | null,
  rulings: {} as Record<string, Ruling>,
  /** contact id → { prospect id, named_index }. */
  promoted: new Map<number, { prospect: string; idx: number }>(),
  nextContact: 1,
};

/** Brief ids are numeric on the API; here, a stable number per fixture company. */
const ALL_IDS = [...new Set([...HOT_ROWS, ...UPLOAD_ROWS].map((r) => r.id))];
const briefId = (pid: string) => 100 + ALL_IDS.indexOf(pid);
const prospectOfBrief = (bid: number) => ALL_IDS[bid - 100] ?? null;

const briefDone = (pid: string) => S.batchStartedAt !== null && Date.now() - S.batchStartedAt > 700 * (S.cohort.indexOf(pid) + 1);
const batchDone = () => S.batchStartedAt !== null && Date.now() - S.batchStartedAt > 700 * (S.cohort.length + 1);

function toRecord(h: HotRow): RecordRow {
  const b = S.cohort.includes(h.id) && briefDone(h.id) ? briefFor(h.id) : null;
  return { id: h.id, ref: h.ref, name: h.name, relationship: 'dataset', domain_normalized: h.has_domain ? `${h.id}.example` : null, city: h.city, state_code: null,
    industry_raw: 'Hospitals', industry_canonical: 'healthcare', industry_sub: null, employees_band: `${h.size} beds`, completeness: h.weak ? 0.35 : 0.8, validity: 1,
    freshness: h.fresh_days === 0 ? 'current' : h.fresh_days < 60 ? 'current' : 'recent', duplicate: false, is_active: true, source_label: h.source_label, tags: [], research_status: b?.status ?? null };
}
function remember(h: HotRow) { KNOWN.set(h.id, { id: h.id, name: h.name, ref: h.ref, city: h.city, size: h.size, size_label: `${h.size} beds`, source_label: h.source_label }); }

function hotRows(): HotRow[] {
  const out: HotRow[] = HOT_ROWS.map((r) => ({ ...r }));
  if (S.uploaded) for (const u of UPLOAD_ROWS) {
    if (u.dup) { const r = out.find((x) => x.id === u.id); if (r) { r.also_mine = true; r.source_label = `${r.source_label} · your list`; } }
    else out.push(u as HotRow);
  }
  out.forEach(remember);
  return out;
}
const records = (): RecordRow[] => hotRows().map(toRecord);

function state(): AudienceState {
  const finished = S.reached.has('done');
  const step: AudienceStep = finished ? 'people' : [...ORDER].reverse().find((x) => S.reached.has(x)) ?? 'bring';
  const done = finished ? [...ORDER] : ORDER.slice(0, ORDER.indexOf(step));
  GTM_JOURNEY_STATE.audience = done.includes('qualify');
  GTM_JOURNEY_STATE.people = finished;
  return { step, done, finished };
}

function briefFor(pid: string): Brief {
  const k = KNOWN.get(pid);
  const fx = BRIEF_FIXTURES[pid];
  const r = S.rulings[pid];
  const base: Brief = {
    id: briefId(pid), prospect_id: pid, ref: k?.ref ?? '', name: k?.name ?? pid, domain: `${pid}.example`,
    status: 'drafted', pages_read: 6, what_they_make: null, named_contacts: [], fit: {}, recommended_offer: null, best_fit_offer: null, human_offer: null,
    effective_offer: null, fit_margin: null, fit_reason: null, hook: null, raw_evidence: [], error: null, decision_note: null, decided_at: null,
    updated_at: new Date(S.batchStartedAt ?? Date.now()).toISOString(), unevidenced: false,
  };
  // A real prospect id with no fixture: the honest answer is an unreadable
  // brief with the reason, never an invented one.
  const b: Brief = fx ? { ...base, ...fx } : { ...base, status: 'unreadable', error: `No fixture brief for ${pid} — in mock mode only fixture companies are researched.` };
  b.effective_offer = b.human_offer ?? b.recommended_offer;
  b.unevidenced = !['unreadable', 'extract_failed'].includes(b.status) && !(b.raw_evidence?.length);
  if (r) { b.status = r.decision; b.decision_note = r.note; b.decided_at = r.at; }
  return b;
}

const contactsOf = (pid: string): BriefContacts => {
  const b = briefFor(pid);
  const named = b.named_contacts ?? [];
  return {
    brief: { id: Number(b.id), prospect_id: Number.isFinite(Number(pid)) ? Number(pid) : 0, status: b.status, named_count: named.length },
    entries: named.map((e, i) => {
      const promotedId = [...S.promoted.entries()].find(([, v]) => v.prospect === pid && v.idx === i)?.[0] ?? null;
      return { named_index: i, name: e.name ?? null, title: e.title ?? null, email: e.email ?? null, phone: e.phone ?? null, source_url: b.domain ? `https://${b.domain}` : null,
        has_channel: !!(e.email || e.phone), has_name: !!e.name, addressable: !!(e.name && (e.email || e.phone)), promoted_contact_id: promotedId };
    }),
    empty_reason: named.length === 0 ? 'This brief named nobody. Add a contact by hand or research again — the flow will not invent one.' : null,
  };
};

/** Everyone promoted so far, with their CONT id and company — read by the
 *  People, Motion and Today mocks. */
export function promotedPeople(): { id: string; prospect_id: string; name: string; title: string; email: 'found' | 'not_found'; linkedin: boolean; contact_ref: string; company: Known | undefined }[] {
  return [...S.promoted.entries()].map(([cid, v]) => {
    const e = (briefFor(v.prospect).named_contacts ?? [])[v.idx] ?? {};
    return { id: String(cid), prospect_id: v.prospect, name: e.name ?? '', title: e.title ?? '', email: e.email ? 'found' : 'not_found', linkedin: false, contact_ref: `CONT-${String(cid).padStart(4, '0')}`, company: KNOWN.get(v.prospect) };
  });
}

function batchStatus(): BatchStatus {
  if (!S.batchStartedAt) return { verdict: 'never_run', message: 'No research has been queued yet.', healthy: true };
  const done = S.cohort.filter(briefDone).length;
  const elapsed = Date.now() - S.batchStartedAt;
  const verdict = batchDone() ? 'completed' : elapsed < 700 ? 'queued' : 'running';
  return { verdict, message: verdict === 'completed' ? 'The last batch finished.' : verdict === 'queued' ? 'Queued — the worker picks it up within a few seconds.' : 'Running. Each company takes 2-4 minutes.',
    healthy: true, done_count: done, requested: S.cohort.length, run_id: 'run-mock', run_status: verdict === 'completed' ? 'completed' : 'running', event_status: 'processing', event_age_seconds: Math.round(elapsed / 1000),
    started_at: new Date(S.batchStartedAt).toISOString(), completed_at: verdict === 'completed' ? new Date().toISOString() : null } as BatchStatus;
}

export const AUDIENCE_MOCK_READS: Record<string, (p: Record<string, unknown>) => unknown> = {
  'gtm.audience_state': () => state(),
  // REAL on the API (mock mode only): the tenant's own prospects.
  'prospect-skill.get_records': (p) => {
    const q = String(p.search ?? '').trim().toLowerCase();
    const research = String(p.research ?? '');
    if (p.scope === 'pool') {
      // The pool: one row per record per delivery, no ref, no research.
      let pr = HOT_ROWS.filter((h) => h.source === 'pool').map((h, i) => ({ ...toRecord(h), ref: `D-${100 + i}`, relationship: null, research_status: null, source_label: i < 4 ? 'Deccan hospital directory · 2026' : 'Western supplier list', tags: i < 4 ? [{ id: 11, label: 'FTCCI Telangana', inherited: true }] : [] }));
      if (q) pr = pr.filter((x) => [x.name, x.city, x.domain_normalized, x.industry_raw].some((v) => v?.toLowerCase().includes(q)));
      if (p.domain === 'none') pr = pr.filter((x) => !x.domain_normalized); if (p.domain === 'has') pr = pr.filter((x) => !!x.domain_normalized);
      if (p.only_duplicates) pr = pr.filter((x) => x.duplicate);
      if (p.industry) pr = pr.filter((x) => x.industry_raw === p.industry);
      const total = HOT_ROWS.filter((h) => h.source === 'pool').length;
      return { scope: 'pool', records: pr, total: pr.length, page: 1, limit: 50, recipe: 'record-list',
        stats: { total, loads: POOL_LOADS.length, customers: 0, resolved: 0, avg_completeness: '0.724', avg_validity: '0.967', with_rejected_fields: 1, with_domain: total, undated: 2, duplicates: 0, inactive: 0 },
        facets: { industries: [{ value: 'Hospitals', count: total }], tags: [{ id: 11, label: 'FTCCI Telangana', count: 4 }], clusters: [], segments: [], research: {}, with_domain: total, without_domain: 0 } };
    }
    let r = records();
    if (q) r = r.filter((x) => [x.name, x.city, x.domain_normalized, x.industry_raw].some((v) => v?.toLowerCase().includes(q)));
    if (research === 'none') r = r.filter((x) => !x.research_status);
    if (research === 'done') r = r.filter((x) => x.research_status && !['unreadable', 'extract_failed'].includes(x.research_status));
    if (research === 'decided') r = r.filter((x) => x.research_status && ['approved', 'rejected', 'no_contact'].includes(x.research_status));
    return { scope: 'mine', records: r, total: r.length, page: 1, limit: 200, stats: { total: records().length }, facets: {}, recipe: 'record-list' };
  },
  'prospect-skill.get_prospect': (p) => {
    const rows = records();
    const rec = rows.find((x) => x.ref === String(p.ref ?? '') || String(x.id) === String(p.prospect_id ?? ''));
    if (!rec) throw new Error('Company not found');
    const h = hotRows().find((x) => x.id === rec.id)!;
    const b = S.cohort.includes(h.id) && briefDone(h.id) ? briefFor(h.id) : null;
    const people = promotedPeople().filter((x) => x.prospect_id === h.id).map((x) => ({ id: Number(x.id), name: x.name, job_title: x.title, linkedin_url: null, location: null, channels: x.email === 'found' ? [{ type: 'email', value: (briefFor(h.id).named_contacts ?? []).find((e) => e.name === x.name)?.email ?? '' }] : [] }));
    return { prospect: { id: rec.id, ref: rec.ref, name: rec.name, domain_normalized: rec.domain_normalized, website: rec.domain_normalized ? `https://${rec.domain_normalized}` : null, email: null, phone: null, city: rec.city, state_code: null, country: 'IN', industry_raw: rec.industry_raw, employees_band: rec.employees_band, relationship: rec.relationship, source: h.source === 'pool' ? 'pool' : 'upload', is_active: true, created_at: new Date().toISOString(), load_label: rec.source_label, load_as_of: null, source_code: h.source === 'pool' ? 'DIRECTORY' : null },
      people, tags: [], brief: b, offers: [{ offer_key: 'contract-audit', name: 'Contract audit', commitment: 'entry' }, { offer_key: 'ledgerline-platform', name: 'Ledgerline platform', commitment: 'project' }], source_row: h.source === 'mine' ? { 'Hospital Name': h.name, City: h.city, Website: rec.domain_normalized ?? '', 'Beds (approx)': h.size } : {}, recipe: 'prospect-profile' };
  },
  'etl.headers': () => ({ file_id: 'mock-file', filename: UPLOAD_RESULT.file, headers: ['Hospital Name', 'City', 'Website', 'Beds (approx)', 'Procurement contact'],
    sample_rows: [{ 'Hospital Name': 'Lotus Valley Hospital', City: 'Coimbatore', Website: '', 'Beds (approx)': 310, 'Procurement contact': 'R. Iyer' }, { 'Hospital Name': 'Cedar Ridge Medical College', City: 'Mysuru', Website: 'cedarridge.example', 'Beds (approx)': 700, 'Procurement contact': '' }],
    total_rows: UPLOAD_RESULT.rows, suggested_mapping: { 'Hospital Name': 'name', City: 'city', Website: 'website', 'Procurement contact': 'full_name' },
    // The detector's findings WITH reasons, so the person can disagree.
    extraction_plan: { confidence: 'high', notes: ['One column reads as a person at the company; it lands in People, attached to the row\'s company.'],
      entities: [{ kind: 'company', columns: { 'Hospital Name': 'name', City: 'city', Website: 'website' }, reasons: ['"Hospital Name" holds organisation names; "Website" carries hostnames on 3 of 4 rows.'], per_row: 1 },
        { kind: 'person', columns: { 'Procurement contact': 'full_name' }, reasons: ['"Procurement contact" holds personal names on 2 of 4 rows.'], per_row: 1 }],
      unresolved_columns: [{ header: 'Beds (approx)', sample: '310', reason: 'A number with no header VaNi recognises — could be employees, could be capacity.' }] },
    row_estimates: { company: UPLOAD_RESULT.rows, person: 2 } }),
  'etl.tags': () => ({ tags: [...TAGS] }),
  'etl.sessions': () => ({ sessions: S.sessions }),
  'etl.status': (p) => { const ss = S.sessions.find((x) => String(x.id) === String(p.session_id)); if (!ss) throw new Error('Session not found');
    return { session: ss, errors: (STAGING.get(String(ss.id)) ?? []).filter((r) => r.processing_status === 'failed').map((r) => ({ row_number: r.row_number, error_messages: r.error_messages ?? [], mapped_data: r.mapped_data })) }; },
  'etl.records': (p) => {
    const st = String(p.status ?? 'all'); const all = STAGING.get(String(p.session_id)) ?? [];
    if (!S.sessions.some((x) => String(x.id) === String(p.session_id))) throw new Error('Session not found');
    const rows = st === 'all' ? all : all.filter((r) => r.processing_status === st);
    const limit = Number(p.limit ?? 50), page = Math.max(1, Number(p.page ?? 1));
    return { records: rows.slice((page - 1) * limit, page * limit), total: rows.length, page, limit, total_pages: Math.max(1, Math.ceil(rows.length / limit)) };
  },
  // REAL on the API: the deliveries behind either surface.
  'prospect-skill.get_loads': (p) => {
    const scope = p.scope === 'pool' ? 'pool' : 'mine';
    const loads: SourceLoad[] = scope === 'pool' ? POOL_LOADS : S.sessions.filter((x) => x.destination !== 'universe_companies').map((x) => ({
      id: String(x.load_id), label: x.original_filename ?? `import #${x.tenant_seq}`, region: null, state_code: null, as_of: x.load_as_of ?? null, row_count: x.total_records, status: 'active', loaded_at: x.created_at, is_pool: false,
      source_code: 'upload', source_name: 'Upload', source_kind: 'upload', tier: 50, records: x.successful_records, with_domain: Math.min(x.successful_records, 1), duplicates: 0, avg_completeness: '0.720', avg_validity: '1.000', tags: TAGS.filter((t) => (x.tag_ids ?? []).includes(t.id)).map((t) => ({ id: t.id, label: t.label, is_platform: t.is_platform })) }));
    const active = loads.filter((l) => l.status === 'active').length;
    return { scope, loads, total: loads.length, detail: loads.length ? `${loads.length} ${loads.length === 1 ? 'delivery' : 'deliveries'}, ${active} active.` : scope === 'pool' ? 'The pool has had no deliveries yet. An admin tenant feeds it by importing a directory as a common-pool dataset.' : 'Nothing imported yet. Every list you bring lands as a delivery here.', recipe: 'load-list' };
  },
  // REAL on the API: research-skill, in its own shapes.
  'research-skill.get_budget': (): Budget => ({ limit: BUDGET_TOTAL * 14_000, used: S.cohort.length * 14_000, remaining: (BUDGET_TOTAL - S.cohort.length) * 14_000, capped: true, tracked: true, cost_per_company: 14_000, affordable_companies: BUDGET_TOTAL - S.cohort.length }),
  'research-skill.batch_status': () => batchStatus(),
  'research-skill.get_briefs': (p): BriefList => {
    let briefs = S.cohort.filter(briefDone).map(briefFor);
    if (p.prospect_id != null) briefs = briefs.filter((b) => String(b.prospect_id) === String(p.prospect_id));
    const decided = briefs.filter((b) => b.decided_at).length;
    return { briefs: [...briefs].sort((a, b) => Number(!!a.decided_at) - Number(!!b.decided_at)), total: briefs.length,
      stats: { total: briefs.length, with_offer: briefs.filter((b) => b.effective_offer).length, no_fit: briefs.filter((b) => !b.effective_offer && !['unreadable', 'extract_failed'].includes(b.status)).length,
        unevidenced: briefs.filter((b) => b.unevidenced).length, decided, approved: briefs.filter((b) => b.status === 'approved').length, declined: briefs.filter((b) => b.status === 'rejected' || b.status === 'no_contact').length,
        unreadable: briefs.filter((b) => b.status === 'unreadable').length, extract_failed: 0 } };
  },
  // REAL on the API: contact-skill.
  'contact-skill.list_brief_contacts': (p) => {
    const pid = prospectOfBrief(Number(p.brief_id));
    if (!pid || !S.cohort.includes(pid)) throw new Error('No such brief.');
    return contactsOf(pid);
  },
};

export const AUDIENCE_MOCK_WRITES: Record<string, (p: Record<string, unknown>) => unknown> = {
  'gtm.advance': (p) => { S.reached.add(p.to as AudienceStep | 'done'); return state(); },
  'gtm.restart': () => { S.reached = new Set(['bring']); return state(); },
  // The ETL steps, REAL on the API (mock mode only).
  'etl.upload': (p) => {
    // The same bytes twice is refused, as the API does (409 ALREADY_IMPORTED).
    if (/again|dup/i.test(String(p.filename ?? ''))) throw new Error('This exact file has already been imported as "hospitals-q3.xlsx". Nothing in it has changed, so there is nothing new to import. Upload an updated file, or retire the earlier load if you need to import it again.');
    return { file_id: 'mock-file', filename: String(p.filename ?? UPLOAD_RESULT.file), size: 18_204, import_type: 'company' };
  },
  'etl.create_tag': (p) => {
    const label = String(p.label ?? '').trim(); if (!label) throw new Error('label is required');
    const ex = TAGS.find((t) => t.label.toLowerCase() === label.toLowerCase()); if (ex) return { tag: ex, existing: true };
    const t: ImportTag = { id: 100 + TAGS.length, label, slug: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'), is_platform: p.is_platform === true }; TAGS.push(t); return { tag: t };
  },
  'etl.create_session': (p) => {
    const id = `mock-session-${S.sessions.length + 1}`;
    const pool = p.destination === 'universe_companies' || p.relationship === 'dataset';
    S.sessions.unshift({ id, import_type: 'company', status: 'staged', total_records: UPLOAD_RESULT.rows + 1, processed_records: 0, successful_records: 0, failed_records: 0, duplicate_records: 0, orphan_records: 0,
      original_filename: String(p.load_label ?? UPLOAD_RESULT.file), created_at: new Date().toISOString(), tenant_seq: S.sessions.length + 1, destination: pool ? 'universe_companies' : 'prospects', relationship: String(p.relationship ?? 'contacts'),
      load_id: 500 + S.sessions.length, load_as_of: (p.load_as_of as string | null) ?? null, tag_ids: (p.tag_ids as number[]) ?? [] });
    return { session_id: id, status: 'staged', total_records: UPLOAD_RESULT.rows + 1, import_type: 'company' };
  },
  'etl.process': (p): LandingResult => {
    const ss = S.sessions.find((x) => String(x.id) === String(p.session_id)); if (!ss) throw new Error('Session not found');
    if (!['staged', 'completed_with_errors', 'needs_review'].includes(ss.status)) throw new Error(`Session is "${ss.status}", expected one of staged, completed_with_errors, needs_review`);
    const first = !STAGING.has(String(ss.id));
    const rows = first ? seedStaging(String(ss.id)) : STAGING.get(String(ss.id))!;
    // A re-run lands whatever is pending (a retried or edited row); the failed row fails again unless it was edited to carry a name.
    let landed = 0;
    for (const r of rows) if (r.processing_status === 'pending') { const co = (r.mapped_data.company as Record<string, unknown> | undefined) ?? {}; if (co.name) { r.processing_status = 'success'; r.error_messages = null; landed++; } else { r.processing_status = 'failed'; r.error_messages = ['company.name is required — the column mapped to it was empty on this row']; } r.processed_at = new Date().toISOString(); }
    if (first && ss.destination !== 'universe_companies') S.uploaded = true;
    if (first && ss.destination === 'universe_companies') POOL_LOADS.unshift({ id: String(ss.load_id), label: ss.original_filename ?? 'delivery', region: null, state_code: null, as_of: ss.load_as_of ?? null, row_count: ss.total_records, status: 'active', loaded_at: ss.created_at, is_pool: true, source_code: 'upload', source_name: 'Upload', source_kind: 'upload', tier: 50, records: 2, with_domain: 1, duplicates: 0, avg_completeness: '0.700', avg_validity: '1.000', tags: TAGS.filter((t) => (ss.tag_ids ?? []).includes(t.id)).map((t) => ({ id: t.id, label: t.label, is_platform: t.is_platform })) });
    recount(ss); ss.processing_completed_at = new Date().toISOString();
    const succ = first ? rows.filter((r) => r.processing_status === 'success').length : landed;
    return { session_id: ss.id, status: ss.status, processed: rows.length, successful: succ, failed: ss.failed_records, duplicate: first ? ss.duplicate_records : 0, conflict: first ? heldOf(String(ss.id)).length : 0, campaign_locked: 0, orphans: 0, duration_ms: 412,
      landed: { companies: succ, people: first ? 1 : 0, channels: 0 } };
  },
  'etl.resolve_conflicts': (p) => {
    const ss = S.sessions.find((x) => String(x.id) === String(p.session_id)); if (!ss) throw new Error('Session not found');
    const rows = STAGING.get(String(ss.id)) ?? []; const before = heldOf(String(ss.id)).length;
    const settle = (r: StagedRow) => { r.processing_status = 'success'; r.field_diff = null; r.processed_at = new Date().toISOString(); };
    if (p.accept_recommended) rows.filter((r) => r.processing_status === 'conflict' && !r.campaign_locked).forEach(settle);
    else for (const d of (p.decisions as { staging_id: string }[]) ?? []) { const r = rows.find((h) => String(h.id) === String(d.staging_id) && h.processing_status === 'conflict'); if (r) settle(r); }
    recount(ss);
    return { applied: before - heldOf(String(ss.id)).length, skipped: 0, conflicts_remaining: heldOf(String(ss.id)).length };
  },
  'etl.reprocess': (p) => {
    const ss = S.sessions.find((x) => String(x.id) === String(p.session_id)); if (!ss) throw new Error('Session not found');
    const rows = (STAGING.get(String(ss.id)) ?? []).filter((r) => r.processing_status === 'failed');
    rows.forEach((r) => { r.processing_status = 'pending'; r.error_messages = null; r.processed_at = null; });
    if (rows.length) { ss.status = 'staged'; ss.failed_records = 0; }
    return rows.length ? { message: `Reset ${rows.length} failed record(s) to pending.`, reprocessed: rows.length } : { message: 'No failed records to reprocess', reprocessed: 0 };
  },
  'etl.patch_record': (p) => {
    const ss = S.sessions.find((x) => String(x.id) === String(p.session_id)); if (!ss) throw new Error('Session not found');
    const r = (STAGING.get(String(ss.id)) ?? []).find((x) => String(x.id) === String(p.record_id)); if (!r) throw new Error('Record not found');
    r.mapped_data = (p.mapped_data as Record<string, unknown>) ?? r.mapped_data; r.processing_status = 'pending'; r.error_messages = null; r.processed_at = null;
    ss.status = 'staged'; recount(ss); return { record: r };
  },
  'etl.sync_stats': (p) => { const ss = S.sessions.find((x) => String(x.id) === String(p.session_id)); if (!ss) throw new Error('Session not found'); recount(ss); return { session: ss }; },
  'etl.delete_staging': (p) => {
    const ss = S.sessions.find((x) => String(x.id) === String(p.session_id)); if (!ss) throw new Error('Session not found');
    if (ss.status === 'processing') throw new Error('Cannot delete staging for a session that is still processing');
    const n = (STAGING.get(String(ss.id)) ?? []).length; STAGING.set(String(ss.id), []); return { message: 'Staging data deleted', deleted_records: n };
  },
  'research-skill.start_research': (p): ResearchQueued => {
    const ids = ((p.prospect_ids as (string | number)[]) ?? []).map(String);
    hotRows();
    const rows = ids.map((id) => hotRows().find((r) => r.id === id)).filter((r): r is HotRow => !!r);
    const reachable = rows.filter((r) => r.has_domain);
    const already = p.refresh ? [] : reachable.filter((r) => S.cohort.includes(r.id));
    const todo = reachable.filter((r) => !already.includes(r));
    if (p.preview) return { selected: ids.length, reachable: reachable.length, no_website: rows.length - reachable.length, already_researched: already.length, to_research: todo.length, queued: 0, event_id: null };
    for (const r of todo) { S.cohort.push(r.id); delete S.rulings[r.id]; }
    S.batchStartedAt = Date.now();
    return { selected: ids.length, reachable: reachable.length, no_website: rows.length - reachable.length, already_researched: already.length, to_research: todo.length, queued: todo.length, event_id: `evt-${S.batchStartedAt.toString(36)}` };
  },
  'research-skill.decide_brief': (p) => {
    const pid = prospectOfBrief(Number(p.brief_id));
    if (!pid || !S.cohort.includes(pid)) throw new Error('No such brief.');
    const decision = p.decision as Decision;
    const note = String(p.note ?? '').trim();
    if (decision !== 'approved' && note.length < 3) throw new Error('A reason is required when ruling a company out. These reasons are how we learn whether the segment or the offer was wrong.');
    S.rulings[pid] = { decision, note: note || null, at: new Date().toISOString() };
    return { brief_id: Number(p.brief_id), decision, journey_state: decision === 'approved' ? 'qualified' : 'ruled_out', recipe: 'brief-card' };
  },
  'contact-skill.promote_from_brief': (p): Promoted => {
    const pid = prospectOfBrief(Number(p.brief_id));
    if (!pid || !S.cohort.includes(pid)) throw new Error('No such brief.');
    const idx = Number(p.named_index);
    const named = briefFor(pid).named_contacts ?? [];
    if (!named.length) throw new Error('This brief named nobody. It will not be guessed at.');
    if (!(idx >= 0 && idx < named.length)) throw new Error(`This brief has ${named.length} named contact(s); index ${idx} is out of range.`);
    const e = named[idx];
    const hasChannel = !!(e.email || e.phone);
    if (p.confirm_addressed && !hasChannel) throw new Error('confirm_addressed requires at least one reachable channel — a name with no address does not satisfy R-C2.');
    const existing = [...S.promoted.entries()].find(([, v]) => v.prospect === pid && v.idx === idx);
    if (existing) return { contact_id: existing[0], created: false, channels_written: 0, confirmed_addressed: !!p.confirm_addressed, journey_state: 'addressed' };
    const cid = S.nextContact++;
    S.promoted.set(cid, { prospect: pid, idx });
    return { contact_id: cid, created: true, channels_written: hasChannel ? 1 : 0, confirmed_addressed: !!p.confirm_addressed, journey_state: p.confirm_addressed && hasChannel ? 'addressed' : 'qualified' };
  },
};
