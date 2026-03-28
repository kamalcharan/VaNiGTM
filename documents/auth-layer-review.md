# VaNiBase Auth Layer — Complete Review Document

**Date:** 2026-03-27
**Branch:** `claude/setup-vanibase-framework-UYVrq`
**Schema:** `001_vn_foundation.sql` + `002_vn_operational.sql`

---

## 1. File Inventory

```
framework/auth/
├── types.ts       (72 lines)  — Request/response interfaces, JWT payload types
├── passwords.ts   (16 lines)  — bcrypt hash + verify
├── tokens.ts      (72 lines)  — JWT sign/verify, SHA-256 token hashing
├── service.ts     (422 lines) — register, login, refresh, logout, me
└── index.ts       (33 lines)  — Barrel exports

framework/routes/auth.ts       (149 lines) — Express router for /api/v1/auth/*
framework/gateway/auth.ts      (81 lines)  — JWT verification middleware
framework/server.ts            (117 lines) — Auth router mounted at line 81

No separate migration created — uses mentor's migrations:
  migrations/001_vn_foundation.sql  — VN_tenants, VN_tenant_profiles, VN_users,
                                      VN_roles, VN_user_roles, VN_refresh_tokens
  migrations/002_vn_operational.sql — VN_subscriptions, VN_subscription_history,
                                      VN_audit_log, utility functions
```

**No `ua-parser.ts`** — user-agent string is stored raw in `VN_refresh_tokens.user_agent`. The `device_type`, `os`, `browser` columns defined in the migration are available but not populated yet (future: add ua-parser-js for parsing).

---

## 2. Endpoint Reference

### POST /api/v1/auth/register (Public)

**Request:**
```json
{
  "email": "kamal@vikuna.com",        // required, lowercased+trimmed
  "password": "SecurePass123",         // required, min 8 chars
  "name": "Kamal Charan",             // required — VN_users.name
  "tenant_name": "Vikuna Technologies", // required — VN_tenant_profiles.name
  "tenant_slug": "vikuna-tech"         // optional — auto-generated if omitted
}
```

**Response (201):**
```json
{
  "tokens": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
    "expires_in": 900
  },
  "user": {
    "id": "uuid",
    "tenant_id": "uuid",
    "email": "kamal@vikuna.com",
    "name": "Kamal Charan",
    "roles": ["owner"]
  },
  "tenant": {
    "id": "uuid",
    "slug": "vikuna-technologies-m1abc",
    "name": "Vikuna Technologies",
    "display_name": "Vikuna Technologies",
    "plan_code": "free",
    "status": "active"
  }
}
```

**Errors:** `400` (missing fields, password < 8) | `409` AUTH_EMAIL_EXISTS | `500` (DB unavailable)

**DB operations (in transaction):**
1. `INSERT VN_tenants` (slug, status='active')
2. `INSERT VN_tenant_profiles` (name, display_name)
3. `INSERT VN_users` (email, password_hash via bcrypt, name)
4. `INSERT VN_user_roles` (owner role UUID `00000000-0000-0000-0000-000000000002`)
5. `INSERT VN_subscriptions` (plan_code='free', max_users=1, max_sessions=1)
6. `INSERT VN_refresh_tokens` (token_hash via SHA-256)
7. `INSERT VN_audit_log` (category='auth', action='register') — fire-and-forget

---

### POST /api/v1/auth/login (Public)

**Request:**
```json
{
  "email": "kamal@vikuna.com",
  "password": "SecurePass123"
}
```

**Response (200):** Same shape as register.

**Errors:** `400` (missing fields) | `401` AUTH_INVALID_CREDENTIALS | `429` AUTH_ACCOUNT_LOCKED

**Login flow:**
1. Fetch user + tenant status: `VN_users JOIN VN_tenants`
2. Check `is_active = true` and `tenant.status = 'active'`
3. Check `locked_until` — reject if locked
4. `verifyPassword()` against `password_hash`
5. On failure: increment `failed_login_count`, lock at 5 attempts (15 min)
6. On success: reset `failed_login_count`, `locked_until`, update `last_login_at`
7. Fetch roles: `VN_user_roles JOIN VN_roles WHERE revoked_at IS NULL`
8. Fetch tenant info: `VN_tenants JOIN VN_tenant_profiles LEFT JOIN VN_subscriptions`
9. Issue tokens, store refresh hash, write audit log

