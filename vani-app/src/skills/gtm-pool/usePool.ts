'use client';
/**
 * pool-skill, for the console (common pool P1-B). Every function is admin
 * only on the server; these hooks only ask. Shapes follow
 * backend/src/skills/pool-skill/SKILL.md.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery } from '@/lib/useSkill';
import { useSkillMutation } from '@/lib/useSkillMutation';

export type CheckStatus = 'pass' | 'fail' | 'pending' | 'review' | 'na';
export interface Check { key: string; label: string; status: CheckStatus; detail: string }
export type Lifecycle = 'candidate' | 'enriching' | 'held' | 'complete' | 'junk';

export interface PoolSource {
  id: number; code: string; name: string; kind: string; tier: number; licence_class: string | null;
  may_enter_pool: boolean; is_active: boolean; deliveries: number; retired_deliveries: number;
  rows_staged: number; source_rows: number; in_pool: number;
}
export interface SourcesResult { sources: PoolSource[]; pool: Record<Lifecycle, number> }

export interface Delivery {
  id: string; label: string; region: string | null; as_of: string | null; status: 'active' | 'retired' | 'failed';
  loaded_at: string; load_kind: string; source_code: string; source_name: string;
  staged: number; staged_junk: number; staged_held: number; source_rows: number; unmatched: number;
  complete: number; waiting: number; held: number; junk: number; duplicates: number;
}

export type RowState = 'all' | 'waiting' | 'complete' | 'held' | 'junk' | 'duplicate' | 'unmatched';
export interface DeliveryRow {
  company_id?: string; source_row_id: string; name: string; city: string | null; state_code: string | null;
  domain_normalized: string | null; industry_raw: string | null; pin: string | null;
  lifecycle_state?: Lifecycle; junk_reason?: string | null; needs_review?: boolean; duplicate_of_id?: string | null;
  is_individual?: boolean | null; passed?: number | null; total_checks?: number | null;
  open?: Array<{ key: string; label: string; status: CheckStatus }>;
}
export interface RowsResult { state: RowState; total: number; rows: DeliveryRow[] }

export interface CompanySource {
  id: string; source_code: string; source_name: string; tier: number; load_label: string; load_status: string;
  as_of: string | null; method: string | null; is_decision: boolean; name: string; city: string | null;
  domain_normalized: string | null; industry_raw: string | null; raw: Record<string, unknown> | null;
}
export interface CompanyResult {
  company: (Record<string, any> & {
    id: string; name: string; lifecycle_state: Lifecycle; junk_reason: string | null; needs_review: boolean;
    duplicate_of_id: string | null; duplicate_of_name: string | null; industry_name: string | null;
    complete_checks: { passed?: number; total?: number; checks?: Check[]; at?: string };
    field_sources: Record<string, { source: string; row?: number; as_of?: string | null; via?: string }>;
    source_codes: string[]; admitted_at: string | null;
  }) | null;
  sources: CompanySource[];
  /** Release 4: where each value came from — a delivery, or an enrichment run's page, model and confidence. */
  provenance?: {
    rows: Array<{ field: string; label: string; value: string; from: string; wins_over?: string }>;
    enrichment: { run_no: number; event_id: string; site: 'live' | 'js_only' | 'not_live'; reason: string | null;
      before: { score: number; level: string } | null; refreshed_at: string | null } | null;
  };
  reason?: 'NOT_FOUND';
}

export interface IndustryNode {
  id: number; code: string; name: string; parent_id: number | null; nic_prefixes: string[]; source: string;
  in_pool: number; companies: number; children: IndustryNode[];
}

export const useSources = (enabled = true) => useSkillQuery<SourcesResult>('pool-skill', 'sources', {}, { enabled });
export const useDeliveries = (enabled = true) => useSkillQuery<{ deliveries: Delivery[] }>('pool-skill', 'deliveries', {}, { enabled });
export const useDeliveryRows = (loadId: string, state: RowState, page: number, limit = 50) =>
  useSkillQuery<RowsResult>('pool-skill', 'delivery_rows', { load_id: loadId, state, limit, offset: (page - 1) * limit });
export const useCompany = (companyId: string | null) =>
  useSkillQuery<CompanyResult>('pool-skill', 'company', { company_id: companyId ?? '' }, { enabled: !!companyId });
export const useIndustries = () => useSkillQuery<{ industries: IndustryNode[] }>('pool-skill', 'industries', {});

export const JUNK_REASONS: Array<{ code: string; label: string }> = [
  { code: 'placeholder', label: 'Placeholder or test' },
  { code: 'unreadable', label: 'Unreadable' },
  { code: 'consumer', label: 'A consumer, not a business' },
  { code: 'defunct', label: 'Defunct' },
  { code: 'out_of_scope', label: 'Out of scope' },
  { code: 'spam_source', label: 'Spam source' },
];

/** The writes. Each re-reads everything about the pool, since one decision moves counts on every screen. */
export function usePoolWrites() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['skill', 'pool-skill'] });
  const decide = useSkillMutation<{ company: { lifecycle_state: Lifecycle } }>('pool-skill', 'decide', {
    successMessage: (r) => `Recorded — the company is now ${r.company.lifecycle_state === 'complete' ? 'in the pool' : r.company.lifecycle_state}.`,
    errorMessage: 'The decision was not recorded.',
    onSuccess: refresh,
  });
  const retire = useSkillMutation<{ retired: number; companies_retested: number }>('pool-skill', 'retire_delivery', {
    successMessage: (r) => `Delivery retired — its rows are kept, and ${r.companies_retested.toLocaleString()} companies were re-tested.`,
    errorMessage: 'The delivery was not retired.',
    onSuccess: refresh,
  });
  const resolve = useSkillMutation<{ event_id: string }>('pool-skill', 'resolve', {
    successMessage: () => 'Matching queued — follow it under Runs; the counts here update as it works.',
    errorMessage: 'The matching job was not queued.',
    onSuccess: refresh,
  });
  return { decide, retire, resolve };
}
