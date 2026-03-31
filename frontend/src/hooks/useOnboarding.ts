'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, getAccessToken, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { ME_QUERY_KEY } from './useMe';

/* ── Types ──────────────────────────────────────────── */

export interface OnboardingStep {
  step_id: string;
  status: 'pending' | 'completed';
  completed_at: string | null;
}

export interface OnboardingStatus {
  complete: boolean;
  steps: OnboardingStep[];
  next_incomplete_step: string | null;
}

/* ── Query Key ──────────────────────────────────────── */

export const ONBOARDING_QUERY_KEY = ['onboarding', 'status'] as const;

/* ── Status Query ───────────────────────────────────── */

export function useOnboardingStatus() {
  return useQuery<OnboardingStatus>({
    queryKey: ONBOARDING_QUERY_KEY,
    queryFn: () => apiFetch<OnboardingStatus>(API.onboarding.status),
    enabled: !!getAccessToken(),
  });
}

/* ── Complete Step Mutation ──────────────────────────── */

export function useCompleteOnboardingStep() {
  const queryClient = useQueryClient();

  return useMutation<
    { step: OnboardingStep; next_step: string | null; onboarding_complete: boolean },
    ApiError,
    { step_id: string; metadata?: Record<string, unknown> }
  >({
    mutationFn: (data) =>
      apiFetch(API.onboarding.completeStep, {
        body: { step_id: data.step_id, status: 'completed', metadata: data.metadata },
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY });
      // If onboarding is now complete, refresh /me to get updated tenant.onboarding_complete
      if (data.onboarding_complete) {
        queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      }
    },
  });
}
