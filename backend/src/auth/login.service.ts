/**
 * KI-Prime — Login Service
 *
 * Login flow:
 *   1. Lookup user by email (case-insensitive)
 *   2. Check account lockout (5 failed attempts = 15min lock)
 *   3. Verify bcrypt password
 *   4. Purge expired refresh tokens
 *   5. Count active sessions vs max_sessions
 *   6. If over limit → 409 with active session list
 *   7. Create session (JWT + refresh token)
 *   8. Return tokens + user + tenant
 */

import bcrypt from 'bcryptjs';
import type { Pool } from 'pg';
import type { Request } from 'express';
import { createSession, parseDeviceInfo, type TokenPair } from './token.service';

/* ── Types ──────────────────────────────────────────── */

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  tokens: TokenPair;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    preferred_theme: string | null;
    preferences: Record<string, unknown>;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
    theme_id: string | null;
    onboarding_complete: boolean;
  };
}

export interface SessionLimitResult {
  code: 'SESSION_LIMIT';
  max_sessions: number;
  active_sessions: {
    session_id: string;
    device_type: string | null;
    os: string | null;
    browser: string | null;
    ip_address: string | null;
    last_activity_at: string;
  }[];
}

/* ── Constants ──────────────────────────────────────── */

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/* ── Login ──────────────────────────────────────────── */

export async function login(
  pool: Pool,
  input: LoginInput,
  req: Request,
): Promise<LoginResult | SessionLimitResult> {
  const email = input.email.trim().toLowerCase();
  const device = parseDeviceInfo(req);

  if (!email || !input.password) {
    const err = new Error('Email and password are required');
    (err as any).status = 400;
    (err as any).code = 'VALIDATION_ERROR';
    throw err;
  }

  // 1. Lookup user by email
  const userResult = await pool.query(
    `SELECT u.id, u.tenant_id, u.email, u.name, u.password_hash, u.preferred_theme, u.preferences,
            u.is_active, u.failed_login_count, u.locked_until
     FROM vn_users u
     WHERE LOWER(u.email) = $1`,
    [email],
  );

  if (userResult.rows.length === 0) {
    const err = new Error('Invalid email or password');
    (err as any).status = 401;
    (err as any).code = 'INVALID_CREDENTIALS';
    throw err;
  }

  const user = userResult.rows[0] as any;

  // 2. Check active
  if (!user.is_active) {
    const err = new Error('Account is deactivated. Contact support.');
    (err as any).status = 403;
    (err as any).code = 'ACCOUNT_DEACTIVATED';
    throw err;
  }

  // 3. Check lockout
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const minutesLeft = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
    const err = new Error(`Account locked. Try again in ${minutesLeft} minute(s).`);
    (err as any).status = 429;
    (err as any).code = 'ACCOUNT_LOCKED';
    throw err;
  }

  // 4. Verify password
  const passwordValid = await bcrypt.compare(input.password, user.password_hash);
  if (!passwordValid) {
    // Increment failed count
    const newCount = (user.failed_login_count || 0) + 1;
    const lockUntil = newCount >= MAX_FAILED_ATTEMPTS
      ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
      : null;

    await pool.query(
      `UPDATE vn_users SET failed_login_count = $1, locked_until = $2, updated_at = now()
       WHERE id = $3`,
      [newCount, lockUntil, user.id],
    );

    const remaining = MAX_FAILED_ATTEMPTS - newCount;
    const msg = remaining > 0
      ? `Invalid email or password. ${remaining} attempt(s) remaining.`
      : `Account locked for ${LOCKOUT_MINUTES} minutes due to too many failed attempts.`;

    const err = new Error(msg);
    (err as any).status = 401;
    (err as any).code = 'INVALID_CREDENTIALS';
    throw err;
  }

  // 5. Reset failed count on successful password
  if (user.failed_login_count > 0) {
    await pool.query(
      'UPDATE vn_users SET failed_login_count = 0, locked_until = NULL, updated_at = now() WHERE id = $1',
      [user.id],
    );
  }

  // 6. Purge expired refresh tokens
  await pool.query(
    'DELETE FROM vn_refresh_tokens WHERE user_id = $1 AND expires_at < NOW()',
    [user.id],
  );

  // 7. Count active sessions
  const sessionCountResult = await pool.query(
    'SELECT COUNT(*) as c FROM vn_refresh_tokens WHERE user_id = $1 AND is_active = true',
    [user.id],
  );
  const activeCount = Number((sessionCountResult.rows[0] as any).c);

  // Get max_sessions from subscription
  const subResult = await pool.query(
    'SELECT max_sessions FROM vn_subscriptions WHERE tenant_id = $1 AND is_current = true LIMIT 1',
    [user.tenant_id],
  );
  const maxSessions = subResult.rows.length > 0
    ? Number((subResult.rows[0] as any).max_sessions)
    : Number(process.env.MAX_SESSIONS) || 5;

  if (activeCount >= maxSessions) {
    // Return active sessions for user to revoke
    const sessionsResult = await pool.query(
      `SELECT id as session_id, device_type, os, browser, ip_address::text, last_activity_at
       FROM vn_refresh_tokens
       WHERE user_id = $1 AND is_active = true
       ORDER BY last_activity_at DESC`,
      [user.id],
    );

    return {
      code: 'SESSION_LIMIT',
      max_sessions: maxSessions,
      active_sessions: sessionsResult.rows as any,
    };
  }

  // 8. Get user role
  const roleResult = await pool.query(
    `SELECT r.code FROM vn_user_roles ur
     JOIN vn_roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1 AND ur.revoked_at IS NULL
     ORDER BY r.sort_order LIMIT 1`,
    [user.id],
  );
  const role = roleResult.rows.length > 0 ? (roleResult.rows[0] as any).code : 'planner';

  // 9. Create session — restore the user's last environment preference (default: live)
  const userPrefs = (user.preferences as Record<string, any>) || {};
  const isLive: boolean = userPrefs.env_mode !== 'sandbox';
  const tokens = await createSession(pool, user.id, user.tenant_id, email, role, device, isLive);

  // 10. Update last_login_at
  await pool.query('UPDATE vn_users SET last_login_at = now(), updated_at = now() WHERE id = $1', [user.id]);

  // 11. Get tenant info
  const tenantResult = await pool.query(
    `SELECT t.id, t.slug, tp.name, tp.display_name, tp.theme_id
     FROM vn_tenants t
     JOIN vn_tenant_profiles tp ON tp.tenant_id = t.id
     WHERE t.id = $1`,
    [user.tenant_id],
  );
  const tenant = tenantResult.rows[0] as any || {};

  // 12. Check onboarding
  const onboardingResult = await pool.query(
    `SELECT count(*) as pending FROM vn_tenant_onboarding
     WHERE tenant_id = $1 AND status != 'completed'`,
    [user.tenant_id],
  );
  const onboardingComplete = Number((onboardingResult.rows[0] as any).pending) === 0;

  return {
    tokens,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role,
      preferred_theme: user.preferred_theme,
      preferences: user.preferences || {},
    },
    tenant: {
      id: user.tenant_id,
      name: tenant.display_name || tenant.name || '',
      slug: tenant.slug || '',
      theme_id: tenant.theme_id,
      onboarding_complete: onboardingComplete,
    },
  };
}
