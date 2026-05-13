/**
 * profile-skill — service layer
 *
 * Reads/writes gt_tenant_profile and gt_tenant_profile_history.
 * Computes a weighted completion_score (product 0-40 / icp 0-30 /
 * gtm 0-20 / vision 0-10) — is_complete is generated from this in SQL.
 *
 * Every write uses createTenantDb (RLS context set per connection) and
 * is wrapped in a transaction so the upsert + history insert succeed or
 * fail together.
 */

import { readFileSync } from 'fs';
import path from 'path';
import type { Pool } from 'pg';
import { createTenantDb } from '../../db';

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

/* ── SQL files (loaded once at module init) ─────────────────────────────── */

const SQL_GET_PROFILE = readFileSync(
  path.join(__dirname, 'queries', 'get-profile.sql'),
  'utf-8',
);

const SQL_UPSERT_PROFILE = readFileSync(
  path.join(__dirname, 'queries', 'upsert-profile.sql'),
  'utf-8',
);

const SQL_INSERT_HISTORY = `
  INSERT INTO gt_tenant_profile_history
      (tenant_id, version, snapshot, changed_by, change_note)
    VALUES
      ($tenant_id, $version, $snapshot::jsonb, $changed_by, $change_note)
`;

/* ── Helper: hasValue ───────────────────────────────────────────────────── */

function hasValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string')         return v.trim() !== '';
  if (typeof v === 'number')         return v > 0;
  if (Array.isArray(v))              return v.length > 0;
  return false;
}

/* ── 1. calculateCompletionScore ────────────────────────────────────────── */

export function calculateCompletionScore(
  profile: Partial<TenantProfile>,
): { score: number; detail: CompletionDetail } {
  // PRODUCT — 40 max, 5 pts each
  let product = 0;
  if (hasValue(profile.product_name))        product += 5;
  if (hasValue(profile.product_description)) product += 5;
  if (hasValue(profile.core_problem))        product += 5;
  if (hasValue(profile.product_tagline))     product += 5;
  if (hasValue(profile.product_category))    product += 5;
  if (hasValue(profile.pricing_model))       product += 5;
  if (hasValue(profile.key_differentiators)) product += 5;
  if (hasValue(profile.pricing_range))       product += 5;

  // ICP — 30 max, 5 pts each
  let icp = 0;
  if (hasValue(profile.icp_role))            icp += 5;
  if (hasValue(profile.icp_company_type))    icp += 5;
  if (hasValue(profile.icp_industry))        icp += 5;
  if (hasValue(profile.icp_geography))       icp += 5;
  if (hasValue(profile.icp_company_size))    icp += 5;
  if (hasValue(profile.primary_pain_points)) icp += 5;

  // GTM — 20 max, 5 pts each
  let gtm = 0;
  if (hasValue(profile.gtm_stage))           gtm += 5;
  if (hasValue(profile.active_channels))     gtm += 5;
  if (hasValue(profile.current_mrr))         gtm += 5;
  if (hasValue(profile.team_size))           gtm += 5;

  // VISION — 10 max, 5 pts each
  let vision = 0;
  if (hasValue(profile.vision_statement))    vision += 5;
  if (hasValue(profile.target_market_size))  vision += 5;

  const score = Math.min(100, product + icp + gtm + vision);
  return { score, detail: { product, icp, gtm, vision } };
}

/* ── 2. getProfile ──────────────────────────────────────────────────────── */

export async function getProfile(
  pool: Pool,
  tenantId: string,
): Promise<TenantProfile | null> {
  const db = createTenantDb(pool, tenantId);
  const result = await db.query<TenantProfile>(SQL_GET_PROFILE, {
    tenant_id: tenantId,
  });
  return result.rows[0] ?? null;
}

/* ── 3. upsertProfile ───────────────────────────────────────────────────── */

export async function upsertProfile(
  pool: Pool,
  tenantId: string,
  fields: Partial<TenantProfile>,
  changedBy: string,
  changeNote?: string,
): Promise<TenantProfile> {
  // STEP 1 — merge with existing, compute score on the merged result
  const existing = await getProfile(pool, tenantId);
  const merged: Partial<TenantProfile> = { ...(existing ?? {}), ...fields };
  const { score, detail } = calculateCompletionScore(merged);

  // STEP 2 + 3 — upsert + history snapshot in one transaction
  const db = createTenantDb(pool, tenantId);
  return db.transaction(async (tx) => {
    const upsertResult = await tx.query<TenantProfile>(SQL_UPSERT_PROFILE, {
      tenant_id:           tenantId,
      product_name:        fields.product_name        ?? null,
      product_tagline:     fields.product_tagline     ?? null,
      product_category:    fields.product_category    ?? null,
      product_description: fields.product_description ?? null,
      core_problem:        fields.core_problem        ?? null,
      key_differentiators: fields.key_differentiators ?? null,
      pricing_model:       fields.pricing_model       ?? null,
      pricing_range:       fields.pricing_range       ?? null,
      icp_role:            fields.icp_role            ?? null,
      icp_company_type:    fields.icp_company_type    ?? null,
      icp_company_size:    fields.icp_company_size    ?? null,
      icp_industry:        fields.icp_industry        ?? null,
      icp_geography:       fields.icp_geography       ?? null,
      primary_pain_points: fields.primary_pain_points ?? null,
      gtm_stage:           fields.gtm_stage           ?? null,
      active_channels:     fields.active_channels     ?? null,
      current_mrr:         fields.current_mrr         ?? null,
      team_size:           fields.team_size           ?? null,
      vision_statement:    fields.vision_statement    ?? null,
      target_market_size:  fields.target_market_size  ?? null,
      completion_score:    score,
      completion_detail:   JSON.stringify(detail),
      source:              fields.source ?? 'human',
    });

    const saved = upsertResult.rows[0];

    await tx.query(SQL_INSERT_HISTORY, {
      tenant_id:   tenantId,
      version:     saved.version,
      snapshot:    JSON.stringify(saved),
      changed_by:  changedBy,
      change_note: changeNote ?? null,
    });

    return saved;
  });
}
