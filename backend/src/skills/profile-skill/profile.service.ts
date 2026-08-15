/**
 * profile-skill — service layer
 *
 * Reads/writes gt_tenant_profile and gt_tenant_profile_history.
 * Computes a weighted completion_score against the wizard's 5 real steps —
 * research 15 / vocabulary 15 / competitors 20 / ideal customer 25 / brand 25
 * (Complete the Mission Wizard, 2026-08-14) — is_complete is generated from
 * this in SQL. research/icp score field PRESENCE; vocabulary/competitors/
 * brand score CONFIRMED state only (their own tables already gate on
 * approval/confirmation, so an unconfirmed draft earns nothing).
 *
 * Every write uses createTenantDb (RLS context set per connection) and
 * is wrapped in a transaction so the upsert + history insert succeed or
 * fail together.
 */

import { readFileSync } from 'fs';
import path from 'path';
import type { Pool } from 'pg';
import { createTenantDb } from '../../db';
import { getNodes } from '../../agent-core/kg.store';
import { emitEvent } from '../../agent-core/event.store';
import { getBrand, type TenantBrand, type BrandVisual } from './brand.service';
import { listClusters } from './cluster.service';

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface CompletionDetail {
  research: number;     // 0-15
  vocabulary: number;   // 0-15
  competitors: number;  // 0-20
  icp: number;           // 0-25
  brand: number;          // 0-25
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

/* ── 1. calculateProfileScoreV2 ─────────────────────────────────────────── */

export interface ScoreInputs {
  profile: Partial<TenantProfile>;
  approvedClusterCount: number;
  confirmedCompetitorCount: number;
  brand: Partial<TenantBrand> | null;
}

export function calculateProfileScoreV2(
  inputs: ScoreInputs,
): { score: number; detail: CompletionDetail } {
  const { profile, approvedClusterCount, confirmedCompetitorCount, brand } = inputs;

  // RESEARCH — 15 max, scaled from the same 8 product fields step 1 fills
  let filledResearch = 0;
  if (hasValue(profile.product_name))        filledResearch++;
  if (hasValue(profile.product_description)) filledResearch++;
  if (hasValue(profile.core_problem))        filledResearch++;
  if (hasValue(profile.product_tagline))     filledResearch++;
  if (hasValue(profile.product_category))    filledResearch++;
  if (hasValue(profile.pricing_model))       filledResearch++;
  if (hasValue(profile.key_differentiators)) filledResearch++;
  if (hasValue(profile.pricing_range))       filledResearch++;
  const research = Math.round(15 * filledResearch / 8);

  // VOCABULARY — 15 max, 5 pts per approved cluster (3 clusters = full credit).
  // Draft-only clusters earn nothing — confirmation is the gate, same as the
  // wizard's own propose/confirm step.
  const vocabulary = Math.min(15, approvedClusterCount * 5);

  // COMPETITORS — 20 max, 5 pts per confirmed competitor (4 = full credit).
  const competitors = Math.min(20, confirmedCompetitorCount * 5);

  // IDEAL CUSTOMER — 25 max: 20 base across the 6 ICP fields + up to 5
  // richness bonus for how many pain points were actually captured — a
  // confirmed ICP with one pain point should not score the same as one
  // with five.
  let filledIcp = 0;
  if (hasValue(profile.icp_role))            filledIcp++;
  if (hasValue(profile.icp_company_type))    filledIcp++;
  if (hasValue(profile.icp_industry))        filledIcp++;
  if (hasValue(profile.icp_geography))       filledIcp++;
  if (hasValue(profile.icp_company_size))    filledIcp++;
  if (hasValue(profile.primary_pain_points)) filledIcp++;
  const icpBase = Math.round(20 * filledIcp / 6);
  const painRichness = Math.min(5, profile.primary_pain_points?.length ?? 0);
  const icp = Math.min(25, icpBase + painRichness);

  // BRAND — 25 max, gated on approval (an unconfirmed draft earns nothing).
  // 5 pts per section, prorated by how much was actually captured in each —
  // richness inside the section, same idea as the ICP pain-point bonus.
  let brandScore = 0;
  if (brand?.approved_at) {
    const voice   = Math.min(5, Math.round(5 * (brand.voice_tone?.length ?? 0) / 3));
    const always  = Math.min(5, Math.round(5 * (brand.always_say?.length ?? 0) / 2));
    const never   = Math.min(5, Math.round(5 * (brand.never_say?.length ?? 0) / 2));
    const visual  = (brand.visual ?? {}) as BrandVisual;
    // Primary is the one role that gates credit — secondary/accent are
    // genuinely optional (not every brand has three distinct colors), so
    // requiring them would penalize a legitimately two-color brand.
    const visualHits = [Boolean(visual.logo_url), Boolean(visual.primary_color)].filter(Boolean).length;
    const visualPts = Math.round(5 * visualHits / 2);
    const proofPts  = (brand.proof?.length ?? 0) > 0 ? 5 : 0;
    brandScore = voice + always + never + visualPts + proofPts;
  }

  const score = Math.min(100, research + vocabulary + competitors + icp + brandScore);
  return { score, detail: { research, vocabulary, competitors, icp, brand: brandScore } };
}

/** Gathers the 4 inputs calculateProfileScoreV2 needs. `profile` is passed in
 *  by callers that already have it (e.g. upsertProfile's merged fields)
 *  rather than re-fetched, so a profile write and its score reflect the
 *  exact same in-flight data. */
async function gatherScoreInputs(
  pool: Pool,
  tenantId: string,
  profile: Partial<TenantProfile>,
): Promise<ScoreInputs> {
  const db = createTenantDb(pool, tenantId);
  const [approvedClusters, competitorCountResult, brand] = await Promise.all([
    listClusters(pool, tenantId, { approvedOnly: true }),
    db.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM gt_kg_nodes
        WHERE tenant_id = $tenant_id AND label = 'Competitor'
          AND properties->>'confirmed' = 'true'`,
      { tenant_id: tenantId },
    ),
    getBrand(pool, tenantId),
  ]);
  return {
    profile,
    approvedClusterCount: approvedClusters.length,
    confirmedCompetitorCount: parseInt(competitorCountResult.rows[0]?.count ?? '0', 10),
    brand,
  };
}

/** Public: recompute and persist the score without touching profile fields —
 *  for call sites that changed something OTHER than gt_tenant_profile
 *  (vocabulary approval, competitor confirmation, brand approval). */
export async function recomputeProfileScore(
  pool: Pool,
  tenantId: string,
): Promise<{ score: number; detail: CompletionDetail }> {
  const profile = await getProfile(pool, tenantId);
  if (!profile) {
    return { score: 0, detail: { research: 0, vocabulary: 0, competitors: 0, icp: 0, brand: 0 } };
  }

  const inputs = await gatherScoreInputs(pool, tenantId, profile);
  const { score, detail } = calculateProfileScoreV2(inputs);

  const db = createTenantDb(pool, tenantId);
  await db.query(
    `UPDATE gt_tenant_profile
        SET completion_score = $score, completion_detail = $detail::jsonb
      WHERE tenant_id = $tenant_id`,
    { score, detail: JSON.stringify(detail), tenant_id: tenantId },
  );

  return { score, detail };
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
  // STEP 1 — merge with existing, compute the full 5-section score on the
  // merged result (vocabulary/competitors/brand come from their own tables —
  // see gatherScoreInputs — so a profile-only edit still reflects their
  // current confirmed state).
  const existing = await getProfile(pool, tenantId);
  const merged: Partial<TenantProfile> = { ...(existing ?? {}), ...fields };
  const inputs = await gatherScoreInputs(pool, tenantId, merged);
  const { score, detail } = calculateProfileScoreV2(inputs);

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

/* ── 4. recalculateProfileFromNodes ─────────────────────────────────────── */
// Shared tail for anything that mutates gt_kg_nodes and needs the typed
// profile recomputed from current graph state — VaNi's conversation flow
// (handleHumanApproved) and the ingestion pipeline's KNOWLEDGE_UPDATED
// handler both call this. The graph is source-agnostic (conversation, PDF,
// DOCX, PPTX, GDrive sync all write the same gt_kg_nodes rows), so this
// function re-reads whatever is currently there rather than trusting the
// caller to know which nodes changed.

export interface RecalculateProfileResult {
  profile: TenantProfile;
  missingFields: (keyof TenantProfile)[];
  crossedCompletionThreshold: boolean;
}

const REQUIRED_FOR_COMPLETION: (keyof TenantProfile)[] = [
  'product_name',
  'product_description',
  'core_problem',
  'icp_role',
];

export async function recalculateProfileFromNodes(
  pool: Pool,
  tenantId: string,
  source: string,
  changeNote: string,
  runId?: string,
): Promise<RecalculateProfileResult> {
  const nodes = await getNodes(pool, tenantId);

  // Conservative node → field mapping — first node wins per scalar field so
  // a thinner later node can't overwrite a richer earlier one. Arrays
  // (pain points, differentiators) accumulate across all nodes.
  const profileFields: Partial<TenantProfile> = {};
  const painPoints:      string[] = [];
  const differentiators: string[] = [];

  for (const node of nodes) {
    switch (node.label) {

      case 'Product':
        if (!profileFields.product_name) {
          profileFields.product_name = node.name;
        }
        if (!profileFields.product_description && node.description) {
          profileFields.product_description = node.description;
        }
        if (!profileFields.core_problem && node.properties?.core_problem) {
          profileFields.core_problem = String(node.properties.core_problem);
        }
        break;

      case 'PainPoint':
        painPoints.push(node.name);
        break;

      case 'ICP':
        if (!profileFields.icp_role) {
          profileFields.icp_role = node.name;
        }
        if (!profileFields.icp_company_type && node.description) {
          profileFields.icp_company_type = node.description;
        }
        if (node.properties?.industry) {
          profileFields.icp_industry = String(node.properties.industry);
        }
        break;

      case 'Differentiator':
        differentiators.push(node.name);
        break;

      case 'Team':
        if (node.properties?.headcount) {
          const n = parseInt(String(node.properties.headcount), 10);
          if (!isNaN(n)) profileFields.team_size = n;
        }
        break;

      case 'UseCase':
        if (!profileFields.product_description && node.description) {
          profileFields.product_description = node.description;
        }
        break;
    }
  }

  if (painPoints.length > 0) {
    profileFields.primary_pain_points = painPoints;
  }
  if (differentiators.length > 0) {
    profileFields.key_differentiators = differentiators;
  }

  const savedProfile = await upsertProfile(pool, tenantId, profileFields, source, changeNote);

  // Check minimum requirements for downstream agents to take over.
  const missingFields = REQUIRED_FOR_COMPLETION.filter((f) => !savedProfile[f]);
  const hasPainPoints = (savedProfile.primary_pain_points?.length ?? 0) >= 1;
  if (!hasPainPoints) missingFields.push('primary_pain_points');

  const crossedCompletionThreshold = missingFields.length === 0 && savedProfile.is_complete;

  if (crossedCompletionThreshold) {
    await emitEvent(
      pool,
      tenantId,
      'PROFILE_COMPLETE',
      'agent',
      {
        profile_id:       savedProfile.id,
        completion_score: savedProfile.completion_score,
        source,
      },
      runId,
    );
  }

  return { profile: savedProfile, missingFields, crossedCompletionThreshold };
}
