/**
 * Today — attention-skill's queue, in mock. Shapes follow attention-skill
 * SKILL.md (items with reason / days_quiet / wake_at; decisions acted /
 * snoozed / dismissed). Empty until something is in motion — which is the
 * honest day-one state, and the empty state says so.
 */
import { GTM_JOURNEY_STATE } from '@/skills/gtm-shell/mock';
import { promotedPeople } from '@/skills/gtm-audience/mock';

export type Reason = 'wake_due' | 'owed_reply' | 'gone_quiet' | 'never_touched';
export interface AttentionItem { prospect_id: string; contact_id: string; contact_ref: string; company: string; person: string; ref: string; journey_state: string; reason: Reason; urgent: boolean; days_quiet: number | null; last_outcome: string | null; wake_at: string | null; offer: string; detail: string; }
export interface AttentionResult { items: AttentionItem[]; context: { journeys_in_play: number; surfaced: number; suppressed_handled: number; suppressed_snoozed: number; suppressed_dismissed: number }; empty_state: string | null; }
export type Decision = 'acted' | 'snoozed' | 'dismissed';

const DECIDED = new Map<string, Decision>();

function items(): AttentionItem[] {
  if (!GTM_JOURNEY_STATE.motion) return [];
  // The queue is per ACCOUNT (attention-skill keys on prospect_id): one row
  // per company, surfacing the first person promoted there.
  const seen = new Set<string>();
  const ps = promotedPeople().filter((p) => (seen.has(p.prospect_id) ? false : (seen.add(p.prospect_id), true))).slice(0, 3);
  const shapes: { reason: Reason; urgent: boolean; days: number | null; outcome: string | null; wake: string | null; detail: (n: string) => string }[] = [
    { reason: 'owed_reply', urgent: true, days: 2, outcome: 'replied', wake: null, detail: () => 'Replied 2 days ago: "send me the audit scope". Nobody has.' },
    { reason: 'wake_due', urgent: false, days: null, outcome: null, wake: new Date(Date.now() - 86400000).toISOString(), detail: () => 'Parked until yesterday — "after the board meeting". It was yesterday.' },
    { reason: 'gone_quiet', urgent: false, days: 9, outcome: 'opened', wake: null, detail: () => 'Opened the story twice, no reply. One touch left this window.' },
  ];
  return ps.map((p, i) => { const sh = shapes[i]; return { prospect_id: p.prospect_id, contact_id: p.id, contact_ref: p.contact_ref, company: p.company?.name ?? '', person: p.name, ref: p.company?.ref ?? '', journey_state: sh.reason === 'wake_due' ? 'parked' : 'waiting', reason: sh.reason, urgent: sh.urgent, days_quiet: sh.days, last_outcome: sh.outcome, wake_at: sh.wake, offer: 'Contract audit', detail: sh.detail(p.name) }; });
}

export const TODAY_MOCK_READS: Record<string, (p: Record<string, unknown>) => unknown> = {
  'attention-skill.get_attention': (): AttentionResult => {
    const all = items(); const open = all.filter((i) => !DECIDED.has(i.prospect_id));
    const n = (d: Decision) => [...DECIDED.values()].filter((v) => v === d).length;
    return { items: open, context: { journeys_in_play: GTM_JOURNEY_STATE.motion ? promotedPeople().length : 0, surfaced: open.length, suppressed_handled: n('acted'), suppressed_snoozed: n('snoozed'), suppressed_dismissed: n('dismissed') },
      empty_state: !GTM_JOURNEY_STATE.motion ? 'nothing_in_motion' : open.length ? null : 'all_handled' };
  },
  'journey-skill.list_journeys': () => {
    const js = GTM_JOURNEY_STATE.motion ? promotedPeople().map((p, i) => ({ id: `j-${p.id}`, contact_ref: p.contact_ref, person: p.name, company: p.company?.name ?? '', state: i === 1 ? 'parked' : 'ready', offer: 'Contract audit', since: new Date().toISOString(), wake_at: i === 1 ? new Date(Date.now() + 5 * 86400000).toISOString() : null })) : [];
    const counts: Record<string, number> = {}; for (const j of js) counts[j.state] = (counts[j.state] ?? 0) + 1;
    return { journeys: js, counts, total: js.length, recipe: 'journey-board' };
  },
};
export const TODAY_MOCK_WRITES: Record<string, (p: Record<string, unknown>) => unknown> = {
  'attention-skill.decide_attention': (p) => { DECIDED.set(String(p.prospect_id), p.decision as Decision); return { decision: { prospect_id: p.prospect_id, decision: p.decision, created_at: new Date().toISOString() }, recipe: 'attention-decision' }; },
};
