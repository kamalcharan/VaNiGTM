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
  /** Answered from fixtures because the backend is not integrated yet (lib/preview.ts). */
  preview?: boolean;
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

/** For writes, which go through useSkillMutation rather than useQuery. */
export function getSkillTransport(): SkillTransport | null {
  return transport;
}

/**
 * One imperative skill call, for code that runs outside a hook — a poll
 * chain, a multi-step flow. Throws with the server's own message on
 * `success:false`, so callers read it like a fetch that failed rather than a
 * 200 they have to inspect.
 */
export async function callSkill<T = unknown>(skill: string, fn: string, params: Record<string, unknown> = {}): Promise<T> {
  if (!transport) throw new Error('No skill transport configured.');
  const r = (await transport(skill, fn, params)) as SkillResult<T>;
  if (!r.success) throw new Error(r.error ?? `${skill}.${fn} failed`);
  return r.data;
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
