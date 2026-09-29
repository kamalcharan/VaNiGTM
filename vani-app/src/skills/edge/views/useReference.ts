'use client';
/**
 * The reference data as a query, so the explorer and readiness get the
 * console's five states (vani-app CLAUDE.md §1) instead of a bare fetch in
 * an effect. Shaped as a SkillResult so <DataBoundary> can hold it.
 */
import { useQuery } from '@tanstack/react-query';
import type { SkillResult } from '@/lib/useSkill';
import { loadReference, o2c, type ReferenceData, type ReferenceResults } from '../mission/reference';
import type { ProcessId } from '../mission/types';

export type ReferenceBundle = { reference: ReferenceData; results: ReferenceResults };

export function useReference() {
  return useQuery<SkillResult<ReferenceBundle>, Error>({
    queryKey: ['edge', 'reference'],
    queryFn: async () => ({ success: true, skill: 'edge', function: 'reference', data: await loadReference() }),
    staleTime: Infinity,
  });
}

/** The graph for the mission's process: the P2P files, or the invented O2C. */
export function dataFor(process: ProcessId, bundle: ReferenceBundle | undefined): ReferenceData | null {
  return process === 'p2p' ? bundle?.reference ?? null : o2c;
}
