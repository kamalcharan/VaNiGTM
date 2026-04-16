'use client';

import { useQuery, useMutation, type UseQueryOptions, type UseMutationOptions } from '@tanstack/react-query';
import { apiFetch, getAccessToken, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';

/* ── Types ──────────────────────────────────────────── */

export interface SkillResult<T = Record<string, unknown>> {
  success: boolean;
  skill: string;
  function: string;
  recipe: string;
  data: T;
  error?: string;
}

/* ── Skill Query (read operations) ──────────────────── */

/**
 * Execute a skill function as a query (GET-like, cached).
 *
 * Usage:
 *   const { data, isLoading } = useSkillQuery('client-skill', 'get_clients', {});
 */
export function useSkillQuery<T = Record<string, unknown>>(
  skill: string,
  fn: string,
  params: Record<string, unknown>,
  options?: Omit<UseQueryOptions<SkillResult<T>, ApiError>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<SkillResult<T>, ApiError>({
    queryKey: ['skill', skill, fn, params],
    queryFn: async ({ signal }) => {
      const result = await apiFetch<SkillResult<T>>(API.skills.execute, {
        pathParams: { skill, fn },
        body: { params },
        signal,
      });
      if (!result.success) {
        const err: ApiError & Error = Object.assign(
          new Error(result.error ?? `${skill}.${fn} failed`),
          { code: 'SKILL_ERROR', status: 500 } satisfies Partial<ApiError>,
        );
        throw err;
      }
      return result;
    },
    enabled: !!getAccessToken(),
    ...options,
  });
}

/* ── Skill Mutation (write operations) ──────────────── */

/**
 * Execute a skill function as a mutation (POST-like, not cached).
 *
 * Usage:
 *   const { mutateAsync } = useSkillMutation('import-skill', 'import_cas');
 *   await mutateAsync({ file_content: '...' });
 */
export function useSkillMutation<T = Record<string, unknown>>(
  skill: string,
  fn: string,
  options?: Omit<UseMutationOptions<SkillResult<T>, ApiError, Record<string, unknown>>, 'mutationFn'>,
) {
  return useMutation<SkillResult<T>, ApiError, Record<string, unknown>>({
    mutationFn: async (params) => {
      const result = await apiFetch<SkillResult<T>>(API.skills.execute, {
        pathParams: { skill, fn },
        body: { params },
      });
      // Skill returned success:false with HTTP 200 — surface as error
      // so onError handles it and onSuccess only fires for real successes.
      if (!result.success) {
        const err: ApiError & Error = Object.assign(
          new Error(result.error ?? `${skill}.${fn} failed`),
          { code: 'SKILL_ERROR', status: 500 } satisfies Partial<ApiError>,
        );
        throw err;
      }
      return result;
    },
    ...options,
  });
}
