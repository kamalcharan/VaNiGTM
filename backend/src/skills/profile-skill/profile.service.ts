/**
 * profile-skill — service layer (stubs only, Phase 2 Stage 2)
 *
 * Reads/writes gt_tenant_profile and gt_tenant_profile_history.
 * Implementations land in later stages.
 */

import type { Pool } from 'pg';

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface CompletionDetail {
  product: number;  // 0-40
  icp: number;      // 0-30
  gtm: number;      // 0-20
  vision: number;   // 0-10
}

export interface TenantProfile {
  id: string;
  tenant_id: string;

  product_name: string | null;
  product_tagline: string | null;
  product_category: string | null;
  product_description: string | null;
  core_problem: string | null;
  key_differentiators: string[] | null;
  pricing_model: string | null;
  pricing_range: string | null;

  icp_role: string | null;
  icp_company_type: string | null;
  icp_company_size: string | null;
  icp_industry: string | null;
  icp_geography: string | null;
  primary_pain_points: string[] | null;

  gtm_stage: string | null;
  active_channels: string[] | null;
  current_mrr: string | null;
  team_size: number | null;

  vision_statement: string | null;
  target_market_size: string | null;

  completion_score: number;
  completion_detail: CompletionDetail;
  is_complete: boolean;
  source: string;
  version: number;
  approved_at: Date | null;
  approved_by: string | null;
  created_at: Date;
  updated_at: Date;
}

/* ── Functions ──────────────────────────────────────────────────────────── */

export function calculateCompletionScore(
  _profile: Partial<TenantProfile>,
): { score: number; detail: CompletionDetail } {
  throw new Error('NOT_IMPLEMENTED');
}

export async function getProfile(
  _pool: Pool,
  _tenantId: string,
): Promise<TenantProfile | null> {
  throw new Error('NOT_IMPLEMENTED');
}

export async function upsertProfile(
  _pool: Pool,
  _tenantId: string,
  _fields: Partial<TenantProfile>,
  _changedBy: string,
): Promise<TenantProfile> {
  throw new Error('NOT_IMPLEMENTED');
}
