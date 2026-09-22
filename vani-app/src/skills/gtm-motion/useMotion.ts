'use client';
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery } from '@/lib/useSkill';
import { useSkillMutation } from '@/lib/useSkillMutation';
import type { CadenceRow, Channel, MotionState, MotionStep, Policy, Segment, Story } from './mock';

export const useMotionState = () => useSkillQuery<MotionState>('gtm', 'motion_state');
export const useSegments = () => useSkillQuery<{ segments: Segment[] }>('prospect-skill', 'get_segments');
export const useStories = () => useSkillQuery<{ stories: Story[] }>('story-skill', 'list_stories');
export const useCadencePlan = () => useSkillQuery<{ rows: CadenceRow[]; policy: Policy }>('gtm', 'cadence_plan');
export const useChannels = () => useSkillQuery<{ channels: Channel[]; identity: 'tenant' | 'first_party' }>('channel-skill', 'get_channels');

export function useMotionWrites() {
  const qc = useQueryClient();
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ['skill'] }), [qc]);
  const advance = useSkillMutation<MotionState>('gtm', 'motion_advance', { onSuccess: refresh });
  const restart = useSkillMutation<MotionState>('gtm', 'motion_restart', { successMessage: 'Started over. Approved stories stay in the library.', onSuccess: refresh });
  const confirmSegments = useSkillMutation<{ ok: boolean }>('prospect-skill', 'save_segment', { successMessage: 'Segments confirmed.', errorMessage: 'Could not save the segments.', onSuccess: refresh });
  const approve = useSkillMutation<{ story_id: string }>('story-skill', 'approve_story', { successMessage: 'Approved.', errorMessage: 'Could not approve that story.', onSuccess: refresh });
  const reserve = useSkillMutation<{ reserved: number; refused: number }>('cadence-skill', 'reserve_touch', {
    successMessage: (r) => `${r.reserved} ${r.reserved === 1 ? 'slot' : 'slots'} reserved${r.refused ? ` · ${r.refused} refused — window full` : ''}.`,
    errorMessage: 'Could not reserve.', onSuccess: refresh,
  });
  return {
    advance: (to: MotionStep | 'done') => advance.mutate({ to }),
    restart: () => restart.mutate({}),
    confirmSegments: () => confirmSegments.mutate({}),
    approve: (story_id: string) => approve.mutate({ story_id }),
    reserve: () => reserve.mutate({}),
    busy: advance.isPending || restart.isPending || confirmSegments.isPending || approve.isPending || reserve.isPending,
  };
}