---

### POST /api/v1/auth/refresh (Public)

**Request:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response (200):**
```json
{
  "access_token": "eyJ...(new)",
  "refresh_token": "eyJ...(new)",
  "expires_in": 900
}
```

**Errors:** `400` (missing field) | `401` AUTH_REFRESH_INVALID

**Refresh flow:**
1. `verifyRefreshToken()` — JWT signature + expiry + type='refresh'
2. Lookup `VN_refresh_tokens WHERE token_hash AND is_active = true AND expires_at > now()`
3. Revoke old: `is_active = false, revoked_reason = 'session_replaced'`
4. Re-fetch roles + tenant info (may have changed since last login)
5. Issue new pair, store new refresh hash
6. Audit log: `auth.token_refresh`

---

### POST /api/v1/auth/logout (Public)

**Request:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response (200):**
```json
{
  "success": true
}
```

**Errors:** `400` (missing field)

**Logout flow:**
1. `UPDATE VN_refresh_tokens SET is_active = false, revoked_reason = 'user_logout' WHERE token_hash = $1`
2. Audit log: `auth.logout`

---

### GET /api/v1/auth/me (Protected — requires Bearer token)

**Note:** Currently exported as `createMeRouter()` but **not mounted** in server.ts. To use, products must mount it inside the protectedRouter:
```typescript
protectedRouter.use('/auth', createMeRouter());
```

**Headers:** `Authorization: Bearer <access_token>`

**Response (200):**
```json
{
  "user": {
    "id": "uuid",
    "tenant_id": "uuid",
    "email": "kamal@vikuna.com",
    "name": "Kamal Charan",
    "roles": ["owner"]
  },
  "tenant": {
    "id": "uuid",
    "slug": "vikuna-technologies-m1abc",
    "name": "Vikuna Technologies",
    "display_name": "Vikuna Technologies",
    "plan_code": "free",
    "status": "active"
  }
}
```

**Errors:** `401` (invalid/expired token) | `404` AUTH_USER_NOT_FOUND

---

## 3. Complete File Contents

### framework/auth/types.ts (72 lines)

```typescript
/**
 * Auth Layer — TypeScript Interfaces
 * Aligned to 001_vn_foundation.sql + 002_vn_operational.sql schemas.
 */

import type { SubscriptionTier } from '../../shared/types/index.js';

// ── Request types ──

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;                   // VN_users.name
  tenant_name: string;            // VN_tenant_profiles.name
  tenant_slug?: string;           // VN_tenants.slug (auto-generated if omitted)
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshRequest {
  refresh_token: string;
}

// ── Response types ──

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;             // Access token TTL in seconds
}

export interface AuthUserResponse {
  id: string;
  tenant_id: string;
  email: string;
  name: string;
  roles: string[];                // Role codes: ['owner'], ['admin', 'advisor']
}

export interface AuthTenantResponse {
  id: string;
  slug: string;
  name: string;                   // From VN_tenant_profiles
  display_name: string | null;
  plan_code: string;              // From VN_subscriptions
  status: string;                 // VN_tenants.status
}

export interface AuthResponse {
  tokens: TokenPair;
  user: AuthUserResponse;
  tenant: AuthTenantResponse;
}

// ── JWT payloads ──

export interface AccessTokenPayload {
  sub: string;                    // user_id
  tenant_id: string;
  roles: string[];                // Role codes
  tier: SubscriptionTier;         // Mapped from plan_code for backward compat
  email: string;
}

export interface RefreshTokenPayload {
  sub: string;                    // user_id
  tenant_id: string;
  type: 'refresh';
}
```

### framework/auth/passwords.ts (16 lines)

```typescript
/**
 * Auth Layer — Password Hashing
 * Uses bcrypt with 12 rounds (balance of security and speed).
 */

import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}
```

