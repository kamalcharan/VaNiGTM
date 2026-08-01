/**
 * VaNi AI — create a console owner login.
 *
 * Migration 228 creates the tables and the Vikuna Consulting tenant but
 * deliberately seeds no user: a password committed to a repo is a password
 * everyone has. This script takes one interactively (or from the
 * environment) so nothing secret is ever written down here.
 *
 * Without a gt_partner row nobody can use the console at all —
 * resolvePartnerContext() refuses, which is the correct behaviour and also
 * the reason a fresh install looks empty rather than broken.
 *
 * Usage:
 *   cd backend
 *   VANI_OWNER_EMAIL=you@vikuna.io VANI_OWNER_PASSWORD='...' npm run db:seed-owner
 *
 * Idempotent: re-running updates the password of the existing user rather
 * than creating a second one.
 */

import 'dotenv/config';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

async function main(): Promise<void> {
  const email = (process.env.VANI_OWNER_EMAIL || '').trim().toLowerCase();
  const password = process.env.VANI_OWNER_PASSWORD || '';
  const name = process.env.VANI_OWNER_NAME || 'Charan Kamal Bommakanti';

  if (!email || !password) {
    console.error('[SeedOwner] VANI_OWNER_EMAIL and VANI_OWNER_PASSWORD are required.');
    console.error("  e.g. VANI_OWNER_EMAIL=you@vikuna.io VANI_OWNER_PASSWORD='...' npm run db:seed-owner");
    process.exit(1);
  }
  if (password.length < 10) {
    console.error('[SeedOwner] Refusing a password under 10 characters.');
    process.exit(1);
  }
  if (!process.env.DB_PRIMARY) {
    console.error('[SeedOwner] DB_PRIMARY is required.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DB_PRIMARY,
    max: 2,
    ssl: process.env.DB_PRIMARY_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  try {
    const t = await pool.query<{ id: string }>(
      `SELECT id FROM vn_tenants WHERE slug = 'vikuna-consulting'`);
    if (!t.rows[0]) {
      throw new Error('vikuna-consulting tenant not found — run npm run db:migrate first');
    }
    const tenantId = t.rows[0].id;
    const hash = await bcrypt.hash(password, 12);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query<{ id: string }>(
        `SELECT id FROM vn_users WHERE LOWER(email) = $1 AND tenant_id = $2`, [email, tenantId]);

      let userId: string;
      if (existing.rows[0]) {
        userId = existing.rows[0].id;
        await client.query(
          `UPDATE vn_users SET password_hash = $1, is_active = true, updated_at = now() WHERE id = $2`,
          [hash, userId]);
        console.log(`[SeedOwner] Existing user ${email} — password updated.`);
      } else {
        const u = await client.query<{ id: string }>(
          `INSERT INTO vn_users
             (tenant_id, email, password_hash, name, intake_code, is_active, is_email_verified)
           VALUES ($1, $2, $3, $4, substring(encode(gen_random_bytes(5),'hex'),1,8), true, true)
           RETURNING id`,
          [tenantId, email, hash, name]);
        userId = u.rows[0].id;
        console.log(`[SeedOwner] User created: ${email}`);
      }

      // The console-access row. role='owner' means every lead in the
      // tenant, not just one partner's — see gt_partner in migration 228.
      const p = await client.query<{ id: string }>(
        `INSERT INTO gt_partner (tenant_id, user_id, role, display_name)
         VALUES ($1, $2, 'owner', $3)
         ON CONFLICT (user_id) DO UPDATE SET role = 'owner', is_active = true
         RETURNING id`,
        [tenantId, userId, name]);

      await client.query('COMMIT');
      console.log(`[SeedOwner] ✓ Owner console access granted (gt_partner ${p.rows[0].id})`);
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
