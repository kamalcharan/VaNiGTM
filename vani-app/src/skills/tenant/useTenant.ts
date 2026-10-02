'use client';
/** The tenant skill, for the console: context, tokens, top-ups (backend/src/skills/tenant/SKILL.md). */
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery } from '@/lib/useSkill';
import { useSkillMutation } from '@/lib/useSkillMutation';

export interface Budget {
  capped: boolean; daily_limit: number | null; used_today: number; monthly_limit: number | null; used_this_month: number;
  topup_balance: number; remaining: number | null; daily_source: 'tenant' | 'platform'; monthly_source: 'tenant' | 'platform';
}
export interface TokensView {
  budget: Budget;
  days: Array<{ day: string; tokens: number }>;
  ledger: Array<{ tokens: number; reason: string; created_at: string; run_id: string | null; by_name: string | null }>;
}
export interface TopupRow { tenant_id: string; name: string; slug: string; added: number; drawn: number; balance: number; last_topup_at: string | null }

export const useTokens = () => useSkillQuery<TokensView>('tenant', 'tokens', {});
export const useTopups = (enabled: boolean) => useSkillQuery<{ tenants: TopupRow[] }>('tenant', 'topups', {}, { enabled });

export function useAddTopup() {
  const qc = useQueryClient();
  return useSkillMutation<{ tenant_id: string; balance: number }>('tenant', 'add_topup', {
    successMessage: (r) => `Top-up added — the balance is now ${r.balance.toLocaleString('en-US')} tokens.`,
    errorMessage: 'The top-up was not added.',
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['skill', 'tenant'] }); },
  });
}