### framework/auth/tokens.ts (72 lines)

```typescript
/**
 * Auth Layer — JWT Token Generation & Verification
 * Access tokens (short-lived) and refresh tokens (long-lived).
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { loadConfig } from '../config.js';
import type { AccessTokenPayload, RefreshTokenPayload } from './types.js';

const ACCESS_TOKEN_TTL = '15m';       // 15 minutes
const REFRESH_TOKEN_TTL = '30d';      // 30 days

export const ACCESS_TOKEN_SECONDS = 15 * 60;
export const REFRESH_TOKEN_SECONDS = 30 * 24 * 60 * 60;

function getSecret(): string {
  const config = loadConfig();
  if (!config.jwtSecret) {
    throw new Error('JWT_SECRET not configured — cannot sign tokens');
  }
  return config.jwtSecret;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, getSecret(), {
    expiresIn: ACCESS_TOKEN_TTL,
    issuer: 'vani-framework',
  });
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, getSecret(), {
    expiresIn: REFRESH_TOKEN_TTL,
    issuer: 'vani-framework',
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload & { iat: number; exp: number } {
  return jwt.verify(token, getSecret(), {
    issuer: 'vani-framework',
  }) as AccessTokenPayload & { iat: number; exp: number };
}

export function verifyRefreshToken(token: string): RefreshTokenPayload & { iat: number; exp: number } {
  const payload = jwt.verify(token, getSecret(), {
    issuer: 'vani-framework',
  }) as RefreshTokenPayload & { iat: number; exp: number };
  if (payload.type !== 'refresh') {
    throw new Error('Token is not a refresh token');
  }
  return payload;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
```

### framework/auth/service.ts (422 lines)

```typescript
/**
 * Auth Service — Business logic for register, login, refresh, logout, me.
 * Aligned to 001_vn_foundation.sql + 002_vn_operational.sql schemas.
 *
 * Tables used:
 *   VN_tenants, VN_tenant_profiles, VN_users, VN_roles, VN_user_roles,
 *   VN_refresh_tokens, VN_subscriptions, VN_audit_log
 */

import { getPool } from '../db/index.js';
import { hashPassword, verifyPassword } from './passwords.js';
import {
  signAccessToken, signRefreshToken, verifyRefreshToken, hashToken,
  ACCESS_TOKEN_SECONDS, REFRESH_TOKEN_SECONDS,
} from './tokens.js';
import type {
  RegisterRequest, LoginRequest, AuthResponse, TokenPair,
  AuthUserResponse, AuthTenantResponse,
} from './types.js';
import type { SubscriptionTier } from '../../shared/types/index.js';

// ── Helpers ──

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function planToTier(planCode: string): SubscriptionTier {
  if (planCode === 'enterprise' || planCode === 'custom') return 'enterprise';
  if (planCode === 'pro' || planCode === 'professional') return 'professional';
  return 'starter';
}

async function getUserRoles(userId: string): Promise<string[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT r.code FROM VN_user_roles ur
     JOIN VN_roles r ON ur.role_id = r.id
     WHERE ur.user_id = $1 AND ur.revoked_at IS NULL`, [userId]);
  return rows.map((r) => (r as { code: string }).code);
}

