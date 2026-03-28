# VaNiBase Auth Layer — Usage Guide

## Overview

Self-contained JWT authentication with bcrypt password hashing, refresh token rotation, role-based access, account lockout, audit logging, and multi-tenant support.

**Schema:** `001_vn_foundation.sql` + `002_vn_operational.sql`

**Files:**
```
framework/auth/
├── types.ts        — Request/response interfaces, JWT payload types
├── passwords.ts    — hashPassword(), verifyPassword() using bcrypt (12 rounds)
├── tokens.ts       — signAccessToken(), signRefreshToken(), verify*(), hashToken()
├── service.ts      — register(), login(), refresh(), logout(), me()
└── index.ts        — Barrel exports

framework/routes/auth.ts    — Express router for /api/v1/auth/*
framework/gateway/auth.ts   — JWT verification middleware
```

**Database tables used:**
```
VN_tenants              — Tenant identity + status lifecycle
VN_tenant_profiles      — Business name, branding, address (1:1 with tenants)
VN_users                — Users with password_hash, lockout tracking
VN_roles                — System roles (superadmin, owner, admin) + product roles
VN_user_roles           — Many-to-many user ↔ role assignments
VN_refresh_tokens       — Refresh tokens with session/device tracking
VN_subscriptions        — Plan code, max_sessions (license enforcement)
VN_audit_log            — Append-only audit trail for all auth events
```

---

## 1. Environment Setup

```env
JWT_SECRET=your-32-char-random-secret-here     # REQUIRED for JWT signing
DB_PRIMARY=postgresql://user:pass@host:5432/db  # REQUIRED for auth
```

Generate a secure secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## 2. Database Setup

Run the migrations in order:
```bash
psql -U vani -h localhost -d vani -f migrations/001_vn_foundation.sql
psql -U vani -h localhost -d vani -f migrations/002_vn_operational.sql
```

Optionally load demo seed data:
```bash
psql -U vani -h localhost -d vani -f seeds/demo-seed.sql
```

The seed creates:
- **Tenant:** Demo Distributor (`slug: demo-distributor`, status: `active`)
- **User:** Dev Admin (`dev@vani.local` / `password123`, role: `owner`)
- **Subscription:** Professional plan (max 10 users, 3 concurrent sessions)

---

## 3. API Endpoints

### POST /api/v1/auth/register

Creates a new tenant + tenant profile + user + owner role + free subscription.

```bash
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "kamal@vikuna.com",
    "password": "SecurePass123",
    "name": "Kamal Charan",
    "tenant_name": "Vikuna Technologies"
  }'
```

**Response (201):**
```json
{
  "tokens": {
    "access_token": "eyJhbGciOiJIUzI1...",
    "refresh_token": "eyJhbGciOiJIUzI1...",
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

**What happens on register:**
1. `VN_tenants` — created with status `active`
2. `VN_tenant_profiles` — created with business name
3. `VN_users` — created with bcrypt-hashed password
4. `VN_user_roles` — `owner` role assigned (UUID `00000000-0000-0000-0000-000000000002`)
5. `VN_subscriptions` — `free` plan created (max_users=1, max_sessions=1)
6. `VN_refresh_tokens` — refresh token hash stored with device info
7. `VN_audit_log` — `auth.register` event logged

**Errors:**
- `400` — Missing fields (`email, password, name, tenant_name` all required) or password < 8 chars
- `409` — Email already registered (`AUTH_EMAIL_EXISTS`)

### POST /api/v1/auth/login

```bash
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email": "kamal@vikuna.com", "password": "SecurePass123"}'
```

**Response (200):** Same shape as register.

**What happens on login:**
1. Fetches user + checks `is_active` and tenant `status = 'active'`
2. Checks `locked_until` — rejects if account is locked
3. Verifies password against `password_hash`
4. On failure: increments `failed_login_count`, locks after 5 attempts (15 min)
5. On success: resets `failed_login_count`, updates `last_login_at`
6. Fetches roles from `VN_user_roles` → `VN_roles`
7. Fetches plan from `VN_subscriptions` (current active)
8. Issues JWT pair, stores refresh token hash
9. Writes `VN_audit_log`: `auth.login_success` or `auth.login_failed`

**Errors:**
- `401` — Invalid email or password (`AUTH_INVALID_CREDENTIALS`)
- `401` — Account deactivated or tenant not active
- `429` — Account locked after 5 failed attempts (`AUTH_ACCOUNT_LOCKED`)

### POST /api/v1/auth/refresh

Exchange a refresh token for a new access + refresh pair. Old refresh token is revoked (rotation).

```bash
curl -X POST http://localhost:3001/api/v1/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refresh_token": "eyJhbGciOiJIUzI1..."}'
```

**Response (200):**
```json
{
  "access_token": "eyJ...(new)",
  "refresh_token": "eyJ...(new)",
  "expires_in": 900
}
```

**What happens:**
1. Verifies JWT signature + expiry
2. Looks up `token_hash` in `VN_refresh_tokens` where `is_active = true`
3. Revokes old token (`is_active = false`, `revoked_reason = 'session_replaced'`)
4. Issues new pair, stores new refresh token hash
5. Writes `VN_audit_log`: `auth.token_refresh`

**Errors:**
- `401` — Refresh token revoked, expired, or invalid (`AUTH_REFRESH_INVALID`)

### POST /api/v1/auth/logout

Revokes the refresh token. Access token remains valid until it expires (15 min).

```bash
curl -X POST http://localhost:3001/api/v1/auth/logout \
  -H 'Content-Type: application/json' \
  -d '{"refresh_token": "eyJhbGciOiJIUzI1..."}'
