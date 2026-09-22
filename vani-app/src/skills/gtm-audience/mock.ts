/**
 * G1 mock handlers. In-memory state so the pathway can be walked end to end
 * and reloaded mid-way; resets on a full reload of the app's JS, which is what
 * you want when checking the flow repeatedly.
 *
 * Function names are the REAL skills' where they exist (prospect-skill,
 * research-skill, contact-skill) so integration is a matter of matching
 * shapes, not renaming calls. `gtm.audience_state` is new: the pathway's
 * own position, which today lives nowhere.
 */
import { GTM_JOURNEY_STATE } from '@/skills/gtm-shell/mock';
import {
  BRIEF_FIXTURES, BUDGET_PER_BRIEF, BUDGET_TOTAL, HOT_ROWS, PEOPLE_FIXTURES, UPLOAD_RESULT, UPLOAD_ROWS,
  type BatchStatus, type Brief, type HotList, type HotRow, type Person,
} from './mock-data';

/** Flip to 'unfed' to see the honest station-2 (pool never fed). */
export const MOCK_POOL_STATE: 'fed' | 'unfed' = 'fed';

export type AudienceStep = 'bring' | 'find' | 'qualify' | 'people';

export interface AudienceState {
  step: AudienceStep;
  done: AudienceStep[];
  finished: boolean;
  cohort: string[];
  batch_id: string | null;
  verdicts: Record<string, Brief['verdict']>;
  promoted: string[];
}

const ORDER: AudienceStep[] = ['bring', 'find', 'qualify', 'people'];

const S = {
  /** Steps the tenant has moved on to. Data never advances the pathway on
   *  its own — a fed pool must not skip the tenant past "bring". */
  reached: new Set<AudienceStep | 'done'>(['bring']),
  uploaded: false,
  cohort: new Set<string>(),
  batchStartedAt: null as number | null,
  batchId: null as string | null,
  verdicts: {} as Record<string, Brief['verdict']>,
  promoted: [] as string[],
};

function rows(): HotRow[] {
  const out: HotRow[] = [];
  if (MOCK_POOL_STATE === 'fed') out.push(...HOT_ROWS.map((r) => ({ ...r })));
  if (S.uploaded) for (const u of UPLOAD_ROWS) {
    if (u.dup) { const r = out.find((x) => x.id === u.id); if (r) r.also_mine = true; else { const h = HOT_ROWS.find((x) => x.id === u.id)!; out.push({ ...h, source: 'mine', source_label: 'your list · hospitals-q3.xlsx' }); } }
    else out.push(u as HotRow);
  }
  return out;
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

export const AUDIENCE_MOCK_READS: Record<string, (p: Record<string, unknown>) => unknown> = {
  'gtm.audience_state': () => state(),
  'prospect-skill.hot_list': (): HotList => ({
    pool_state: MOCK_POOL_STATE,
    sources: [
      { id: 'pool', label: 'Global data (pool)', state: MOCK_POOL_STATE === 'fed' ? 'connected' : 'not_connected', rows: MOCK_POOL_STATE === 'fed' ? HOT_ROWS.length : 0 },
      { id: 'mine', label: 'Your list', state: S.uploaded ? 'connected' : 'not_connected', rows: S.uploaded ? UPLOAD_ROWS.length : 0 },
      { id: 'apollo', label: 'Apollo / AutoGTM', state: 'not_built', rows: 0 },
      { id: 'byok', label: 'Your own provider', state: 'not_built', rows: 0 },
    ],
    rows: rows(),
    upload: S.uploaded ? UPLOAD_RESULT : null,
  }),
  'research-skill.batch_status': (): BatchStatus | null => {
    if (!S.batchStartedAt || !S.batchId) return null;
    const ids = [...S.cohort];
    const elapsed = Date.now() - S.batchStartedAt;
    const lines: BatchStatus['lines'] = [{ at: '0:03', text: 'Reading your offers and vocabulary from the Smart Profile' }];
    ids.forEach((id, i) => { if (elapsed > 700 * (i + 1)) lines.push({ at: `${i * 2}:${String(10 + i * 7).padStart(2, '0')}`, text: `${HOT_ROWS.concat(UPLOAD_ROWS as HotRow[]).find((r) => r.id === id)?.name} — site read, 2 searches, brief written` }); });
    const done = batchDone();
    if (done) lines.push({ at: `${ids.length * 2}:00`, text: `${ids.length} briefs · ${ids.length * BUDGET_PER_BRIEF} of ${BUDGET_TOTAL} budget used`, done: true });
    return { batch_id: S.batchId, state: done ? 'done' : 'running', budget_used: ids.length * BUDGET_PER_BRIEF, budget_total: BUDGET_TOTAL, lines };
  },
  'research-skill.get_briefs': (): { briefs: Brief[] } => ({
    briefs: batchDone() ? [...S.cohort].map((id) => ({ prospect_id: id, ...BRIEF_FIXTURES[id], verdict: S.verdicts[id] ?? null })) : [],
  }),
  'contact-skill.list_brief_contacts': (): { people: Person[] } => {
    const worth = [...S.cohort].filter((id) => S.verdicts[id] === 'yes');
    return { people: worth.flatMap((id) => (PEOPLE_FIXTURES[id] ?? []).map((p) => ({ ...p, contact_ref: S.promoted.includes(p.id) ? `CONT-${String(S.promoted.indexOf(p.id) + 1).padStart(4, '0')}` : null }))) };
  },
};

export const AUDIENCE_MOCK_WRITES: Record<string, (p: Record<string, unknown>) => unknown> = {
  'gtm.advance': (p) => { S.reached.add(p.to as AudienceStep | 'done'); return state(); },
  'gtm.restart': () => { S.reached = new Set(['bring']); S.uploaded = false; S.cohort = new Set(); S.batchStartedAt = null; S.batchId = null; S.verdicts = {}; S.promoted = []; return state(); },
  'etl.upload_list': () => { S.uploaded = true; return UPLOAD_RESULT; },
  'prospect-skill.build_cohort': (p) => { S.cohort = new Set((p.prospect_ids as string[]) ?? []); return { cohort_size: S.cohort.size }; },
  'research-skill.start_research': (p) => {
    const ids = (p.prospect_ids as string[]) ?? [...S.cohort];
    S.cohort = new Set(ids); S.batchStartedAt = Date.now(); S.batchId = `batch-${S.batchStartedAt.toString(36)}`; S.verdicts = {};
    return { batch_id: S.batchId, budget_used: ids.length * BUDGET_PER_BRIEF, budget_total: BUDGET_TOTAL };
  },
  'research-skill.decide_brief': (p) => { S.verdicts[String(p.prospect_id)] = p.verdict as Brief['verdict']; return { ok: true }; },
  'contact-skill.promote_from_brief': (p) => {
    const id = String(p.person_id);
    if (!S.promoted.includes(id)) S.promoted.push(id);
    return { contact_ref: `CONT-${String(S.promoted.indexOf(id) + 1).padStart(4, '0')}` };
  },
  'contact-skill.unpromote': (p) => { S.promoted = S.promoted.filter((x) => x !== String(p.person_id)); return { ok: true }; },
};
