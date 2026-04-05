/**
 * KI-Prime — Token Service
 *
 * Handles JWT access tokens and refresh tokens.
 *
 * Access token:  15 min, stored in client memory + sessionStorage
 * Refresh token: 30 days, SHA-256 hashed in vn_refresh_tokens
 * Token rotation: new refresh token on each refresh call
 *
 * Device info captured from request headers for session management.
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { Pool } from 'pg';
import type { Request } from 'express';

/* ── Config ─────────────────────────────────────────── */

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const ACCESS_TOKEN_EXPIRY = '15m';
const ACCESS_TOKEN_EXPIRY_SECONDS = 15 * 60;
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

/* ── Types ──────────────────────────────────────────── */

export interface JwtPayload {
  user_id: string;
  tenant_id: string;
  email: string;
  role: string;
  is_live: boolean;  // TRUE = live environment, FALSE = sandbox
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface DeviceInfo {
  ip_address: string;
  user_agent: string;
  device_type: string;
  os: string;
  browser: string;
}

/* ── JWT ────────────────────────────────────────────── */

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

/* ── Refresh Token ──────────────────────────────────── */

function generateRefreshToken(): string {
  return crypto.randomBytes(40).toString('hex');
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/* ── Device Info Parsing ────────────────────────────── */

export function parseDeviceInfo(req: Request): DeviceInfo {
  const ua = req.headers['user-agent'] || '';
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown';

  // Simple UA parsing
  let browser = 'Unknown';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/')) browser = 'Safari';

  let os = 'Unknown';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  const device_type = /Mobile|Android|iPhone/i.test(ua)
    ? 'mobile'
    : /iPad|Tablet/i.test(ua)
      ? 'tablet'
      : 'desktop';

  return { ip_address: ip, user_agent: ua, device_type, os, browser };
}

/* ── Create Session (refresh token + DB) ────────────── */

/**
 * Create a new session: generates token pair, stores hashed refresh token in DB.
 * Called after successful login or registration.
 */
export async function createSession(
  pool: Pool,
  userId: string,
  tenantId: string,
  email: string,
  role: string,
  device: DeviceInfo,
  isLive: boolean = true,
): Promise<TokenPair> {
  const accessToken = signAccessToken({ user_id: userId, tenant_id: tenantId, email, role, is_live: isLive });
  const rawRefreshToken = generateRefreshToken();
  const tokenHash = hashToken(rawRefreshToken);

  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO vn_refresh_tokens
       (id, user_id, tenant_id, token_hash, ip_address, user_agent, device_type, os, browser, is_active, last_activity_at, expires_at, created_at)
     VALUES
       (gen_random_uuid(), $1, $2, $3, $4::inet, $5, $6, $7, $8, true, now(), $9, now())`,
    [userId, tenantId, tokenHash, device.ip_address, device.user_agent, device.device_type, device.os, device.browser, expiresAt],
  );

  return {
    access_token: accessToken,
    refresh_token: rawRefreshToken,
    expires_in: ACCESS_TOKEN_EXPIRY_SECONDS,
  };
}

/**
 * Refresh a session: validate the refresh token, revoke it, issue new pair.
 * Token rotation: every refresh call produces a new refresh token.
 * Old token becomes invalid immediately (prevents replay attacks).
 *
 * Returns null if token is invalid/expired/revoked.
 */
export async function refreshSession(
  pool: Pool,
  rawRefreshToken: string,
  device: DeviceInfo,
): Promise<TokenPair | null> {
  const tokenHash = hashToken(rawRefreshToken);

  // Find the active session for this refresh token
  const result = await pool.query(
    `SELECT rt.id, rt.user_id, rt.tenant_id, rt.is_active, rt.expires_at,
            u.email, u.is_active AS user_active
     FROM vn_refresh_tokens rt
     JOIN vn_users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1`,
    [tokenHash],
  );

  if (result.rows.length === 0) return null;

  const session = result.rows[0] as any;

  // Validate
  if (!session.is_active) return null;
  if (new Date(session.expires_at) < new Date()) return null;
  if (!session.user_active) return null;

  // Get user role
  const roleResult = await pool.query(
    `SELECT r.code FROM vn_user_roles ur
     JOIN vn_roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1 AND ur.revoked_at IS NULL
     ORDER BY r.sort_order LIMIT 1`,
    [session.user_id],
  );
  const role = roleResult.rows.length > 0 ? (roleResult.rows[0] as any).code : 'planner';

  // Read current environment preference from user preferences (default: live)
  const prefResult = await pool.query(
    `SELECT preferences FROM vn_users WHERE id = $1`,
    [session.user_id],
  );
  const prefs = prefResult.rows.length > 0 ? ((prefResult.rows[0] as any).preferences || {}) : {};
  const isLive: boolean = prefs.env_mode !== 'sandbox';

  // Token rotation: revoke old refresh token
  await pool.query(
    `UPDATE vn_refresh_tokens
     SET is_active = false, revoked_at = now(), revoked_reason = 'rotated'
     WHERE id = $1`,
    [session.id],
  );

  // Issue new token pair with new refresh token
  const newAccessToken = signAccessToken({
    user_id: session.user_id,
    tenant_id: session.tenant_id,
    email: session.email,
    role,
    is_live: isLive,
  });
  const newRawRefreshToken = generateRefreshToken();
  const newTokenHash = hashToken(newRawRefreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  // Create new refresh token record
  await pool.query(
    `INSERT INTO vn_refresh_tokens
       (id, user_id, tenant_id, token_hash, ip_address, user_agent, device_type, os, browser, is_active, last_activity_at, expires_at, created_at)
     VALUES
       (gen_random_uuid(), $1, $2, $3, $4::inet, $5, $6, $7, $8, true, now(), $9, now())`,
    [session.user_id, session.tenant_id, newTokenHash, device.ip_address, device.user_agent, device.device_type, device.os, device.browser, expiresAt],
  );

  return {
    access_token: newAccessToken,
    refresh_token: newRawRefreshToken,
    expires_in: ACCESS_TOKEN_EXPIRY_SECONDS,
  };
}
