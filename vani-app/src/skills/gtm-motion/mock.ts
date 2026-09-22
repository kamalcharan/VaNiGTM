/**
 * G2 mock — segment → story → cadence → send. In memory, like G1. Function
 * names are the real skills' (prospect / story / cadence / channel) so
 * integration is shape-matching; `gtm.motion_*` is the pathway's position,
 * which lives nowhere today. See INTEGRATION.md.
 */
import { GTM_JOURNEY_STATE, MOCK_IDENTITY } from '@/skills/gtm-shell/mock';
import { promotedPeople } from '@/skills/gtm-audience/mock';

export type MotionStep = 'segment' | 'story' | 'cadence' | 'send';
const ORDER: MotionStep[] = ['segment', 'story', 'cadence', 'send'];

export interface Segment { id: string; name: string; why: string; offer: string; ask: 'entry' | 'project'; people: { id: string; name: string; company: string; contact_ref: string }[]; confirmed: boolean; }
export interface StoryTrace { read: string[]; voice: string[]; not_read: string[]; }
export interface Story { story_id: string; seq: number; kind_key: string; scope: 'asset' | 'move'; segment_id: string; contact_id: string | null; title: string; body: string[]; status: 'draft' | 'approved'; author: 'agent' | 'human'; trace: StoryTrace; }
export interface CadenceRow { contact_id: string; contact_ref: string; name: string; company: string; in_window: number; planned: number; open_now: boolean; reason: string | null; }
export interface Policy { max_touches: number; window_days: number; quiet_hours: string; quiet_days: string[]; timezone: string; using_built_in: boolean; }
export interface Channel { id: string; channel_type: 'email' | 'whatsapp' | 'linkedin' | 'sms' | 'x'; name: string; status: 'connected' | 'not_connected' | 'assisted' | 'platform'; note: string; }
export interface MotionState { step: MotionStep; done: MotionStep[]; finished: boolean; nobody: boolean; }

const M = { reached: new Set<MotionStep | 'done'>(['segment']), segmentsConfirmed: false, approved: new Set<string>(), reserved: false, reservedAt: null as number | null };

export const POLICY: Policy = { max_touches: 2, window_days: 7, quiet_hours: '20:00–08:00', quiet_days: ['Sun'], timezone: 'Asia/Kolkata', using_built_in: true };

function segments(): Segment[] {
  const ps = promotedPeople();
  if (!ps.length) return [];
  const big = ps.filter((p) => (p.company?.size ?? 0) >= 500), small = ps.filter((p) => (p.company?.size ?? 0) < 500);
  const row = (p: typeof ps[number]) => ({ id: p.id, name: p.name, company: p.company?.name ?? '', contact_ref: p.contact_ref });
  const out: Segment[] = [];
  if (small.length) out.push({ id: 'renewal-leakage', name: 'Renewal leakage · single-site · entry ask', why: 'Briefs fit the Contract audit best; single campus; the smallest yes is the audit.', offer: 'Contract audit', ask: 'entry', people: small.map(row), confirmed: M.segmentsConfirmed });
  if (big.length) out.push({ id: 'group-procurement', name: 'Group procurement · multi-site · platform fit, entry ask', why: 'Platform fits best; still opens with the audit — the smallest yes.', offer: 'Contract audit', ask: 'entry', people: big.map(row), confirmed: M.segmentsConfirmed });
  return out;
}

function stories(): Story[] {
  const segs = segments(); const out: Story[] = []; let seq = 1;
  for (const sg of segs) {
    out.push({ story_id: `st-${sg.id}`, seq: seq++, kind_key: 'one_pager', scope: 'asset', segment_id: sg.id, contact_id: null, title: `${sg.offer} — for ${sg.name.split(' · ')[0].toLowerCase()}`, status: M.approved.has(`st-${sg.id}`) ? 'approved' : 'draft', author: 'agent',
      body: sg.id === 'renewal-leakage'
        ? ['Most hospitals lose 3–5% of contract value to renewals nobody saw coming. Not because anyone is careless — because 140 contracts across two campuses live in a spreadsheet, and the spreadsheet does not send reminders.', 'A two-week contract audit puts a number on it. Your top 50 contracts, your renewal dates, the penalties you are entitled to and have not claimed. You keep the number whatever you decide next.']
        : ['Central procurement for three sites means three renewal calendars and one team. The audit reads all of them and hands back one number: what unfavourable auto-renewal cost the group last year.', 'Two weeks, the top 50 across sites, one page per site. Nothing to install.'],
      trace: { read: ['your site (pricing, about)', '1 document (audit one-pager)', 'vocabulary: renewal leakage, vendor compliance'], voice: ['plain', 'evidence-first', 'never "revolutionary" ✓'], not_read: ['2 knowledge entries dropped for budget (case study, 2024 pricing)'] } });
    for (const p of sg.people) {
      out.push({ story_id: `mv-${p.id}`, seq: seq++, kind_key: 'email', scope: 'move', segment_id: sg.id, contact_id: p.id, title: `${p.name} · ${p.company}`, status: M.approved.has(`mv-${p.id}`) ? 'approved' : 'draft', author: 'agent',
        body: [`You took over procurement at ${p.company.split(' ')[0]} with a vendor base that still sends AMC visit logs as spreadsheets — the biomed tender says so. That is the exact shape the audit is built for.`, 'Two weeks, your top 50, one number. Worth twenty minutes to see the scope?'],
        trace: { read: ['brief: 3 evidence lines (procurement page, tender, trade press)', 'the segment story above'], voice: ['plain', 'evidence-first'], not_read: [] } });
    }
  }
  return out;
}

