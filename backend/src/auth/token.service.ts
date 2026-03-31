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
): Promise<TokenPair> {
  const accessToken = signAccessToken({ user_id: userId, tenant_id: tenantId, email, role });
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
