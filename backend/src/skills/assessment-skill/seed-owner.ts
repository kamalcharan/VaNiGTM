/**
 * VaNi AI — grant console access to a user.
 *
 * Without a gt_partner row nobody can use the console at all —
 * resolvePartnerContext() refuses, which is correct but means a fresh
 * install looks empty rather than gated, and there was no supported way to
 * create the first login.
 *
 * Does three things, all idempotent:
 *   1. Grants owner console access (the gt_partner row).
 *   2. Marks tenant onboarding complete, so the user lands on the app
 *      rather than the onboarding wizard. onboarding_complete is DERIVED
 *      (CLAUDE.md): count(vn_tenant_onboarding WHERE status != 'completed')
 *      == 0, so "complete" means every seeded step is marked completed.
 *   3. Sets a password ONLY if you pass one, and only for a user this
 *      script creates. An existing user's password is never touched —
 *      rotating a working credential as a side effect of granting access
 *      would be a nasty surprise.
 *
 * Usage (Git Bash / Linux / macOS):
 *   cd backend
 *   VANI_OWNER_EMAIL=you@vikuna.io npm run db:seed-owner
 *
 * Usage (PowerShell):
 *   cd backend
 *   $env:VANI_OWNER_EMAIL="you@vikuna.io"; npm run db:seed-owner
 *
 * For a NEW user, add VANI_OWNER_PASSWORD. For an existing one, omit it.
 *
 * Which tenant: VANI_TENANT_SLUG, default 'vikuna-consulting'. This must
 * match the tenant the assessment writes leads under — see resolveTenantId
 * in assessment.agent.ts, which reads the same variable.
 */

import 'dotenv/config';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const TENANT_SLUG = process.env.VANI_TENANT_SLUG || 'vikuna-consulting';

async function main(): Promise<void> {
  const email = (process.env.VANI_OWNER_EMAIL || '').trim().toLowerCase();
  const password = process.env.VANI_OWNER_PASSWORD || '';
  const name = process.env.VANI_OWNER_NAME || 'Vikuna Owner';

  if (!email) {
    console.error('[SeedOwner] VANI_OWNER_EMAIL is required.');
    console.error('[SeedOwner]   Git Bash:   VANI_OWNER_EMAIL=you@vikuna.io npm run db:seed-owner');
    console.error('[SeedOwner]   PowerShell: $env:VANI_OWNER_EMAIL="you@vikuna.io"; npm run db:seed-owner');
    process.exit(1);
  }
  if (!process.env.DB_PRIMARY) {
    console.error('[SeedOwner] DB_PRIMARY is required (run from backend/, where .env lives).');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DB_PRIMARY,
    max: 2,
    ssl: process.env.DB_PRIMARY_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  try {
    const t = await pool.query<{ id: string }>(
      `SELECT id FROM vn_tenants WHERE slug = $1`, [TENANT_SLUG]);
    if (!t.rows[0]) {
      throw new Error(`Tenant '${TENANT_SLUG}' not found. Run npm run db:migrate, or set VANI_TENANT_SLUG.`);
    }
    const tenantId = t.rows[0].id;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Look the user up ACROSS tenants first — a vn_users row belongs to
      // exactly one tenant, and the console only lists leads from the
      // tenant in the caller's JWT. Creating a second account with the same
      // email under a different tenant would give two logins where the
      // obvious one shows an empty console.
      const found = await client.query<{ id: string; tenant_id: string; slug: string }>(
        `SELECT u.id, u.tenant_id, t.slug
           FROM vn_users u JOIN vn_tenants t ON t.id = u.tenant_id
          WHERE LOWER(u.email) = $1`, [email]);

      let userId: string;

      if (found.rows[0] && found.rows[0].tenant_id !== tenantId) {
        console.error(`[SeedOwner] ${email} exists under tenant '${found.rows[0].slug}', but VaNi is`);
        console.error(`[SeedOwner] configured for '${TENANT_SLUG}'. Those are different tenants, so`);
        console.error('[SeedOwner] this account would not see VaNi leads.');
        console.error('[SeedOwner]');
        console.error('[SeedOwner] To put VaNi under the tenant this account already belongs to,');
        console.error(`[SeedOwner] set VANI_TENANT_SLUG=${found.rows[0].slug} — in .env, so the`);
        console.error('[SeedOwner] backend uses the same tenant when writing leads — and re-run.');
        await client.query('ROLLBACK');
        process.exit(1);
      }

      if (found.rows[0]) {
        userId = found.rows[0].id;
        // Password deliberately untouched — you already know it.
        if (password) {
          await client.query(
            `UPDATE vn_users SET password_hash = $1, updated_at = now() WHERE id = $2`,
            [await bcrypt.hash(password, 12), userId]);
          console.log(`[SeedOwner] Existing user ${email} — password updated (you passed one).`);
        } else {
          console.log(`[SeedOwner] Existing user ${email} — password left as-is.`);
        }
        await client.query(`UPDATE vn_users SET is_active = true WHERE id = $1`, [userId]);
      } else {
        if (!password || password.length < 10) {
          console.error(`[SeedOwner] ${email} does not exist yet, so VANI_OWNER_PASSWORD is required`);
          console.error('[SeedOwner] (minimum 10 characters) to create it.');
          await client.query('ROLLBACK');
          process.exit(1);
        }
        const u = await client.query<{ id: string }>(
          `INSERT INTO vn_users
             (tenant_id, email, password_hash, name, intake_code, is_active, is_email_verified)
           VALUES ($1, $2, $3, $4, substring(encode(gen_random_bytes(5),'hex'),1,8), true, true)
           RETURNING id`,
          [tenantId, email, await bcrypt.hash(password, 12), name]);
        userId = u.rows[0].id;
        console.log(`[SeedOwner] User created: ${email}`);
      }

      // 1. Console access.
      const p = await client.query<{ id: string }>(
        `INSERT INTO gt_partner (tenant_id, user_id, role, display_name)
         VALUES ($1, $2, 'owner', $3)
         ON CONFLICT (user_id) DO UPDATE SET role = 'owner', is_active = true
         RETURNING id`,
        [tenantId, userId, found.rows[0] ? name : name]);

      // 2. Onboarding complete — otherwise the app routes to the wizard.
      //    Upserts the two steps register() seeds, then completes anything
      //    else already present for this tenant.
      await client.query(
        `INSERT INTO vn_tenant_onboarding (tenant_id, step_id, status, completed_at, metadata)
         VALUES ($1, 'user_profile', 'completed', now(), '{"seeded":true}'::jsonb),
                ($1, 'business_profile', 'completed', now(), '{"seeded":true}'::jsonb)
         ON CONFLICT (tenant_id, step_id) DO UPDATE
           SET status = 'completed', completed_at = now()`,
        [tenantId]);
      const remaining = await client.query<{ n: number }>(
        `UPDATE vn_tenant_onboarding SET status = 'completed', completed_at = now()
          WHERE tenant_id = $1 AND status <> 'completed'
          RETURNING 1`, [tenantId]);

      await client.query('COMMIT');

      console.log(`[SeedOwner] ✓ Owner console access granted (gt_partner ${p.rows[0].id})`);
      console.log(`[SeedOwner] ✓ Onboarding marked complete for tenant '${TENANT_SLUG}'`
        + (remaining.rows.length ? ` (${remaining.rows.length} extra step(s) closed)` : ''));
      console.log(`[SeedOwner]   Sign in at /console/login as ${email}`);
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
  console.error('[SeedOwner] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