function cadence(): CadenceRow[] {
  return promotedPeople().map((p, i) => {
    const inWin = i === 0 ? 1 : i === 2 ? 2 : 0; const open = inWin < POLICY.max_touches;
    return { contact_id: p.id, contact_ref: p.contact_ref, name: p.name, company: p.company?.name ?? '', in_window: inWin, planned: M.reserved && open ? 1 : 0, open_now: open, reason: open ? null : `${POLICY.max_touches} of ${POLICY.max_touches} in the last ${POLICY.window_days} days — window full` };
  });
}

export function channels(): Channel[] {
  const first = MOCK_IDENTITY === 'first_party';
  return [
    { id: 'email', channel_type: 'email', name: 'Email', status: first ? 'platform' : 'not_connected', note: first ? 'platform sender · ready' : 'your SMTP / provider — connect under Settings → Channels' },
    { id: 'whatsapp', channel_type: 'whatsapp', name: 'WhatsApp', status: first ? 'platform' : 'not_connected', note: first ? 'platform number · ready' : 'your business number — not connected' },
    { id: 'linkedin', channel_type: 'linkedin', name: 'LinkedIn', status: 'assisted', note: 'GTM drafts; you send from your own account. Still takes a cadence slot.' },
    { id: 'x', channel_type: 'x', name: 'X', status: 'assisted', note: 'Assisted, same as LinkedIn.' },
  ];
}

function state(): MotionState {
  const nobody = promotedPeople().length === 0;
  const finished = M.reached.has('done');
  const step: MotionStep = finished ? 'send' : [...ORDER].reverse().find((x) => M.reached.has(x)) ?? 'segment';
  const done = finished ? [...ORDER] : ORDER.slice(0, ORDER.indexOf(step));
  GTM_JOURNEY_STATE.motion = M.reserved;
  return { step, done, finished, nobody };
}

export const MOTION_MOCK_READS: Record<string, (p: Record<string, unknown>) => unknown> = {
  'gtm.motion_state': () => state(),
  'prospect-skill.get_segments': () => ({ segments: segments() }),
  'story-skill.list_stories': () => ({ stories: stories(), total: stories().length, recipe: 'story-list' }),
  'story-skill.list_kinds': () => ({ kinds: [
    { kind_key: 'email', display_name: 'Email', scope: 'move', channel: 'email', stages: ['addressed', 'ready', 'answered'] },
    { kind_key: 'linkedin', display_name: 'LinkedIn message', scope: 'move', channel: 'linkedin', stages: ['addressed', 'ready', 'answered'] },
    { kind_key: 'whatsapp', display_name: 'WhatsApp', scope: 'move', channel: 'whatsapp', stages: ['ready', 'answered'] },
    { kind_key: 'deck', display_name: 'Pitch deck', scope: 'asset', channel: null, stages: [] },
    { kind_key: 'one_pager', display_name: 'One-pager', scope: 'asset', channel: null, stages: ['addressed', 'ready'] },
    { kind_key: 'success_story', display_name: 'Success story', scope: 'asset', channel: null, stages: ['qualified', 'addressed', 'ready', 'answered'] },
    { kind_key: 'experience', display_name: 'Experience note', scope: 'asset', channel: null, stages: ['answered'] },
    { kind_key: 'gyan', display_name: 'Thought leadership', scope: 'asset', channel: null, stages: ['sourced', 'researched', 'qualified', 'answered'] },
  ], total: 8, recipe: 'kind-list' }),
  'cadence-skill.get_policy': () => ({ policies: [], built_in: POLICY, using_built_in: true, recipe: 'cadence-policy' }),
  'gtm.cadence_plan': () => ({ rows: cadence(), policy: POLICY }),
  'channel-skill.get_channels': () => ({ channels: channels(), identity: MOCK_IDENTITY, recipe: 'channel-list' }),
  'cadence-skill.reservations': () => ({ reservations: M.reserved ? cadence().filter((r) => r.planned).map((r) => ({ contact_ref: r.contact_ref, name: r.name, company: r.company, scheduled_at: new Date((M.reservedAt ?? Date.now()) + 86400000).toISOString(), channel: 'email', status: 'held' })) : [] }),
  'gtm.touch_log': () => ({ touches: [] }),
};

export const MOTION_MOCK_WRITES: Record<string, (p: Record<string, unknown>) => unknown> = {
  'gtm.motion_advance': (p) => { M.reached.add(p.to as MotionStep | 'done'); return state(); },
  'gtm.motion_restart': () => { M.reached = new Set(['segment']); M.segmentsConfirmed = false; M.approved = new Set(); M.reserved = false; M.reservedAt = null; return state(); },
  'prospect-skill.save_segment': () => { M.segmentsConfirmed = true; return { ok: true }; },
  'story-skill.approve_story': (p) => { M.approved.add(String(p.story_id)); return { story_id: p.story_id, status: 'approved' }; },
  'cadence-skill.reserve_touch': () => { M.reserved = true; M.reservedAt = Date.now(); return { reserved: cadence().filter((r) => r.open_now).length, refused: cadence().filter((r) => !r.open_now).length }; },
};
