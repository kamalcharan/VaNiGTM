'use client';

/**
 * The engine's data layer. One hook drives any lane — product or agent.
 *
 * Reads go through the generic skill transport like everything else. Writes go
 * through it too, but as a single call per step: the server commits the step's
 * payload and its completion mark in one transaction, so there is no window in
 * which a screen has saved but not completed, or completed but not saved.
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery } from '@/lib/useSkill';
import { useSkillMutation } from '@/lib/useSkillMutation';

export interface OnboardingStepStatus {
  step_id: string;
  title: string;
  summary: string;
  story: string | null;
  status: 'pending' | 'completed';
  completed_at: string | null;
}

export interface OnboardingStatus {
  lane: { id: string; title: string; scope: 'product' | 'agent' };
  complete: boolean;
  steps: OnboardingStepStatus[];
  next_incomplete_step: string | null;
}

/**
 * `enabled` exists so RequireSession can hold the request until a session is
 * known. Firing it before the silent refresh resolves would 401, and a 401 on
 * the gate's own query is indistinguishable from "not onboarded".
 */
export function useOnboardingStatus(lane: string, enabled = true) {
  return useSkillQuery<OnboardingStatus>('onboarding', 'status', { lane }, { enabled });
}

export function useCompleteStep(lane: string) {
  const qc = useQueryClient();

  const m = useSkillMutation<{ next_step: string | null; onboarding_complete: boolean }>(
    'onboarding',
    'complete_step',
    {
      // No success toast per step: the runner already moves to the next screen,
      // which says the same thing more clearly. The completion toast fires once,
      // at the end, from the runner.
      errorMessage: 'That step did not save.',
    },
  );

  const complete = useCallback(
    async (stepId: string, data: Record<string, unknown>) => {
      const result = await m.mutate({ lane, step_id: stepId, status: 'completed', data });
      if (!result) return false;
      // Refetch the lane rather than patching it locally. The server decides
      // what is next, and a local guess that disagrees with it is a bug that
      // only shows up on reload.
      await qc.invalidateQueries({ queryKey: ['skill', 'onboarding', 'status'] });
      return true;
    },
    [m, lane, qc],
  );

  return { complete, isSaving: m.isPending };
}
