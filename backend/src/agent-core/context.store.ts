/**
 * Vikuna Agent Core — Tenant Context Store
 *
 * Reads/writes gt_tenant_context (shared per-tenant memory across all agents).
 *
 * Structure:
 *   profile           — flat product/ICP/GTM facts the human approved
 *   knowledge         — keyed by agent: { "vani-skill": {...}, "icp-skill": {...} }
 *   flags             — onboarding steps, feature flags, agent run counts
 *   daily_token_usage — { "YYYY-MM-DD": { "vps": N, "escalation": M } }
 *   daily_token_limit — int, default 100k
 *
 * Helpers here are intentionally small. Agents read/write JSONB directly
 * via the SkillDb because the shape evolves per agent.
 */

import type { Pool } from 'pg';
import { createTenantDb } from '../db';

export interface TenantContext {
  id: string;
  tenant_id: string;
  profile: Record<string, unknown>;
  knowledge: Record<string, Record<string, unknown>>;
  flags: Record<string, unknown>;
  daily_token_usage: Record<string, { vps?: number; escalation?: number }>;
  daily_token_limit: number;
  version: number;
  updated_by: string | null;
  updated_at: Date;
  created_at: Date;
}

/**
 * Ensure a gt_tenant_context row exists for this tenant.
 * Idempotent — safe to call on every agent run.
 */
export async function ensureTenantContext(
  pool: Pool,
  tenantId: string,
): Promise<void> {
  const db = createTenantDb(pool, tenantId);
  await db.query(
    `INSERT INTO gt_tenant_context (tenant_id)
       VALUES ($tenant_id)
     ON CONFLICT (tenant_id) DO NOTHING`,
    { tenant_id: tenantId },
  );
}

/**
 * Load the full context row for a tenant.
 * Returns null when no row exists (caller may want to seed it first).
 */
export async function getTenantContext(
  pool: Pool,
  tenantId: string,
): Promise<TenantContext | null> {
  const db = createTenantDb(pool, tenantId);
  const result = await db.query<TenantContext>(
    `SELECT id, tenant_id, profile, knowledge, flags,
            daily_token_usage, daily_token_limit,
            version, updated_by, updated_at, created_at
       FROM gt_tenant_context
      WHERE tenant_id = $tenant_id`,
    { tenant_id: tenantId },
  );
  return result.rows[0] ?? null;
}

/**
 * Merge a partial knowledge patch into context.knowledge[agentKey].
 * Uses JSONB || for shallow merge.
 *
 * Example:
 *   mergeAgentKnowledge(pool, tenantId, 'vani-skill',
 *     { status: 'gathering', conversation: [...], run_id: '42' });
 */
export async function mergeAgentKnowledge(
  pool: Pool,
  tenantId: string,
  agentKey: string,
  patch: Record<string, unknown>,
  updatedBy = 'agent-core',
): Promise<void> {
  const db = createTenantDb(pool, tenantId);
  await db.query(
    `UPDATE gt_tenant_context
        SET knowledge  = knowledge || jsonb_build_object($agent_key::text, $patch::jsonb),
            updated_by = $updated_by,
            updated_at = now(),
            version    = version + 1
      WHERE tenant_id = $tenant_id`,
    {
      tenant_id:  tenantId,
      agent_key:  agentKey,
      patch:      JSON.stringify(patch),
      updated_by: updatedBy,
    },
  );
}

/**
 * Merge a partial patch into context.profile.
 * Use this when an agent extracts validated profile facts.
 */
export async function mergeProfile(
  pool: Pool,
  tenantId: string,
  patch: Record<string, unknown>,
  updatedBy = 'agent-core',
): Promise<void> {
  const db = createTenantDb(pool, tenantId);
  await db.query(
    `UPDATE gt_tenant_context
        SET profile    = profile || $patch::jsonb,
            updated_by = $updated_by,
            updated_at = now(),
            version    = version + 1
      WHERE tenant_id = $tenant_id`,
    {
      tenant_id:  tenantId,
      patch:      JSON.stringify(patch),
      updated_by: updatedBy,
    },
  );
}
