/**
 * VaNiBase Framework — JWT Auth
 *
 * Minimal JWT verification for extracting tenant_id from requests.
 * Uses HS256 with the JWT_SECRET env var.
 */

import * as crypto from 'crypto';

export interface TokenPayload {
  tenant_id: string;
  sub?: string;
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}

function base64UrlDecode(str: string): string {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf-8');
}

function base64UrlEncode(data: Buffer): string {
  return data.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Verify HS256 JWT and return payload.
 * Throws on invalid/expired tokens.
 */
export function verifyToken(token: string, secret: string): TokenPayload {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');

  const [headerB64, payloadB64, signatureB64] = parts;

  // Verify signature
  const data = `${headerB64}.${payloadB64}`;
  const expectedSig = base64UrlEncode(
    crypto.createHmac('sha256', secret).update(data).digest()
  );

  if (expectedSig !== signatureB64) {
    throw new Error('Invalid token signature');
  }

  const payload: TokenPayload = JSON.parse(base64UrlDecode(payloadB64));

  // Check expiry
  if (payload.exp && Date.now() / 1000 > payload.exp) {
    throw new Error('Token expired');
  }

  if (!payload.tenant_id) {
    throw new Error('Token missing tenant_id');
  }

  return payload;
}

/**
 * Extract Bearer token from Authorization header.
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}
