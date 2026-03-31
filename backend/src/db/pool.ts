/**
 * KI-Prime — PostgreSQL Connection Pool
 *
 * Single pool for the ki_prime_db database (VN_ framework + KI_ product tables).
 * Every connection checkout calls set_tenant_context() for RLS enforcement.
 *
 * Config via environment:
 *   DB_PRIMARY        — PostgreSQL connection string
 *   DB_PRIMARY_SSL    — "true" for remote VPS, "false" for local dev
 *   NODE_ENV          — "production" suppresses verbose logging
 */

import { Pool, type PoolConfig, type PoolClient } from 'pg';

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

/**
 * Acquire a client with tenant context set for RLS.
 *
 * CRITICAL: Every connection checkout sets app.current_tenant_id
 * via set_tenant_context(). This is the RLS safety net.
 * Application code ALSO filters by tenant_id in every query (belt + suspenders).
 */
export async function getClientWithTenant(tenantId: string): Promise<PoolClient> {
  const p = getPool();
  const client = await p.connect();

  try {
    await client.query('SELECT set_tenant_context($1)', [tenantId]);
  } catch (err) {
    client.release();
    throw new Error(
      `[DB] Failed to set tenant context for ${tenantId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return client;
}

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
