/**
 * Mock-mode answers for the DPDP outreach acknowledgement (no .env.local).
 * Same shapes and the same replay rules as the backend: accepting what is
 * accepted or revoking what is off appends nothing.
 */
import type { OutreachEvent, OutreachState } from './useOutreachNotice';

const NOTICE = {
  id: '00000000-0000-4000-8000-000000000263',
  version: 1,
  published_at: '2026-10-01T09:00:00.000Z',
  body: 'Before VaNi contacts anyone on your behalf\n\n'
    + "India's Digital Personal Data Protection Act, 2023 applies to the people you import into VaNi and contact through it. "
    + 'A name, a work email address or a phone number is personal data.\n\n'
    + '(Mock text — the real notice is a platform row published by migration.)',
};

let history: OutreachEvent[] = [];

function state(changed?: boolean): OutreachState {
  const current = history[0] ?? null;
  const in_force = current?.action === 'accept';
  return {
    status: in_force ? 'accepted' : current ? 'revoked' : 'not_accepted',
    in_force, notice: NOTICE, current, history, can_decide: true,
    ...(changed === undefined ? {} : { changed }),
  };
}

function append(action: 'accept' | 'revoke') {
  history = [{
    id: `mock-${history.length + 1}`, action, at: new Date().toISOString(),
    notice_version: action === 'accept' ? NOTICE.version : null,
    actor_name: 'You (mock)', actor_email: null,
  }, ...history];
}

export const OUTREACH_MOCK_READS: Record<string, (p: Record<string, unknown>) => unknown> = {
  'gtm.outreach_notice': () => state(),
};

export const OUTREACH_MOCK_WRITES: Record<string, (p: Record<string, unknown>) => unknown> = {
  'gtm.accept_outreach_notice': (p) => {
    if (p.notice_id !== NOTICE.id) throw new Error('The notice changed while it was open. Read the current version and accept that.');
    if (state().status === 'accepted') return state(false);
    append('accept');
    return state(true);
  },
  'gtm.revoke_outreach_notice': () => {
    if (!state().in_force) return state(false);
    append('revoke');
    return state(true);
  },
};
