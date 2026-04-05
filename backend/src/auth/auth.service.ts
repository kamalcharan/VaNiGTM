/**
 * KI-Prime — Auth Service
 *
 * Registration flow (single transaction per CLAUDE.md):
 *   1. Validate input
 *   2. Check email uniqueness (case-insensitive)
 *   3. Hash password (bcrypt 12 rounds)
 *   4. Create tenant (vn_tenants)
 *   5. Create tenant profile (vn_tenant_profiles)
 *   6. Create user (vn_users)
 *   7. Seed roles (owner, admin, planner)
 *   8. Assign owner role (vn_user_roles)
 *   9. Create starter subscription (vn_subscriptions)
 *  10. Seed mandatory onboarding steps (vn_tenant_onboarding)
 *  11. Create session (JWT + refresh token)
 *
 * All writes in a single transaction. Partial failure = full rollback.
 */

import bcrypt from 'bcryptjs';
import type { Pool, PoolClient } from 'pg';
import { createSession, parseDeviceInfo, type DeviceInfo, type TokenPair } from './token.service';
import type { Request } from 'express';

/* ── Types ──────────────────────────────────────────── */

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  country_code?: string;
  mobile?: string;
  tenant_name?: string;
}

export interface RegisterResult {
  tokens: TokenPair;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    preferred_theme: string;
    preferences: { color_mode: string };
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
    theme_id: string;
    onboarding_complete: boolean;
  };
}

/* ── Validation ─────────────────────────────────────── */

export function validateRegisterInput(input: RegisterInput): string | null {
  const { name, email, password } = input;

  if (!name || name.trim().length < 2) {
    return 'Name must be at least 2 characters';
  }
  if (name.trim().length > 100) {
    return 'Name must be under 100 characters';
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Please enter a valid email address';
  }
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (password.length > 128) {
    return 'Password must be under 128 characters';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least 1 uppercase letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least 1 number';
  }
  if (input.mobile && !/^\d{6,15}$/.test(input.mobile.replace(/[\s-]/g, ''))) {
    return 'Mobile number must be 6-15 digits';
  }

  return null;
}

/* ── Slug Generation ────────────────────────────────── */

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  // Append 6 random chars for uniqueness
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

/* ── XSS Sanitize ───────────────────────────────────── */

