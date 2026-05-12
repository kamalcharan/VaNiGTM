/**
 * VaNi-GTM — Dev Seed Script
 *
 * Creates the initial tenant + admin user so the app has a working login on
 * a freshly migrated database. Safe to re-run: skips if the admin email
 * already exists for the target tenant slug.
 *
 * Usage:
 *   npm run db:seed
 *
 * Reads from environment (with hardcoded fallbacks for this dev seed):
 *   SEED_TENANT_NAME   — default "Vikuna Technologies"
 *   SEED_TENANT_SLUG   — default "vikuna"
 *   SEED_ADMIN_NAME    — default "Charan"
 *   SEED_ADMIN_EMAIL   — default "charan@vikuna.in"
 *   SEED_ADMIN_PASS    — default "Vikuna2026Admin"
 *   SEED_IS_LIVE       — "true" | "false" (default "true"; controls KI bookmark/scheduler rows)
 */

import 'dotenv/config';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { seedTenantData } from './auth/seed-tenant.service';

const TENANT_NAME  = process.env.SEED_TENANT_NAME  || 'Vikuna Technologies';
const TENANT_SLUG  = process.env.SEED_TENANT_SLUG  || 'vikuna';
const ADMIN_NAME   = process.env.SEED_ADMIN_NAME   || 'Charan';
const ADMIN_EMAIL  = (process.env.SEED_ADMIN_EMAIL || 'charan@vikuna.in').toLowerCase();
const ADMIN_PASS   = process.env.SEED_ADMIN_PASS   || 'Vikuna2026Admin';
const DEFAULT_THEME = process.env.NEXT_PUBLIC_DEFAULT_THEME || 'vikuna-black';
const DEFAULT_COLOR = process.env.NEXT_PUBLIC_DEFAULT_COLOR_MODE || 'dark';

