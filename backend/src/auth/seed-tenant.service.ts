/**
 * VaNi GTM — Tenant Seed Service
 *
 * Called immediately after a new tenant is created during registration.
 * Seeds per-tenant master data.
 *
 * What is seeded per tenant:
 *   - 2 sequence counters: 'contact' (CONT-XXXX), 'campaign' (GTM-XXXX)
 *     in gt_seq_counters (migration 189)
 *
 * MFD-era seeds (bookmark reasons, job scheduler configs) were removed in
 * Phase 0 Stage 0.3 — those tables are dropped by migration 188.
 *
 * This function is called INSIDE the existing registration transaction (client
 * passed in) so it rolls back automatically if registration fails.
 */

import type { PoolClient } from 'pg';

/**
 * Seed per-tenant master data rows.
 *
 * @param client  Active PG PoolClient (within the registration transaction)
 * @param tenantId  New tenant UUID
 */
export async function seedTenantData(
  client: PoolClient,
  tenantId: string,
): Promise<void> {
  /* ── Sequence counters (user-facing tenant-scoped IDs, CLAUDE.md rule) ── */

  await client.query(
    `INSERT INTO gt_seq_counters (tenant_id, sequence_type, prefix, last_value, pad_width)
     VALUES
       ($1, 'contact',  'CONT', 0, 4),
       ($1, 'campaign', 'GTM',  0, 4)
     ON CONFLICT (tenant_id, sequence_type) DO NOTHING`,
    [tenantId],
  );
}
