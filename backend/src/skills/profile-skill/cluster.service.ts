/**
 * Semantic clusters — the tenant's market vocabulary.
 *
 * WHY (user ruling, 2026-07-27): competitor research used to frame its web
 * searches from a one-shot LLM guess off the raw profile, which produced
 * category-generic results (a fractional-CDO boutique matched against
 * Accenture). Competitors are defined by SHARED VOCABULARY SPACE, so the
 * vocabulary must be a curated, human-approved artifact — generated once,
 * ratified by the tenant, then reused by every agent that searches.
 *
 * Flow: profile drafted → generateClusters() (1 LLM call) → suggested
 * clusters → human confirms them with the ICP → research-skill frames
 * queries from the APPROVED clusters (and their related_terms).
 *
 * Phase 2 (design-notes-smartprofile-port.md) adds cluster_embedding +
 * HNSW on this same table for Lead Finder matching. Vocabulary first,
 * vectors second — you cannot embed clusters before they exist.
 */

import type { Pool } from 'pg';
import { z } from 'zod';
import { createTenantDb } from '../../db';
import { callLLMValidated } from '../../agent-core/llm.client';
import { loadPrompt } from '../../agent-core/prompt.store';
import { recomputeProfileScore } from './profile.service';

export const CLUSTER_TYPES = ['category', 'offering', 'buyer', 'pain', 'outcome'] as const;
export type ClusterType = (typeof CLUSTER_TYPES)[number];

export interface SemanticCluster {
  id: string;
  primary_term: string;
  related_terms: string[];
  cluster_type: string;
  confidence_score: number | null;
  approved_at: string | null;
  is_active: boolean;
}

const ClustersSchema = z.object({
  clusters: z.array(z.object({
    primary_term: z.string().min(2),
    related_terms: z.array(z.string()).default([]),
    cluster_type: z.string().default('category'),
    confidence_score: z.number().optional(),
  })).min(1).max(8),
});

const MAX_RELATED_TERMS = 15;

/** Lowercase + trim + dedupe; small models are sloppy about all three. */
function normalizeTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of terms) {
    const t = String(raw ?? '').toLowerCase().trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_RELATED_TERMS) break;
  }
  return out;
}

function normalizeType(value: string): ClusterType {
  const t = String(value ?? '').toLowerCase().trim() as ClusterType;
  return (CLUSTER_TYPES as readonly string[]).includes(t) ? t : 'category';
}

/** Clamp to [0,1] — the ContractNest port did this and it matters on qwen. */
function clampConfidence(value: number | undefined): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return Math.min(1, Math.max(0, value));
}

/* ── Read ────────────────────────────────────────────────────────────── */

export async function listClusters(
  pool: Pool,
  tenantId: string,
  opts: { approvedOnly?: boolean } = {},
): Promise<SemanticCluster[]> {
  const db = createTenantDb(pool, tenantId);
  const result = await db.query<SemanticCluster>(
    `SELECT id, primary_term, related_terms, cluster_type,
            confidence_score, approved_at, is_active
       FROM gt_semantic_clusters
      WHERE tenant_id = $tenant_id
        AND is_active = true
        ${opts.approvedOnly ? 'AND approved_at IS NOT NULL' : ''}
      ORDER BY (cluster_type = 'category') DESC, confidence_score DESC NULLS LAST, primary_term`,
    { tenant_id: tenantId },
  );
  return result.rows;
}

/* ── Generate (1 LLM call, agent-suggested) ──────────────────────────── */

interface ProfileRow {
  product_name: string | null;
  product_description: string | null;
  core_problem: string | null;
  key_differentiators: string[] | null;
  icp_role: string | null;
  icp_company_type: string | null;
  icp_industry: string | null;
  primary_pain_points: string[] | null;
}

/**
 * Draft the tenant's clusters from their profile. Idempotent by
 * (tenant_id, is_live, lower(primary_term)) — re-running refreshes terms
 * and NEVER clobbers a human approval or a human-authored cluster.
 *
 * Returns the full current cluster set.
 */