```

**Response (200):** `{ "success": true }`

**What happens:**
1. Sets `is_active = false`, `revoked_reason = 'user_logout'` on the refresh token
2. Writes `VN_audit_log`: `auth.logout`

### GET /api/v1/auth/me (Protected)

Returns the current user's profile + tenant info + roles. Requires Bearer token.

```bash
curl http://localhost:3001/api/v1/auth/me \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1...'
```

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

---

## 4. JWT Token Structure

### Access Token (15 min TTL)

```json
{
  "sub": "user-uuid",
  "tenant_id": "tenant-uuid",
  "roles": ["owner"],
  "tier": "professional",
  "email": "kamal@vikuna.com",
  "iat": 1711540800,
  "exp": 1711541700,
  "iss": "vani-framework"
}
```

- `roles` — Array of role codes from `VN_user_roles` → `VN_roles`
- `tier` — Mapped from `VN_subscriptions.plan_code` for backward compat (`free/starter` → `starter`, `pro` → `professional`, `enterprise` → `enterprise`)
- The `gateway/auth.ts` middleware maps `roles[0]` to `req.auth.role` for backward compat with existing skill code

### Refresh Token (30 day TTL)

```json
{
  "sub": "user-uuid",
  "tenant_id": "tenant-uuid",
  "type": "refresh",
  "iat": 1711540800,
  "exp": 1714132800,
  "iss": "vani-framework"
}
```

Stored in `VN_refresh_tokens` as SHA-256 hash (raw token never persisted).

---

## 5. Using Tokens in Protected Endpoints

```bash
# Chat with real JWT
curl -X POST http://localhost:3001/api/v1/chat \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer eyJhbG...' \
  -d '{"message": "show me system stats"}'

# Direct skill execution
curl -X POST http://localhost:3001/api/v1/skills/demo-skill/get_greeting \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer eyJhbG...' \
  -d '{"params": {"name": "Kamal"}}'
```

---

## 6. Dev Bypass (Still Works)

In development mode (`NODE_ENV=development`), X-Dev-* headers bypass JWT:

```bash
curl -X POST http://localhost:3001/api/v1/chat \
  -H 'Content-Type: application/json' \
  -H 'X-Dev-Tenant-Id: a0000000-0000-0000-0000-000000000001' \
  -H 'X-Dev-User-Id: b0000000-0000-0000-0000-000000000001' \
  -d '{"message": "hello"}'
```

Sets `req.auth` with `role='owner'`, `tier='professional'`. No JWT_SECRET needed.

---

## 7. Security Features

| Feature | Implementation |
|---------|---------------|
| Password hashing | bcrypt with 12 salt rounds (~250ms per hash) |
| Refresh token storage | SHA-256 hash — raw tokens never in DB |
| Token rotation | Each refresh revokes old token, issues new pair |
| Account lockout | 5 failed attempts → 15 min lock (`locked_until`) |
| Audit trail | Every auth event → `VN_audit_log` (append-only) |
| Session tracking | `VN_refresh_tokens` stores IP, user agent, device type |
| Tenant lifecycle | Status check on login: must be `active` |
| Session cleanup | `vn_cleanup_expired_sessions()` SQL function (via cron/BullMQ) |
| Max sessions | `VN_subscriptions.max_sessions` (enforcement ready, not yet wired) |

---

## 8. Role System

### System Roles (seeded by 001_vn_foundation.sql)

| UUID | Code | Description |
|------|------|-------------|
| `...-000000000001` | `superadmin` | Vikuna team. Cross-tenant access. |
| `...-000000000002` | `owner` | Tenant owner. Auto-assigned on register. |
| `...-000000000003` | `admin` | Tenant admin. Manages users and settings. |

### Product Roles (seeded by product migrations)

Products add their own roles in their migration files:
```sql
INSERT INTO VN_roles (tenant_id, code, name, description, is_system, sort_order)
VALUES (NULL, 'advisor', 'Financial Advisor', 'KI-Prime advisor role', false, 10);
```

### Tenant Custom Roles (created by tenant admins)

Tenants can create custom roles scoped to their organization:
```sql
INSERT INTO VN_roles (tenant_id, code, name)
VALUES ('tenant-uuid', 'senior_advisor', 'Senior Advisor');
```

---

## 9. Tenant Lifecycle

```
pending → active → suspended → banned → churned
```

- **register()** creates tenants with status `active` (skip pending for now)
- **login()** checks `tenant.status = 'active'` — rejects if suspended/banned/churned
- Future: admin endpoints to change tenant status

---

## 10. Quick Test Script

After running migrations + seed:

```powershell
# 1. Login with seed user
$env:JWT_SECRET="test-secret-for-dev-32chars!!"
# Start server, then in another terminal:

# Login
curl -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"dev@vani.local","password":"password123"}'

# Copy access_token from response, then:
curl http://localhost:3001/api/v1/auth/me -H "Authorization: Bearer <paste-token>"

# Or register a new user:
curl -X POST http://localhost:3001/api/v1/auth/register -H "Content-Type: application/json" -d '{"email":"new@test.com","password":"password123","name":"New User","tenant_name":"New Corp"}'
```

---

## 11. Product Integration Checklist

1. Pull updated VaNiBase submodule
2. Run `npm install` (adds bcrypt + jsonwebtoken)
3. Set `JWT_SECRET` in your `.env`
4. Run migrations:
   ```bash
   psql $DB -f migrations/001_vn_foundation.sql
   psql $DB -f migrations/002_vn_operational.sql
   ```
5. Optionally run seed: `psql $DB -f seeds/demo-seed.sql`
6. Test: `POST /api/v1/auth/login` with seed credentials
7. Update shell to use real JWT tokens from login response
