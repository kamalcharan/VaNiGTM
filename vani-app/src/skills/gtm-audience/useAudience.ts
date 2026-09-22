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
import type { BatchStatus, Brief, HotList, Person, UploadResult } from './mock-data';

export const useAudienceState = () => useSkillQuery<AudienceState>('gtm', 'audience_state');
export const useHotList = () => useSkillQuery<HotList>('prospect-skill', 'hot_list');
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
  const upload = useSkillMutation<UploadResult>('etl', 'upload_list', {
    successMessage: (r) => `${r.file}: ${r.rows} rows · ${r.merged} merged · ${r.added} added`,
    errorMessage: 'Could not read that file.', onSuccess: refresh,
  });
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
    upload: () => upload.mutate({ file: 'hospitals-q3.xlsx' }),
    research: (prospect_ids: string[]) => research.mutate({ prospect_ids }),
    decide: (prospect_id: string, verdict: Brief['verdict']) => decide.mutate({ prospect_id, verdict }),
    promote: (person_id: string) => promote.mutate({ person_id }),
    unpromote: (person_id: string) => unpromote.mutate({ person_id }),
    busy: advance.isPending || upload.isPending || research.isPending || decide.isPending || promote.isPending || unpromote.isPending,
  };
}
