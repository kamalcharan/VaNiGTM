'use client';
/**
 * Reads and writes for G1. Every read is a generic skill call; every write goes
 * through useSkillMutation (double-submit guard, idempotency key, a toast
 * either way) and invalidates the pathway's reads on success.
 */
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery } from '@/lib/useSkill';
import { useSkillMutation } from '@/lib/useSkillMutation';
import type { AudienceState, AudienceStep } from './mock';
import { toHotRow, type BatchStatus, type Brief, type HotList, type Person, type RecordList } from './mock-data';

export const useAudienceState = () => useSkillQuery<AudienceState>('gtm', 'audience_state');
/**
 * The hot list = the tenant's own prospects (prospect-skill.get_records, REAL)
 * rendered as HotRows. The pool is read by nobody yet: gt_universe_* has never
 * been fed and `gt_connectors` does not exist, so `pool_state` is honest —
 * 'fed' only if a row says it came from the pool.
 */
export function useHotList() {
  return useSkillQuery<RecordList>('prospect-skill', 'get_records', { scope: 'mine', limit: 200 }, {
    select: (r) => {
      const rows = (r.data?.records ?? []).map(toHotRow);
      const pool = rows.filter((x) => x.source === 'pool').length;
      const mine = rows.length - pool;
      const list: HotList = {
        pool_state: pool > 0 ? 'fed' : 'unfed',
        sources: [
          { id: 'pool', label: 'Global data (pool)', state: pool > 0 ? 'connected' : 'not_connected', rows: pool },
          { id: 'mine', label: 'Your list', state: mine > 0 ? 'connected' : 'not_connected', rows: mine },
          { id: 'apollo', label: 'Apollo / AutoGTM', state: 'not_built', rows: 0 },
          { id: 'byok', label: 'Your own provider', state: 'not_built', rows: 0 },
        ],
        rows, upload: null,
      };
      return { ...r, data: list } as unknown as typeof r;
    },
  }) as unknown as ReturnType<typeof useSkillQuery<HotList>>;
}
export const useBriefs = () => useSkillQuery<{ briefs: Brief[] }>('research-skill', 'get_briefs');
export const useBriefContacts = () => useSkillQuery<{ people: Person[] }>('contact-skill', 'list_brief_contacts');

export function useBatchStatus() {
  return useSkillQuery<BatchStatus | null>('research-skill', 'batch_status', {}, {
    // A batch takes seconds per brief; poll while it runs, stop when it is done.
    refetchInterval: (q) => (q.state.data?.data?.state === 'running' ? 600 : false),
  });
}

function useRefresh() {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ queryKey: ['skill'] }), [qc]);
}

export function useAudienceWrites() {
  const refresh = useRefresh();
  const advance = useSkillMutation<AudienceState>('gtm', 'advance', { onSuccess: refresh });
  const restart = useSkillMutation<AudienceState>('gtm', 'restart', { successMessage: 'Started over. Nothing researched was lost — briefs stay on their companies.', onSuccess: refresh });
  const research = useSkillMutation<{ batch_id: string; budget_used: number; budget_total: number }>('research-skill', 'start_research', {
    successMessage: (r) => `Researching. ${r.budget_used} of ${r.budget_total} budget for today.`,
    errorMessage: 'Could not start research.', onSuccess: refresh,
  });
  const decide = useSkillMutation<{ ok: boolean }>('research-skill', 'decide_brief', { errorMessage: 'Could not save that verdict.', onSuccess: refresh });
  const promote = useSkillMutation<{ contact_ref: string }>('contact-skill', 'promote_from_brief', {
    successMessage: (r) => `Added to your audience as ${r.contact_ref}`, errorMessage: 'Could not add that person.', onSuccess: refresh,
  });
  const unpromote = useSkillMutation<{ ok: boolean }>('contact-skill', 'unpromote', { errorMessage: 'Could not remove that person.', onSuccess: refresh });

  return {
    advance: (to: AudienceStep | 'done') => advance.mutate({ to }),
    restart: () => restart.mutate({}),
    research: (prospect_ids: string[], prospects: { id: string; name: string; ref: string; city: string; size: number; size_label: string; source_label: string }[]) => research.mutate({ prospect_ids, prospects }),
    decide: (prospect_id: string, verdict: Brief['verdict']) => decide.mutate({ prospect_id, verdict }),
    promote: (person_id: string) => promote.mutate({ person_id }),
    unpromote: (person_id: string) => unpromote.mutate({ person_id }),
    busy: advance.isPending || research.isPending || decide.isPending || promote.isPending || unpromote.isPending,
  };
}