function sanitize(input: string): string {
  return input.replace(/[<>"'&]/g, '');
}

/* ── Register ───────────────────────────────────────── */

export async function register(
  pool: Pool,
  input: RegisterInput,
  req: Request,
): Promise<RegisterResult> {
  const email = input.email.trim().toLowerCase();
  const name = sanitize(input.name.trim());
  const tenantName = sanitize((input.tenant_name || `${name}'s Workspace`).trim());
  const countryCode = input.country_code?.trim() || null;
  const mobile = input.mobile?.replace(/[\s-]/g, '') || null;
  const device = parseDeviceInfo(req);

  // Check email uniqueness
  const existing = await pool.query(
    'SELECT id FROM vn_users WHERE LOWER(email) = $1',
    [email],
  );
  if (existing.rows.length > 0) {
    const err = new Error('An account with this email already exists');
    (err as any).status = 409;
    (err as any).code = 'EMAIL_EXISTS';
    throw err;
  }

  // Hash password (bcrypt 12 rounds per PRD)
  const passwordHash = await bcrypt.hash(input.password, 12);

  const slug = generateSlug(tenantName);

  // Everything below in a single transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Create tenant (is_active is a generated column — do NOT insert)
    const tenantResult = await client.query<{ id: string }>(
      `INSERT INTO vn_tenants (id, slug, status, activated_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'active', now(), now(), now())
       RETURNING id`,
      [slug],
    );
    const tenantId = tenantResult.rows[0].id;

    // 2. Create tenant profile
    await client.query(
      `INSERT INTO vn_tenant_profiles (tenant_id, name, display_name, type, theme_id, currency, locale, settings, created_at, updated_at)
       VALUES ($1, $2, $2, 'mfd', 'vikuna-black', 'INR', 'en-IN', '{}'::jsonb, now(), now())`,
      [tenantId, tenantName],
    );

    // 3. Create user
    // preferred_theme: read from env default (user can change later)
    // preferences: store color_mode for theme persistence across sessions
    const defaultTheme = process.env.NEXT_PUBLIC_DEFAULT_THEME || 'vikuna-black';
    const defaultColorMode = process.env.NEXT_PUBLIC_DEFAULT_COLOR_MODE || 'dark';
    const nameParts = name.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const userResult = await client.query<{ id: string }>(
      `INSERT INTO vn_users
         (id, tenant_id, email, password_hash, name, first_name, last_name, country_code, mobile,
          preferred_theme, preferences, is_active, is_email_verified, failed_login_count, created_at, updated_at)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10::jsonb, true, false, 0, now(), now())
       RETURNING id`,
      [tenantId, email, passwordHash, name, firstName, lastName, countryCode, mobile,
       defaultTheme, JSON.stringify({ color_mode: defaultColorMode })],
    );
    const userId = userResult.rows[0].id;

    // 5. Seed roles (owner, admin, planner)
    const ownerRoleResult = await client.query<{ id: string }>(
      `INSERT INTO vn_roles (id, tenant_id, code, name, description, is_system, is_default, sort_order, permissions, created_at, updated_at)
       VALUES
         (gen_random_uuid(), $1, 'owner', 'Owner', 'Tenant owner with full access', true, false, 1, '{"all": true}'::jsonb, now(), now()),
         (gen_random_uuid(), $1, 'admin', 'Admin', 'Administrator', true, false, 2, '{"manage_users": true, "manage_settings": true}'::jsonb, now(), now()),
         (gen_random_uuid(), $1, 'planner', 'Planner', 'Financial planner', true, true, 3, '{"view_clients": true, "manage_portfolio": true}'::jsonb, now(), now())
       RETURNING id, code`,
      [tenantId],
    );
    const ownerRoleId = ownerRoleResult.rows.find(r => (r as any).code === 'owner')?.id;

    // 6. Assign owner role
    await client.query(
      `INSERT INTO vn_user_roles (id, user_id, role_id, assigned_by, assigned_at)
       VALUES (gen_random_uuid(), $1, $2, $1, now())`,
      [userId, ownerRoleId],
    );

    // 7. Create starter subscription
    const maxSessions = Number(process.env.MAX_SESSIONS) || 5;
    await client.query(
      `INSERT INTO vn_subscriptions
         (id, tenant_id, plan_code, plan_name, status, max_users, max_sessions, features,
          billing_cycle, is_current, started_at, created_at, updated_at)
       VALUES
         (gen_random_uuid(), $1, 'starter', 'Starter', 'active', 5, $2,
          '{"portfolio": true, "clients": true, "market": true, "planning": true, "import": true}'::jsonb,
          'monthly', true, now(), now(), now())`,
      [tenantId, maxSessions],
    );

    // 8. Seed mandatory onboarding steps
    await client.query(
      `INSERT INTO vn_tenant_onboarding (id, tenant_id, step_id, status, metadata, created_at)
       VALUES
         (gen_random_uuid(), $1, 'user_profile', 'pending', '{}'::jsonb, now()),
         (gen_random_uuid(), $1, 'business_profile', 'pending', '{}'::jsonb, now())`,
      [tenantId],
    );

    await client.query('COMMIT');

    // 9. Create session (outside transaction — separate concern)
    // New tenants always start in live mode
    const tokens = await createSession(pool, userId, tenantId, email, 'owner', device, true);

    return {
      tokens,
      user: {
        id: userId,
        email,
        name,
        role: 'owner',
        preferred_theme: defaultTheme,
        preferences: { color_mode: defaultColorMode },
      },
      tenant: {
        id: tenantId,
        name: tenantName,
        slug,
        theme_id: 'vikuna-black',
        onboarding_complete: false,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
