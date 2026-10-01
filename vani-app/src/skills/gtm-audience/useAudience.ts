'use client';
/**
 * Reads and writes for G1. Every read is a generic skill call; every write goes
 * through useSkillMutation (double-submit guard, idempotency key, a toast
 * either way) and invalidates the pathway's reads on success.
 *
 * Research and people are REAL (2026-09-25): research-skill and contact-skill
 * answer these on the live transport in their own shapes. Only the pathway's
 * position (`gtm.audience_state` / `advance` / `restart`) is still previewed —
 * nothing on the API holds it.
 */
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery } from '@/lib/useSkill';
import { useSkillMutation } from '@/lib/useSkillMutation';
import type { AudienceState, AudienceStep } from './mock';
import {
  toHotRow, type BatchStatus, type BriefContacts, type BriefList, type Budget, type Decision, type HotList, type Promoted, type RecordList, type ResearchQueued,
} from './mock-data';

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

/** Every brief, undecided first — the queue of decisions. */
export const useBriefs = () => useSkillQuery<BriefList>('research-skill', 'get_briefs', { limit: 100 });

/** Today's research budget, in companies. */
export const useBudget = () => useSkillQuery<Budget>('research-skill', 'get_budget');

const IN_FLIGHT = new Set(['queued', 'running']);
export function useBatchStatus() {
  return useSkillQuery<BatchStatus>('research-skill', 'batch_status', {}, {
    // Each company takes minutes; poll while the batch is in flight, stop when
    // it is not. `worker_down` is not in flight — polling it would only repeat
    // the same true sentence.
    refetchInterval: (q) => (IN_FLIGHT.has(q.state.data?.data?.verdict ?? '') ? 4000 : false),
  });
}

/** The names a brief evidenced at one company — never invented. */
export const useBriefContacts = (briefId: number | string | null) =>
  useSkillQuery<BriefContacts>('contact-skill', 'list_brief_contacts', { brief_id: briefId ?? '' }, { enabled: briefId != null });

function useRefresh() {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ queryKey: ['skill'] }), [qc]);
}

export function useAudienceWrites() {
  const refresh = useRefresh();
  const advance = useSkillMutation<AudienceState>('gtm', 'advance', { onSuccess: refresh });
  const restart = useSkillMutation<AudienceState>('gtm', 'restart', { successMessage: 'Started over. Nothing researched was lost — briefs stay on their companies.', onSuccess: refresh });
  const research = useSkillMutation<ResearchQueued>('research-skill', 'start_research', {
    // The split is the message: what was picked, what can be read, what was
    // already known. A bare "queued" hides the three rows that had no site.
    successMessage: (r) => [
      `${r.queued} queued for research`,
      r.already_researched ? `${r.already_researched} already had a brief` : '',
      r.no_website ? `${r.no_website} skipped — no website to read` : '',
    ].filter(Boolean).join(' · '),
    errorMessage: 'Could not start research.', onSuccess: refresh,
  });
  const decide = useSkillMutation<{ brief_id: number; decision: Decision }>('research-skill', 'decide_brief', { errorMessage: 'Could not save that verdict.', onSuccess: refresh });
  const promote = useSkillMutation<Promoted>('contact-skill', 'promote_from_brief', {
    successMessage: (r) => (r.created ? (r.confirmed_addressed ? 'Added to your audience, reachable.' : 'Added to your audience — no address yet, so not reachable until one is found.') : 'Already in your audience.'),
    errorMessage: 'Could not add that person.', onSuccess: refresh,
  });

  return {
    advance: (to: AudienceStep | 'done') => advance.mutate({ to }),
    restart: () => restart.mutate({}),
    /** Real prospect ids. `refresh` redoes companies that already have a brief. */
    research: (prospect_ids: (string | number)[], refresh = false) => research.mutate({ prospect_ids, refresh }),
    decide: (brief_id: number | string, decision: Decision, note?: string) => decide.mutate({ brief_id, decision, note: note ?? '' }),
    /** `confirm_addressed` only when the entry carries a channel — the server refuses otherwise. */
    promote: (brief_id: number | string, named_index: number, addressable: boolean) => promote.mutate({ brief_id, named_index, confirm_addressed: addressable }),
    busy: advance.isPending || research.isPending || decide.isPending || promote.isPending,
  };
}
