/**
 * assessment-skill — seed an assessment definition from a JSON file into
 * gt_assessment_def, under the Vikuna Consulting tenant (migration 228).
 *
 * Usage:
 *   npm run db:seed-assessment
 *   npm run db:seed-assessment -- path/to/other-definition.json
 *
 * Idempotent: ON CONFLICT (tenant_id, is_live, service_slug, version) DO
 * NOTHING — re-running with the same file is a no-op, matching this
 * codebase's migration idempotency convention.
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

const DEFAULT_FILE = path.join(__dirname, '../../../migrations/ai-recovery-assessment-v1.json');

// Must match the tenant the assessment writes leads under and the tenant
// the console reads them from — assessment.agent.ts and seed-owner.ts read
// the same variable. A definition seeded under a different tenant than the
// one serving requests makes /a/:slug 404 with nothing obviously wrong.
const TENANT_SLUG = process.env.VANI_TENANT_SLUG || 'vikuna-consulting';

async function main(): Promise<void> {
  const filePath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_FILE;
  console.log(`[SeedAssessment] Reading ${filePath}`);

  const raw = fs.readFileSync(filePath, 'utf-8');
  const definition = JSON.parse(raw);

  if (!definition.service_slug || !definition.version) {
    throw new Error('Definition JSON must have service_slug and version at the top level');
  }

  const connectionString = process.env.DB_PRIMARY;
  if (!connectionString) {
    console.error('[SeedAssessment] DB_PRIMARY is required.');
    process.exit(1);
  }
  const pool = new Pool({
    connectionString,
    max: 2,
    ssl: process.env.DB_PRIMARY_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  try {
    const tenantResult = await pool.query<{ id: string }>(
      `SELECT id FROM vn_tenants WHERE slug = $1`, [TENANT_SLUG],
    );
    const tenant = tenantResult.rows[0];
    if (!tenant) {
      throw new Error(
        `VANI_TENANT_NOT_FOUND: no tenant with slug '${TENANT_SLUG}'. Apply migration 228, or set VANI_TENANT_SLUG.`,
      );
    }

    const result = await pool.query<{ id: string }>(
      `INSERT INTO gt_assessment_def (tenant_id, service_slug, version, definition, public, hold_for_review, is_active)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, true)
       ON CONFLICT (tenant_id, is_live, service_slug, version) DO NOTHING
       RETURNING id`,
      [
        tenant.id,
        definition.service_slug,
        definition.version,
        JSON.stringify(definition),
        definition.public ?? true,
        definition.hold_for_review ?? false,
      ],
    );

    if (result.rows.length > 0) {
      console.log(`[SeedAssessment] ✓ Seeded ${definition.service_slug} v${definition.version} (id=${result.rows[0].id})`);
    } else {
      console.log(`[SeedAssessment] ${definition.service_slug} v${definition.version} already seeded — nothing to do.`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[SeedAssessment] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
