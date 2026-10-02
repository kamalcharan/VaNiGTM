'use client';
/**
 * The scoring skill, for the console (release 3; backend/src/skills/scoring/SKILL.md).
 * A score is plain arithmetic on the server — no model, no tokens. These hooks
 * only ask; who may change what is enforced there.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery } from '@/lib/useSkill';
import { useSkillMutation } from '@/lib/useSkillMutation';

export type PartKey = 'identity' | 'firmographics' | 'digital' | 'contact' | 'people' | 'research' | 'signals';
export type Level = 'raw' | 'identified' | 'qualified' | 'reachable' | 'campaign_ready' | 'strong';
export type PartWeights = Record<PartKey, number>;

export interface ProfileView {
  in_force: { scope: 'platform' | 'tenant'; version: number; platform_version: number; own: boolean; based_on_version: number | null; platform_changed: boolean; part_weights: PartWeights };
  platform: { version: number; part_weights: PartWeights; item_weights: Record<PartKey, Record<string, number>>; level_bounds: Record<Exclude<Level, 'raw'>, number> };
  parts: Array<{ key: PartKey; label: string; items: Array<{ key: string; label: string }> }>;
  levels: Array<{ key: Level; label: string }>;
  can_edit: boolean;
  can_edit_platform: boolean;
  history: Array<{ scope: 'platform' | 'tenant'; version: number; follows_platform: boolean; part_weights: PartWeights | null; based_on_version: number | null; note: string | null; saved_at: string; saved_by_name: string | null }>;
}
export interface LevelCounts { total: number; by_level: Record<Level, number>; unscored: number; average: number | null }
export interface LevelsView { tenant: LevelCounts; pool?: LevelCounts }
export interface Explained {
  score: number; level: Level; level_reason: string | null;
  parts: Array<{ key: PartKey; label: string; weight: number; earned: number; measured: boolean; items: Array<{ key: string; label: string; weight: number; earned: number; evidence: string }> }>;
  profile: { scope: 'platform' | 'tenant'; version: number; platform_version: number };
  last_refreshed: string | null;
  reason?: 'NOT_FOUND';
}

export const LEVEL_LABEL: Record<Level, string> = {
  raw: 'Raw', identified: 'Identified', qualified: 'Qualified', reachable: 'Reachable', campaign_ready: 'Campaign-ready', strong: 'Strong',
};
export const LEVELS: Level[] = ['raw', 'identified', 'qualified', 'reachable', 'campaign_ready', 'strong'];

export const useScoringProfile = () => useSkillQuery<ProfileView>('scoring', 'profile', {});
export const useScoringLevels = () => useSkillQuery<LevelsView>('scoring', 'levels', {});
export const useExplain = (args: { prospectId?: string | number | null; companyId?: string | number | null }) =>
  useSkillQuery<Explained>('scoring', 'explain',
    args.companyId != null ? { company_id: String(args.companyId) } : { prospect_id: String(args.prospectId ?? '') },
    { enabled: args.companyId != null || args.prospectId != null });

export function useScoringWrites() {
  const qc = useQueryClient();
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['skill', 'scoring'] }); };
  const queued = 'Your companies are being re-scored — follow it under Runs; the numbers update as it finishes.';
  const save = useSkillMutation<{ version: number; changed: boolean }>('scoring', 'save_profile', {
    successMessage: (r) => (r.changed ? `Saved as your version ${r.version}. ${queued}` : 'Those are the weights already in force — nothing changed.'),
    errorMessage: 'The weights were not saved.', onSuccess: refresh,
  });
  const follow = useSkillMutation<{ changed: boolean }>('scoring', 'follow_platform', {
    successMessage: (r) => (r.changed ? `Back on the platform default. ${queued}` : 'You were already on the platform default.'),
    errorMessage: 'Nothing changed.', onSuccess: refresh,
  });
  const savePlatform = useSkillMutation<{ version: number }>('scoring', 'save_platform_profile', {
    successMessage: (r) => `Platform default saved as version ${r.version}. The common pool is being re-scored.`,
    errorMessage: 'The platform default was not saved.', onSuccess: refresh,
  });
  const rescore = useSkillMutation<{ event_id: string }>('scoring', 'rescore', {
    successMessage: () => 'Re-scoring queued — follow it under Runs.', errorMessage: 'Re-scoring was not queued.', onSuccess: refresh,
  });
  return { save, follow, savePlatform, rescore };
}
