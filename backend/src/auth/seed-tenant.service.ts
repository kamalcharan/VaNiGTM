/**
 * KI-Prime — Tenant Seed Service
 *
 * Called immediately after a new tenant is created during registration.
 * Seeds per-tenant master data into the KI_ tables.
 *
 * What is seeded per tenant:
 *   - 8 bookmark reasons × 2 environments (live + sandbox) = 16 rows
 *   - 1 job scheduler config per non-global job type × 2 environments = 2 rows
 *     (PORTFOLIO_SNAPSHOT is the only per-tenant job at MVP)
 *
 * Global tables (ki_transaction_types, ki_asset_types, ki_job_types) are seeded
 * once via migration 017 and are NOT seeded here.
 *
 * This function is called INSIDE the existing registration transaction (client
 * passed in) so it rolls back automatically if registration fails.
 */

import type { PoolClient } from 'pg';

/* ── Default bookmark reasons (8 — matches kewalinvest 05_seed_data.sql) ── */

const DEFAULT_BOOKMARK_REASONS = [
  { code: 'VIP',              label: 'VIP Customer',          order: 1  },
  { code: 'FOLLOW_UP',        label: 'Follow-up Required',    order: 2  },
  { code: 'IMPORTANT',        label: 'Important',             order: 3  },
  { code: 'HIGH_VALUE',       label: 'High Value Client',     order: 4  },
  { code: 'ATTENTION',        label: 'Requires Attention',    order: 5  },
  { code: 'PORTFOLIO_REVIEW', label: 'Portfolio Review Due',  order: 6  },
  { code: 'TAX_PLANNING',     label: 'Tax Planning',          order: 7  },
  { code: 'OTHER',            label: 'Other (Custom)',         order: 99 },
] as const;

/* ── Per-tenant job types (non-global only) ─────────────────────────────── */

const PER_TENANT_JOBS = ['PORTFOLIO_SNAPSHOT'] as const;

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
  /* ── 1. Bookmark reasons (live + sandbox) ── */

  const reasonRows = DEFAULT_BOOKMARK_REASONS.flatMap((r) => [
    [tenantId, true,  r.code, r.label, r.order],
    [tenantId, false, r.code, r.label, r.order],
  ]);

  // Build multi-row INSERT with positional params
  const reasonPlaceholders = reasonRows
    .map((_, i) => {
      const base = i * 5;
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
    })
    .join(', ');

  await client.query(
    `INSERT INTO ki_bookmark_reasons
       (tenant_id, is_live, reason_code, reason_label, display_order)
     VALUES ${reasonPlaceholders}
     ON CONFLICT (tenant_id, is_live, reason_code) DO NOTHING`,
    reasonRows.flat(),
  );

  /* ── 2. Job scheduler configs (per-tenant jobs × 2 environments) ── */

  // Load defaults from ki_job_types for the per-tenant jobs
  const jobTypesResult = await client.query<{
    code: string;
    default_cron_expression: string;
    default_max_retries: number;
    default_schedule_type: string;
    failover_enabled: boolean;
    failover_cron_expression: string | null;
  }>(
    `SELECT code, default_cron_expression, default_max_retries,
            default_schedule_type, failover_enabled, failover_cron_expression
     FROM ki_job_types
     WHERE code = ANY($1) AND is_active = true`,
    [PER_TENANT_JOBS],
  );

  for (const jt of jobTypesResult.rows) {
    for (const isLive of [true, false]) {
      await client.query(
        `INSERT INTO ki_job_scheduler_configs
           (tenant_id, job_type_code, is_live, schedule_type, cron_expression,
            is_enabled, max_retries, failover_enabled, failover_cron_expression)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (tenant_id, job_type_code, is_live) DO NOTHING`,
        [
          tenantId,
          jt.code,
          isLive,
          jt.default_schedule_type,
          jt.default_cron_expression,
          true,
          jt.default_max_retries,
          jt.failover_enabled,
          jt.failover_cron_expression,
        ],
      );
    }
  }
}