async function getTenantInfo(tenantId: string): Promise<AuthTenantResponse> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT t.id, t.slug, t.status, tp.name, tp.display_name,
            COALESCE(s.plan_code, 'free') AS plan_code
     FROM VN_tenants t
     JOIN VN_tenant_profiles tp ON tp.tenant_id = t.id
     LEFT JOIN VN_subscriptions s ON s.tenant_id = t.id AND s.is_current = true
     WHERE t.id = $1`, [tenantId]);
  if (rows.length === 0) throw Object.assign(new Error('Tenant not found'), { status: 404, code: 'TENANT_NOT_FOUND' });
  const r = rows[0];
  return { id: r.id, slug: r.slug, name: r.name, display_name: r.display_name, plan_code: r.plan_code, status: r.status };
}

function auditLog(tenantId: string|null, userId: string|null, category: string, action: string, opts: {
  targetType?: string; targetId?: string; ipAddress?: string; userAgent?: string;
  status?: 'success'|'failure'; errorMessage?: string; metadata?: Record<string, unknown>;
} = {}): void {
  const pool = getPool();
  pool.query(
    `INSERT INTO VN_audit_log (tenant_id, user_id, category, action, target_type, target_id,
     ip_address, user_agent, status, error_message, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7::inet,$8,$9,$10,$11)`,
    [tenantId, userId, category, action, opts.targetType||null, opts.targetId||null,
     opts.ipAddress||null, opts.userAgent||null, opts.status||'success',
     opts.errorMessage||null, opts.metadata ? JSON.stringify(opts.metadata) : '{}']
  ).catch((err) => console.error('[AuditLog] Write failed:', (err as Error).message));
}

async function storeRefreshToken(userId: string, tenantId: string, refreshToken: string,
  userAgent?: string, ipAddress?: string): Promise<void> {
  const pool = getPool();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_SECONDS * 1000).toISOString();
  await pool.query(
    `INSERT INTO VN_refresh_tokens (user_id, tenant_id, token_hash, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5::inet, $6)`,
    [userId, tenantId, hashToken(refreshToken), userAgent||null, ipAddress||null, expiresAt]);
}

async function issueTokens(userId: string, tenantId: string, roles: string[], planCode: string,
  email: string, userAgent?: string, ipAddress?: string): Promise<TokenPair> {
  const tier = planToTier(planCode);
  const accessToken = signAccessToken({ sub: userId, tenant_id: tenantId, roles, tier, email });
  const refreshToken = signRefreshToken({ sub: userId, tenant_id: tenantId, type: 'refresh' });
  await storeRefreshToken(userId, tenantId, refreshToken, userAgent, ipAddress);
  return { access_token: accessToken, refresh_token: refreshToken, expires_in: ACCESS_TOKEN_SECONDS };
}

// ── Public API (register, login, refresh, logout, me) ──
// Full implementation: see framework/auth/service.ts in repo
// Each function uses getPool() directly (pre-auth, no tenant scoping)
```

*Full 422-line service.ts included in the repo. The above shows the helper functions; the 5 public functions (register, login, refresh, logout, me) are documented in the endpoint reference above.*

### framework/routes/auth.ts (149 lines)

```typescript
/**
 * Auth Routes — /api/v1/auth/*
 *
 * POST /api/v1/auth/register  — Create tenant + user, return JWT pair
 * POST /api/v1/auth/login     — Validate credentials, return JWT pair
 * POST /api/v1/auth/refresh   — Rotate refresh token, return new pair
 * POST /api/v1/auth/logout    — Revoke refresh token
 * GET  /api/v1/auth/me        — Return current user profile (protected)
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { register, login, refresh, logout, me } from '../auth/index.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';

export function createAuthRouter(): Router {
  const router = Router();

  router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, name, tenant_name, tenant_slug } = req.body || {};
      if (!email || !password || !name || !tenant_name) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Missing required fields: email, password, name, tenant_name',
          code: 'INVALID_REQUEST', status: HTTP_STATUS.BAD_REQUEST });
        return;
      }
      if (password.length < 8) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Password must be at least 8 characters',
          code: 'INVALID_REQUEST', status: HTTP_STATUS.BAD_REQUEST });
        return;
      }
      const userAgent = req.headers['user-agent'] as string | undefined;
      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
        || req.socket?.remoteAddress;
      const result = await register({ email, password, name, tenant_name, tenant_slug }, userAgent, ipAddress);
      res.status(HTTP_STATUS.CREATED).json(result);
    } catch (err) { next(err); }
  });

  router.post('/login', async (req, res, next) => { /* validates email+password, calls login() */ });
  router.post('/refresh', async (req, res, next) => { /* validates refresh_token, calls refresh() */ });
  router.post('/logout', async (req, res, next) => { /* validates refresh_token, calls logout() */ });

  return router;
}

export function createMeRouter(): Router {
  const router = Router();
  router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const result = await me(auth.sub, auth.tenant_id);
      res.json(result);
    } catch (err) { next(err); }
  });
  return router;
}
```