function makePool(): Pool {
  const connectionString = process.env.DB_PRIMARY;
  if (!connectionString) {
    console.error('[Seed] DB_PRIMARY is required.');
    process.exit(1);
  }
  return new Pool({
    connectionString,
    max: 2,
    ssl: process.env.DB_PRIMARY_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
}

async function main(): Promise<void> {
  const pool = makePool();
  console.log(`[Seed] Connecting to ${process.env.DB_PRIMARY?.replace(/\/\/.*@/, '//***@')}`);

  try {
    // Idempotency: if user already exists, exit cleanly
    const existing = await pool.query<{ id: string; tenant_id: string }>(
      'SELECT id, tenant_id FROM vn_users WHERE LOWER(email) = $1 LIMIT 1',
      [ADMIN_EMAIL],
    );
    if (existing.rows.length > 0) {
      console.log(`[Seed] Already seeded — user ${ADMIN_EMAIL} exists (id=${existing.rows[0].id}, tenant=${existing.rows[0].tenant_id}). Nothing to do.`);
      return;
    }

    const passwordHash = await bcrypt.hash(ADMIN_PASS, 12);
    const nameParts = ADMIN_NAME.split(' ');
    const firstName = nameParts[0] || ADMIN_NAME;
    const lastName  = nameParts.slice(1).join(' ') || '';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Tenant — create or reuse by slug
      let tenantId: string;
      const existingTenant = await client.query<{ id: string }>(
        'SELECT id FROM vn_tenants WHERE slug = $1',
        [TENANT_SLUG],
      );
      if (existingTenant.rows.length > 0) {
        tenantId = existingTenant.rows[0].id;
        console.log(`[Seed] Tenant '${TENANT_SLUG}' already exists (id=${tenantId}) — reusing.`);
      } else {
        const t = await client.query<{ id: string }>(
          `INSERT INTO vn_tenants (id, slug, status, is_admin, activated_at, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, 'active', true, now(), now(), now())
           RETURNING id`,
          [TENANT_SLUG],
        );
        tenantId = t.rows[0].id;
        console.log(`[Seed] Tenant created (slug=${TENANT_SLUG}, id=${tenantId}, is_admin=true)`);

        // 2. Tenant profile
        await client.query(
          `INSERT INTO vn_tenant_profiles
             (tenant_id, name, display_name, type, theme_id, currency, locale,
              email, country, settings, created_at, updated_at)
           VALUES
             ($1, $2, $2, 'pvt_ltd', $3, 'INR', 'en-IN', $4, 'India',
              '{}'::jsonb, now(), now())`,
          [tenantId, TENANT_NAME, DEFAULT_THEME, ADMIN_EMAIL],
        );
      }

      // 3. Admin user
      const u = await client.query<{ id: string }>(
        `INSERT INTO vn_users
           (id, tenant_id, email, password_hash, name, first_name, last_name,
            preferred_theme, preferences, is_active, is_email_verified, failed_login_count,
            intake_code, created_at, updated_at)
         VALUES
           (gen_random_uuid(), $1, $2, $3, $4, $5, $6,
            $7, $8::jsonb, true, true, 0,
            substring(encode(gen_random_bytes(5), 'hex'), 1, 8), now(), now())
         RETURNING id`,
        [
          tenantId, ADMIN_EMAIL, passwordHash, ADMIN_NAME, firstName, lastName,
          DEFAULT_THEME, JSON.stringify({ color_mode: DEFAULT_COLOR }),
        ],
      );
      const userId = u.rows[0].id;
      console.log(`[Seed] User created (email=${ADMIN_EMAIL}, id=${userId})`);

      // 4. Roles per tenant (owner / admin / planner) — match register()'s seed
      const roles = await client.query<{ id: string; code: string }>(
        `INSERT INTO vn_roles
           (id, tenant_id, code, name, description, is_system, is_default, sort_order, permissions, created_at, updated_at)
         VALUES
           (gen_random_uuid(), $1, 'owner', 'Owner', 'Tenant owner with full access', true, false, 1, '{"all": true}'::jsonb, now(), now()),
           (gen_random_uuid(), $1, 'admin', 'Admin', 'Administrator', true, false, 2, '{"manage_users": true, "manage_settings": true}'::jsonb, now(), now()),
           (gen_random_uuid(), $1, 'planner', 'Planner', 'Financial planner', true, true, 3, '{"view_clients": true, "manage_portfolio": true}'::jsonb, now(), now())
         ON CONFLICT DO NOTHING
         RETURNING id, code`,
        [tenantId],
      );
      let ownerRoleId = roles.rows.find(r => r.code === 'owner')?.id;
      if (!ownerRoleId) {
        const r = await client.query<{ id: string }>(
          `SELECT id FROM vn_roles WHERE tenant_id = $1 AND code = 'owner' LIMIT 1`,
          [tenantId],
        );
        ownerRoleId = r.rows[0]?.id;
      }
      if (!ownerRoleId) throw new Error('Owner role not found after insert');

      // 5. Assign owner role to admin user
      await client.query(
        `INSERT INTO vn_user_roles (id, user_id, role_id, assigned_by, assigned_at)
         VALUES (gen_random_uuid(), $1, $2, $1, now())
         ON CONFLICT (user_id, role_id) DO NOTHING`,
        [userId, ownerRoleId],
      );

      // 6. Subscription (enterprise — seed tenant gets max headroom)
      const maxSessions = Number(process.env.MAX_SESSIONS) || 50;
      const existingSub = await client.query(
        `SELECT id FROM vn_subscriptions WHERE tenant_id = $1 AND is_current = true LIMIT 1`,
        [tenantId],
      );
      if (existingSub.rows.length === 0) {
        await client.query(
          `INSERT INTO vn_subscriptions
             (id, tenant_id, plan_code, plan_name, status, max_users, max_sessions, features,
              billing_cycle, is_current, started_at, created_at, updated_at)
           VALUES
             (gen_random_uuid(), $1, 'enterprise', 'Enterprise (Seed)', 'active', 100, $2,
              '{"portfolio": true, "clients": true, "market": true, "planning": true, "import": true, "gtm": true}'::jsonb,
              'lifetime', true, now(), now(), now())`,
          [tenantId, maxSessions],
        );
        console.log(`[Seed] Subscription created (plan=enterprise, max_sessions=${maxSessions})`);
      }

      // 7. Onboarding — mark steps COMPLETED so seed admin lands on dashboard, not wizard
      await client.query(
        `INSERT INTO vn_tenant_onboarding (id, tenant_id, step_id, status, completed_at, metadata, created_at)
         VALUES
           (gen_random_uuid(), $1, 'user_profile',     'completed', now(), '{"seeded": true}'::jsonb, now()),
           (gen_random_uuid(), $1, 'business_profile', 'completed', now(), '{"seeded": true}'::jsonb, now())
         ON CONFLICT (tenant_id, step_id) DO UPDATE
           SET status = 'completed', completed_at = now()`,
        [tenantId],
      );

      // 8. Per-tenant KI master data (bookmark reasons, sequences, job scheduler)
      await seedTenantData(client, tenantId);
      console.log(`[Seed] Per-tenant KI master data seeded.`);

      await client.query('COMMIT');

      console.log('\n[Seed] ───────────────────────────────────────────');
      console.log(`[Seed] ✓ Seed complete`);
      console.log(`[Seed]   Tenant:   ${TENANT_NAME}  (slug=${TENANT_SLUG}, id=${tenantId})`);
      console.log(`[Seed]   Admin:    ${ADMIN_EMAIL}  (id=${userId})`);
      console.log(`[Seed]   Password: ${ADMIN_PASS}`);
      console.log('[Seed] ───────────────────────────────────────────\n');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[Seed] FAILED:', err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