export async function generateClusters(
  pool: Pool,
  tenantId: string,
  runId: string | number,
): Promise<SemanticCluster[]> {
  const db = createTenantDb(pool, tenantId);

  const profileResult = await db.query<ProfileRow>(
    `SELECT product_name, product_description, core_problem,
            key_differentiators, icp_role, icp_company_type,
            icp_industry, primary_pain_points
       FROM gt_tenant_profile
      WHERE tenant_id = $tenant_id`,
    { tenant_id: tenantId },
  );
  const profile = profileResult.rows[0];
  if (!profile?.product_name && !profile?.product_description) {
    throw new Error('PROFILE_NOT_FOUND: cannot build market vocabulary without a drafted profile');
  }

  const system = await loadPrompt(pool, 'profile-skill.semantic_clusters', tenantId);

  const profileContext = JSON.stringify({
    product_name: profile.product_name,
    product_description: profile.product_description,
    core_problem: profile.core_problem,
    key_differentiators: (profile.key_differentiators ?? []).slice(0, 5),
    icp_role: profile.icp_role,
    icp_company_type: profile.icp_company_type,
    icp_industry: profile.icp_industry,
    primary_pain_points: (profile.primary_pain_points ?? []).slice(0, 5),
  }, null, 2);

  const drafted = await callLLMValidated(
    {
      pool, tenantId, runId,
      system,
      messages: [{ role: 'user', content: `Company profile:\n${profileContext}` }],
      maxTokens: 1200,
    },
    ClustersSchema,
    'clusters',
  );

  await db.transaction(async (tx) => {
    for (const c of drafted.clusters) {
      const primary = String(c.primary_term).toLowerCase().trim();
      if (!primary) continue;

      // Agent refresh must never overwrite a human decision: an approved or
      // human-authored cluster keeps its terms and its approval.
      await tx.query(
        `INSERT INTO gt_semantic_clusters
             (tenant_id, primary_term, related_terms, cluster_type,
              confidence_score, source, source_run_id)
           VALUES
             ($tenant_id, $primary_term, $related_terms::text[], $cluster_type,
              $confidence, 'agent', $run_id)
         ON CONFLICT (tenant_id, is_live, lower(primary_term)) DO UPDATE
             SET related_terms    = CASE
                   WHEN gt_semantic_clusters.approved_at IS NULL
                        AND gt_semantic_clusters.source = 'agent'
                   THEN EXCLUDED.related_terms
                   ELSE gt_semantic_clusters.related_terms END,
                 cluster_type     = CASE
                   WHEN gt_semantic_clusters.approved_at IS NULL
                        AND gt_semantic_clusters.source = 'agent'
                   THEN EXCLUDED.cluster_type
                   ELSE gt_semantic_clusters.cluster_type END,
                 confidence_score = EXCLUDED.confidence_score,
                 updated_at       = now()`,
        {
          tenant_id:     tenantId,
          primary_term:  primary,
          related_terms: normalizeTerms(c.related_terms ?? []),
          cluster_type:  normalizeType(c.cluster_type),
          confidence:    clampConfidence(c.confidence_score),
          run_id:        runId,
        },
      );
    }
  });

  return listClusters(pool, tenantId);
}

/* ── Human gate ──────────────────────────────────────────────────────── */

/**
 * Ratify the vocabulary. `edits` carries per-cluster human corrections
 * (renamed term, curated related_terms, changed type); `remove` deactivates
 * clusters the tenant rejected. Everything left active is approved.
 */
export async function approveClusters(
  pool: Pool,
  tenantId: string,
  edits: Array<{ id: string; primary_term?: string; related_terms?: string[]; cluster_type?: string }> = [],
  remove: string[] = [],
): Promise<SemanticCluster[]> {
  const db = createTenantDb(pool, tenantId);

  await db.transaction(async (tx) => {
    for (const id of remove) {
      await tx.query(
        `UPDATE gt_semantic_clusters
            SET is_active = false, updated_at = now()
          WHERE id = $id AND tenant_id = $tenant_id`,
        { id, tenant_id: tenantId },
      );
    }

    for (const edit of edits) {
      const fields: string[] = [];
      const params: Record<string, unknown> = { id: edit.id, tenant_id: tenantId };

      if (typeof edit.primary_term === 'string' && edit.primary_term.trim()) {
        fields.push('primary_term = $primary_term');
        params.primary_term = edit.primary_term.toLowerCase().trim();
      }
      if (Array.isArray(edit.related_terms)) {
        fields.push('related_terms = $related_terms::text[]');
        params.related_terms = normalizeTerms(edit.related_terms);
      }
      if (typeof edit.cluster_type === 'string') {
        fields.push('cluster_type = $cluster_type');
        params.cluster_type = normalizeType(edit.cluster_type);
      }
      if (fields.length === 0) continue;

      // A human touch marks the row human-owned so agent refreshes leave it be.
      fields.push("source = 'human'");
      await tx.query(
        `UPDATE gt_semantic_clusters
            SET ${fields.join(', ')}, updated_at = now()
          WHERE id = $id AND tenant_id = $tenant_id`,
        params,
      );
    }

    // Approve whatever survived.
    await tx.query(
      `UPDATE gt_semantic_clusters
          SET approved_at = now(), updated_at = now()
        WHERE tenant_id = $tenant_id AND is_active = true AND approved_at IS NULL`,
      { tenant_id: tenantId },
    );
  });

  // The wizard's vocabulary section of profile_score is gated on approved
  // clusters (see profile.service.ts calculateProfileScoreV2) — recompute now
  // that the approval just landed.
  await recomputeProfileScore(pool, tenantId);

  return listClusters(pool, tenantId);
}
