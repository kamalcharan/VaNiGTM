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
  type BatchStatus, type Brief, type BriefContacts, type BriefList, type Budget, type Decision, type HotRow, type ImportSession,
  type LandingResult, type Promoted, type RecordRow, type ResearchQueued, type StagedRow,
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

/** One held row per mock import: Sunridge is already here with a different
 *  city and no website; the file proposes both. */
const HELD: StagedRow[] = [];
/** One failed row per mock import: no name anywhere on the row. */
const FAILED: StagedRow[] = [];
function seedHeld() {
  HELD.length = 0;
  FAILED.length = 0;
  FAILED.push({ id: 'st-9', row_number: 9, processing_status: 'failed', campaign_locked: false, conflict_kind: null, field_diff: null,
    mapped_data: { city: 'Salem', website: 'valley-care.example' }, raw_data: { 'Hospital Name': '', City: 'Salem', Website: 'valley-care.example', 'Beds (approx)': 90 },
    error_messages: ['company.name is required — the column mapped to it was empty on this row'] });
  HELD.push({ id: 'st-7', row_number: 7, processing_status: 'conflict', campaign_locked: false, conflict_kind: 'existing', error_messages: null,
    mapped_data: { name: 'Sunridge Multispeciality Hospital', city: 'Pune (Hinjewadi)', website: 'sunridge-hospital.example' },
    field_diff: {
      city: { existing: 'Pune', incoming: 'Pune (Hinjewadi)', recommended: 'keep', reason: 'What you already hold is at least as fresh (0.81 vs 0.74).' },
      website: { existing: null, incoming: 'sunridge-hospital.example', recommended: 'take', reason: 'Filling a hole loses nothing.' },
    } });
}

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
  'etl.headers': () => ({ file_id: 'mock-file', filename: UPLOAD_RESULT.file, headers: ['Hospital Name', 'City', 'Website', 'Beds (approx)'],
    sample_rows: [{ 'Hospital Name': 'Lotus Valley Hospital', City: 'Coimbatore', Website: '', 'Beds (approx)': 310 }, { 'Hospital Name': 'Cedar Ridge Medical College', City: 'Mysuru', Website: 'cedarridge.example', 'Beds (approx)': 700 }],
    total_rows: 4, suggested_mapping: { 'Hospital Name': 'company.name', City: 'company.city', Website: 'company.website', 'Beds (approx)': 'company.employees_band' }, extraction_plan: null }),
  'etl.sessions': () => ({ sessions: S.sessions }),
  'etl.records': (p) => { const st = String(p.status ?? 'all'); const rows = st === 'conflict' ? HELD : st === 'failed' ? FAILED : [...HELD, ...FAILED]; return { records: rows, total: rows.length, page: 1, limit: 100, total_pages: 1 }; },
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
  'etl.upload': (p) => ({ file_id: 'mock-file', filename: String(p.filename ?? UPLOAD_RESULT.file), size: 18_204, import_type: 'company' }),
  'etl.create_session': () => ({ session_id: 'mock-session', status: 'staged', total_records: UPLOAD_RESULT.rows, import_type: 'company' }),
  'etl.process': (): LandingResult => {
    S.uploaded = true; seedHeld();
    const id = `mock-session-${S.sessions.length + 1}`;
    S.sessions.unshift({ id, import_type: 'company', status: 'needs_review', total_records: UPLOAD_RESULT.rows, processed_records: UPLOAD_RESULT.rows, successful_records: UPLOAD_RESULT.added, failed_records: 1, duplicate_records: UPLOAD_RESULT.merged - 1, orphan_records: 0, original_filename: UPLOAD_RESULT.file, created_at: new Date().toISOString(), tenant_seq: S.sessions.length + 1 });
    return { session_id: id, status: 'needs_review', processed: UPLOAD_RESULT.rows, successful: UPLOAD_RESULT.added, failed: 1, duplicate: UPLOAD_RESULT.merged - 1, conflict: 1, campaign_locked: 0, orphans: 0, duration_ms: 412 };
  },
  'etl.resolve_conflicts': (p) => {
    const before = HELD.length;
    if (p.accept_recommended) HELD.length = 0;
    else for (const d of (p.decisions as { staging_id: string }[]) ?? []) { const i = HELD.findIndex((h) => String(h.id) === String(d.staging_id)); if (i >= 0) HELD.splice(i, 1); }
    const s = S.sessions[0]; if (s && HELD.length === 0) s.status = 'completed';
    return { applied: before - HELD.length, skipped: 0, conflicts_remaining: HELD.length };
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
