/**
 * KI-Prime — PostgreSQL Connection Pool
 *
 * Single pool for the vani_gtm_db database (VN_ framework + GT_ product tables).
 * Every connection checkout calls set_tenant_context() for RLS enforcement.
 *
 * Config via environment:
 *   DB_PRIMARY        — PostgreSQL connection string
 *   DB_PRIMARY_SSL    — "true" for remote VPS, "false" for local dev
 *   NODE_ENV          — "production" suppresses verbose logging
 */

import { Pool, type PoolConfig, types } from 'pg';

/* ── BIGINT as number ──────────────────────────────────
 * node-pg's default: BIGINT (int8, OID 20) comes back as a STRING to
 * avoid precision loss above Number.MAX_SAFE_INTEGER. Every function
 * that returns a bigserial id — journey.id, prospect_id, brief.id,
 * contact.id — inherited that decision and shipped "1" instead of 1 to
 * the frontend, which then passed it back into the next query as a
 * string and got zero rows.
 *
 * Registering a parser here fixes it once. Our ids come from BIGSERIAL
 * sequences and will never reach 2^53 (that is nine quadrillion rows in
 * ONE table on ONE tenant); the safety this trades away is not real for
 * this product. The parser stays a Number.
 *
 * Cast-based OID 1700 (numeric) is deliberately left alone — numeric
 * columns hold money, ratios, and other values where losing decimal
 * precision would be a real bug. Those stay strings.
 */
const OID_INT8 = 20;
types.setTypeParser(OID_INT8, (v) => v === null ? null : Number(v));

/* ── Pool singleton ─────────────────────────────────── */

let pool: Pool | null = null;

/* ── Configuration ──────────────────────────────────── */

function buildPoolConfig(): PoolConfig {
  const connectionString = process.env.DB_PRIMARY;
  if (!connectionString) {
    throw new Error(
      '[DB] DB_PRIMARY environment variable is required. ' +
      'Set it to a PostgreSQL connection string: postgresql://user:pass@host:port/dbname',
    );
  }

  const useSSL = process.env.DB_PRIMARY_SSL === 'true';
  const isDev = process.env.NODE_ENV !== 'production';

  const config: PoolConfig = {
    connectionString,

    // Pool sizing — CLAUDE.md: max 25, direct to VPS PG
    max: 25,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,

    // SSL for remote connections (Railway/DO → VPS)
    ssl: useSSL ? { rejectUnauthorized: false } : undefined,
  };

  if (isDev) {
    console.log(
      `[DB] Pool configured: max=25, ssl=${useSSL}, host=${connectionString.replace(/\/\/.*@/, '//***@')}`,
    );
  }

  return config;
}

/* ── Pool lifecycle ─────────────────────────────────── */

/**
 * Get or create the singleton pool.
 * Call once at startup; reuse across all requests.
 */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(buildPoolConfig());

    // Log pool errors (don't crash the process)
    pool.on('error', (err) => {
      console.error('[DB] Unexpected pool error:', err.message);
    });
  }
  return pool;
}

/*
 * `getClientWithTenant(tenantId)` used to live here. It acquired a client,
 * called set_tenant_context() on it, and returned it.
 *
 * It could not work. set_tenant_context() uses set_config(..., is_local := true),
 * so the setting is scoped to the surrounding transaction — and outside an
 * explicit BEGIN, that single statement IS the transaction. The GUC was
 * therefore gone before the caller ran anything, and every tenant-scoped query
 * on the returned client would match nothing once RLS is enforced. Verified
 * against a restricted role: the pattern returns 0 rows.
 *
 * It had no callers, so nothing was broken in practice — but it was a trap for
 * the next one, and it read as though tenant context were handled. Use
 * `withTenantClient(pool, tenantId, fn)` from ./query instead: the callback
 * shape keeps the transaction open across the caller's work, which is the part
 * that actually matters.
 */

/**
 * Health check — verify pool can connect and query.
 * Returns latency in ms, or throws on failure.
 */
export async function healthCheck(): Promise<{ ok: true; latency_ms: number }> {
  const start = Date.now();
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('SELECT 1');
    return { ok: true, latency_ms: Date.now() - start };
  } finally {
    client.release();
  }
}

/**
 * Graceful shutdown — drain all connections.
 * Call in SIGTERM/SIGINT handler.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    console.log('[DB] Draining connection pool...');
    await pool.end();
    pool = null;
    console.log('[DB] Pool closed.');
  }
}