### framework/gateway/auth.ts (81 lines)

```typescript
/**
 * Auth Middleware — Extracts and validates JWT from Authorization header
 *
 * Production: verifies signature using JWT_SECRET via jsonwebtoken.
 * Development: accepts X-Dev-Tenant-Id + X-Dev-User-Id headers as bypass.
 */

import type { Request, Response, NextFunction } from 'express';
import { loadConfig } from '../config.js';
import { verifyAccessToken } from '../auth/tokens.js';
import type { JWTPayload } from '../../shared/types/index.js';
import { HTTP_STATUS, ERROR_CODES } from '../../shared/constants/index.js';

declare global {
  namespace Express {
    interface Request { auth?: JWTPayload; }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const config = loadConfig();

  // Dev bypass
  if (config.nodeEnv === 'development') {
    const tenantId = req.headers['x-dev-tenant-id'] as string | undefined;
    if (tenantId) {
      const userId = (req.headers['x-dev-user-id'] as string) || 'dev-user';
      req.auth = { sub: userId, tenant_id: tenantId, role: 'owner', tier: 'professional',
                   email: 'dev@vani.local', iat: Math.floor(Date.now()/1000),
                   exp: Math.floor(Date.now()/1000) + 3600 };
      next(); return;
    }
  }

  // Bearer token
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: 'Missing or invalid Authorization header',
      code: ERROR_CODES.AUTH_MISSING, status: HTTP_STATUS.UNAUTHORIZED });
    return;
  }

  try {
    const payload = verifyAccessToken(header.slice(7));
    req.auth = {
      sub: payload.sub, tenant_id: payload.tenant_id,
      role: payload.roles?.[0] || 'member',  // Backward compat: first role as primary
      tier: payload.tier, email: payload.email,
      iat: payload.iat, exp: payload.exp };
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid token';
    res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: message.includes('expired') ? 'Token expired — use /api/v1/auth/refresh' : 'Invalid or expired token',
      code: ERROR_CODES.AUTH_INVALID, status: HTTP_STATUS.UNAUTHORIZED });
  }
}
```

### framework/server.ts — Auth mount point (line 81)

```typescript
// Public routes (no auth required)
app.use(healthRouter);
app.use(metricsRouter);
app.use('/api/v1', createRecipesRouter(orchestrator.recipeRegistry));
app.use('/api/v1/auth', createAuthRouter());  // ← AUTH ROUTES

// Protected routes (Bearer token required)
const protectedRouter = express.Router();
protectedRouter.use(authMiddleware);
// ...
```

---

## 4. Gaps & Notes for Mentor Review

| Item | Status | Notes |
|------|--------|-------|
| `ua-parser.ts` | **Not created** | VN_refresh_tokens has `device_type`, `os`, `browser` columns but they're not populated. Raw `user_agent` string is stored. Add `ua-parser-js` later. |
| `/auth/me` mount | **Not in server.ts** | `createMeRouter()` is exported but not mounted in the framework server. Products mount it in their protectedRouter. |
| Max sessions enforcement | **Not wired** | `VN_subscriptions.max_sessions` and `vn_get_max_sessions()` function exist but login doesn't check session count yet. |
| Email verification | **Not implemented** | `is_email_verified` column exists, set to `false` on register. No verification email flow. |
| Password reset | **Not implemented** | No forgot-password / reset-password endpoints. |
| Token hash method | **SHA-256** | Spec says `bcrypt hash of refresh token` in VN_refresh_tokens comment. Implementation uses SHA-256 (faster, sufficient for token hashing since tokens are already high-entropy). |
| Error codes | 6 added | AUTH_EMAIL_EXISTS, AUTH_INVALID_CREDENTIALS, AUTH_REFRESH_INVALID, AUTH_USER_NOT_FOUND, AUTH_ACCOUNT_LOCKED (in service only), TENANT_NOT_FOUND |
| Dependencies added | 2 | `bcrypt` + `@types/bcrypt`, `jsonwebtoken` + `@types/jsonwebtoken` |
