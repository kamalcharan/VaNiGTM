/**
 * The workspace's DPDP outreach acknowledgement — gtm.outreach_notice and its
 * two writers (VaNiGTM backend/src/skills/gtm/SKILL.md). Read by the Settings
 * tab that decides it and by the GTM landing that reports it.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery } from '@/lib/useSkill';
import { useSkillMutation } from '@/lib/useSkillMutation';

export type OutreachStatus =
  | 'no_notice' | 'not_provisioned' | 'not_accepted' | 'accepted' | 'accepted_older' | 'revoked';

export interface OutreachNotice { id: string; version: number; body: string; published_at: string }
export interface OutreachEvent {
  id: string; action: 'accept' | 'revoke'; at: string;
  notice_version: number | null; actor_name: string | null; actor_email: string | null;
}
export interface OutreachState {
  status: OutreachStatus;
  in_force: boolean;
  notice: OutreachNotice | null;
  current: OutreachEvent | null;
  history: OutreachEvent[];
  can_decide: boolean;
  changed?: boolean;
}

export const OUTREACH_HREF = '/settings/consent';

export function useOutreachNotice() {
  return useSkillQuery<OutreachState>('gtm', 'outreach_notice');
}

/**
 * Both writers are replay-safe on the server (accepting what is accepted, or
 * revoking what is off, appends nothing and says `changed: false`), so the
 * toast tells the two apart instead of claiming a change that did not happen.
 */
export function useOutreachDecision() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['skill', 'gtm'] });
  const accept = useSkillMutation<OutreachState>('gtm', 'accept_outreach_notice', {
    successMessage: (d) => (d.changed ? 'Accepted. GTM may now contact people who have not opted out.' : 'Already accepted — nothing changed.'),
    errorMessage: 'Could not record the acceptance.',
  });
  const revoke = useSkillMutation<OutreachState>('gtm', 'revoke_outreach_notice', {
    successMessage: (d) => (d.changed ? 'Outreach switched off. Nothing more will be sent.' : 'Outreach was already off — nothing changed.'),
    errorMessage: 'Could not switch outreach off.',
  });
  return { accept, revoke, refresh };
}
