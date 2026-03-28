# VaNiBase DB Layer — Usage Guide

## Overview

The DB layer provides a multi-database connection factory with named pools, SSL auto-detection, tenant-scoped queries, migration runner, and per-pool health checks.

**Architecture layers:**
```
WrappedPool          — raw pg.Pool wrapper (query, transaction, health)
  └─ createTenantScopedDB()  — adds set_tenant_context() + named params (:paramName)
       └─ TenantScopedDB     — what ctx.db exposes to skill handlers
```

**Files:**
```
framework/db/
├── types.ts         → All TypeScript interfaces
├── config.ts        → Reads DB_* env vars, SSL auto-detect
├── wrapped-pool.ts  → WrappedPool class (pg.Pool wrapper)
├── factory.ts       → Pool registry: initPools(), getPool(), healthCheck(), closeAll()
├── tenant.ts        → createTenantScopedDB(), createStubDB(), updateWithVersion()
├── health.ts        → Express handler for /health/ready DB section
├── migrate.ts       → Migration runner with vn_migrations tracking
└── index.ts         → Barrel exports
```

---

## 1. Environment Configuration

### Single Database (most products)

```env
# Option A: Connection string (recommended)
DB_PRIMARY=postgresql://user:password@host:5432/database

# Option B: Legacy individual params (still supported)
DB_HOST=localhost
DB_PORT=5432
DB_USER=vani
DB_PASSWORD=changeme
DB_NAME=vani

# Option C: Old-style (backward compatible)
DATABASE_URL=postgresql://user:password@host:5432/database
```

### Dual Database (e.g., KI-Prime reading KaalaDristi market data)

```env
DB_PRIMARY=postgresql://ki_app:pass@supabase-host:6543/postgres
DB_PRIMARY_SSL=true
DB_PRIMARY_POOL_MAX=20

DB_SECONDARY=postgresql://kd_app:pass@192.168.1.100:5432/kaala_dristi_db
DB_SECONDARY_SSL=false
DB_SECONDARY_POOL_MAX=5
```

### SSL Configuration

| Env Var | Behavior |
|---------|----------|
| `DB_PRIMARY_SSL=false` | SSL off (explicit) |
| `DB_PRIMARY_SSL=true` | SSL on, `rejectUnauthorized: false` |
| Not set (auto-detect) | Supabase hosts → SSL on; private IPs → SSL off; public → SSL on |

### Pool Tuning

| Env Var | Default | Description |
|---------|---------|-------------|
| `DB_PRIMARY_POOL_MAX` | 20 | Max pool connections |
| `DB_PRIMARY_POOL_IDLE_MS` | 30000 | Idle timeout (ms) |
| `DB_PRIMARY_POOL_CONN_MS` | 5000 | Connection timeout (ms) |
| `DB_PRIMARY_STMT_TIMEOUT` | 0 | Statement timeout (0 = none) |

---

## 2. Server Boot

The server calls `initPools()` once at startup. This reads all `DB_*` env vars, creates pools, and runs health checks.

```typescript
// framework/server.ts (already wired)
import { initPools, closeAll } from './db/index.js';

await initPools();

// Graceful shutdown
process.on('SIGTERM', async () => { await closeAll(); });
```

**Boot log:**
```
[DB:primary] Pool created (max=20, ssl=false)
[DB Factory] Pool 'primary' healthy (12ms, 619 MB)
```

If no DB env vars are set, the factory runs in stub mode:
```
[DB Factory] No database configured — running in stub mode
```

---

## 3. Using in Skill Handlers (TenantScopedDB)

Skills access the database through `ctx.db`, which is a `TenantScopedDB`. **This interface is unchanged** — existing skills work without modification.

```typescript
// Skill handler signature: (params, ctx) — params FIRST, ctx SECOND
export async function getClients(
  params: Record<string, unknown>,
  ctx: SkillContext
): Promise<SkillResult> {

  // Named params with :paramName syntax
  const { rows } = await ctx.db.query(
    'SELECT * FROM ki_clients WHERE tenant_id = :tenantId AND active = true',
    { tenantId: ctx.tenantId }
  );

  // Single row
  const client = await ctx.db.queryOne(
    'SELECT * FROM ki_clients WHERE id = :id',
    { id: params.client_id }
  );

  // Transaction
  const result = await ctx.db.transaction(async (tx) => {
    await tx.execute(
      'UPDATE ki_goals SET status = :status WHERE id = :id',
      { status: 'completed', id: params.goal_id }
    );
    return { updated: true };
  });

  // Pessimistic locking
  const rows2 = await ctx.db.queryForUpdate(
    'SELECT * FROM ki_holdings WHERE id = :id',
    { id: params.holding_id }
  );

  return { success: true, recipe: 'client-list', data: { clients: rows } };
}
```

