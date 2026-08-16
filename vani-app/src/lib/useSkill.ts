'use client';

/**
 * The generic skill transport.
 *
 * Ported from VaNiGTM's useSkillQuery. Every skill is reached by naming a skill
 * and a function — there is no per-skill plumbing, and no component builds a
 * URL. That genericity is what makes UX-first safe: screens are written against
 * this interface, and switching from mock to live is a transport swap rather
 * than a rewrite of the screen.
 *
 * P0 runs entirely on the mock transport. Do not add a bespoke endpoint for a
 * skill — auth is the only non-generic surface, and breaking that rule is what
 * makes the two-repo split expensive.
 */

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';

export interface SkillResult<T = unknown> {
  success: boolean;
  skill: string;
  function: string;
  data: T;
  error?: string;
}

export type SkillTransport = (
  skill: string,
  fn: string,
  params: Record<string, unknown>,
) => Promise<SkillResult>;

let transport: SkillTransport | null = null;

/** Called once at app start. Swapping mock → live happens here and nowhere else. */
export function setSkillTransport(t: SkillTransport): void {
  transport = t;
}

export function useSkillQuery<T = unknown>(
  skill: string,
  fn: string,
  params: Record<string, unknown> = {},
  options?: Omit<UseQueryOptions<SkillResult<T>, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<SkillResult<T>, Error>({
    queryKey: ['skill', skill, fn, params],
    queryFn: async () => {
      if (!transport) throw new Error('No skill transport configured.');
      return (await transport(skill, fn, params)) as SkillResult<T>;
    },
    ...options,
  });
}
