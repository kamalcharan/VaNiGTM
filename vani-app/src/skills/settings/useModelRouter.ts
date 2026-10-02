/**
 * model-router-skill, for the console (POA release 2, P2-R). Admin only on the
 * server; these hooks only ask. Shapes follow
 * backend/src/skills/model-router-skill/SKILL.md.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery } from '@/lib/useSkill';
import { useSkillMutation } from '@/lib/useSkillMutation';

export type DataClass = 'public_company' | 'tenant' | 'people';
export type ProviderStateName = 'off' | 'serving' | 'cooling_down' | 'quota_spent';

export interface RouterProvider {
  code: string; kind: 'external' | 'platform' | 'haiku'; model: string; host: string;
  ctx: number; rpm: number; daily: number; tpm: number; tpd: number; tokens_minute: number; tokens_today: number; data_terms: 'no_training' | 'may_train' | 'unknown'; paid: boolean;
  enabled: boolean; switched_by: string | null; switched_at: string | null;
  calls_minute: number; calls_today: number; cooldown_until: string | null; state: ProviderStateName;
}
export interface RoutePlanView { serves: string[]; skipped: Array<{ code: string; reason: string }> }
export interface RouteView { route: 'high' | 'medium' | 'low'; order: string[]; plan: Record<DataClass, RoutePlanView> }
export interface UsageRow { route: string; provider_code: string; calls: number; ok: number; moved_on: number; bad: number; tokens: number }
export interface SwitchEvent { provider_code: string; enabled: boolean; note: string | null; changed_at: string; changed_by_name: string | null }
export interface RouterOverview { providers: RouterProvider[]; routes: RouteView[]; usage: UsageRow[]; history: SwitchEvent[] }
export interface TestResult { ok: boolean; model: string; latency_ms: number; answer?: string; error?: string }

export const useRouterOverview = (enabled = true) =>
  useSkillQuery<RouterOverview>('model-router-skill', 'overview', {}, { enabled });

export function useRouterWrites() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['skill', 'model-router-skill'] });
  const toggle = useSkillMutation<{ provider_code: string; enabled: boolean; changed: boolean }>(
    'model-router-skill', 'switch_provider', {
      successMessage: (r) => !r.changed
        ? `${r.provider_code} was already ${r.enabled ? 'on' : 'off'} — nothing changed.`
        : r.enabled ? `${r.provider_code} is on — enrichment may use it from the next call.`
          : `${r.provider_code} is off — new calls skip it; a call already running finishes.`,
      errorMessage: 'The switch was not changed.',
      onSuccess: refresh,
    });
  const test = useSkillMutation<TestResult>('model-router-skill', 'test_provider', {
    successMessage: (r) => r.ok ? `It answered in ${(r.latency_ms / 1000).toFixed(1)}s.` : 'It did not answer — the reason is on the row.',
    errorMessage: 'The test could not run.',
    onSuccess: refresh,
  });
  return { toggle, test };
}