### TenantScopedDB Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `query(sql, params)` | `{ rows: T[] }` | Run query, return all rows |
| `queryOne(sql, params)` | `T \| null` | Return first row or null |
| `queryForUpdate(sql, params)` | `T[]` | Append `FOR UPDATE` to query |
| `execute(sql, params)` | `{ rowCount: number }` | INSERT/UPDATE/DELETE |
| `transaction(fn)` | `T` | Wrap in BEGIN/COMMIT/ROLLBACK |

**Every method** calls `SELECT set_tenant_context($1)` before executing, ensuring RLS works correctly.

---

## 4. Direct Pool Access (Advanced)

For code that needs raw pool access (e.g., memory store, migrations, admin tools):

```typescript
import { getPool } from '../db/index.js';

// Default pool
const pool = getPool();            // returns 'primary' pool
const { rows } = await pool.query('SELECT 1 AS ok');

// Named pool
const marketDb = getPool('secondary');
const { rows } = await marketDb.query('SELECT * FROM km_equity_eod LIMIT 10');

// Raw pg.Pool (escape hatch)
const pgPool = getPool().raw;
const client = await pgPool.connect();
// ... use client directly
client.release();

// Transaction via WrappedPool
const result = await pool.transaction(async (client) => {
  await client.query('INSERT INTO vn_audit_log ...');
  return { logged: true };
});
```

---

## 5. Health Checks

The `/health/ready` endpoint now returns per-pool status:

```bash
curl http://localhost:3001/health/ready
```

```json
{
  "status": "ready",
  "checks": {
    "db": {
      "status": "healthy",
      "pools": [
        {
          "name": "primary",
          "healthy": true,
          "latencyMs": 12,
          "totalConnections": 3,
          "idleConnections": 2,
          "waitingRequests": 0,
          "databaseSize": "619 MB"
        }
      ],
      "timestamp": "2026-03-27T10:30:00.000Z"
    },
    "redis": true,
    "vllm": false
  }
}
```

Programmatic health check:

```typescript
import { healthCheck } from '../db/index.js';

const report = await healthCheck();
// report.status: 'healthy' | 'degraded' | 'unhealthy'
// report.pools: PoolHealthStatus[]
```

---

## 6. Running Migrations

```typescript
import { runMigrations, migrationStatus } from '../db/index.js';
import { resolve } from 'path';

// Run pending migrations from a directory
const applied = await runMigrations(
  resolve(process.cwd(), 'migrations'),
  'primary'  // pool name (default)
);

// Check migration status
const status = await migrationStatus('primary');
console.log(status);
// [{ id: 1, filename: '001_vn_foundation.sql', applied_at: '...', execution_ms: 45 }]
```

Migration files must be `.sql` files in the specified directory. They run in filename sort order and are tracked in the `vn_migrations` table. Re-running is idempotent — already-applied migrations are skipped.

---

## 7. Optimistic Locking

```typescript
import { updateWithVersion, StaleVersionError } from '../db/index.js';

try {
  await updateWithVersion(
    ctx.db,
    'ki_holdings',
    holdingId,
    expectedVersion,      // version from the read
    'units = :units, nav = :nav',
    { units: 100, nav: 45.67 }
  );
} catch (err) {
  if (err instanceof StaleVersionError) {
    // Row was modified by another transaction — retry or notify user
  }
  throw err;
}
```

---

## 8. Product Integration Checklist

When a product pulls the updated VaNiBase submodule:

1. **Update `.env`** — set `DB_PRIMARY` (or keep `DATABASE_URL` for backward compat)
2. **No code changes needed** — `ctx.db` interface is identical
3. **Optional: Add secondary pool** — set `DB_SECONDARY` for cross-database queries
4. **Test** — `npm run typecheck` then boot with `VANI_MOCK=true`

### KaalaDristi Example
```env
DB_PRIMARY=postgresql://kd_app:KdApp2026Secure@187.127.136.65:5432/kaala_dristi_db
DB_PRIMARY_SSL=false
DB_PRIMARY_POOL_MAX=20
```

### KI-Prime Example (Dual Pool)
```env
DB_PRIMARY=postgresql://postgres.xxx:pass@supabase-pooler:6543/postgres
DB_PRIMARY_SSL=true
DB_SECONDARY=postgresql://kd_app:pass@187.127.136.65:5432/kaala_dristi_db
DB_SECONDARY_SSL=false
DB_SECONDARY_POOL_MAX=5
```

---

## 9. File Import Map

| What you need | Import from |
|---------------|-------------|
| `initPools`, `closeAll` | `framework/db/index.js` |
| `getPool`, `isPoolReady` | `framework/db/index.js` |
| `createTenantScopedDB`, `createStubDB` | `framework/db/index.js` |
| `healthCheck` | `framework/db/index.js` |
| `runMigrations`, `migrationStatus` | `framework/db/index.js` |
| `updateWithVersion`, `StaleVersionError` | `framework/db/index.js` |
| `WrappedPool` (class) | `framework/db/index.js` |
| Types (`DbPoolConfig`, `HealthReport`, etc.) | `framework/db/index.js` |

Everything exports through the barrel `framework/db/index.ts`. No need to import from individual files.
