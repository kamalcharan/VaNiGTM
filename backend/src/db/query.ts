/**
 * KI-Prime — Tenant-scoped Database Interface
 *
 * Creates the SkillDb object injected into every skill handler via SkillContext.
 * Handles:
 *   1. Named param translation ($tenant_id → $1, $client_id → $2)
 *   2. Tenant context injection on every query (RLS belt + suspenders)
 *   3. Transaction wrapping with automatic BEGIN/COMMIT/ROLLBACK
 *
 * CLAUDE.md rules enforced:
 *   - Every query filters by tenant_id (application layer)
 *   - set_tenant_context() called per connection (RLS layer)
 *   - Every write operation wrapped in transaction
 */

import type { Pool, PoolClient } from 'pg';
import type { SkillDb, QueryResult } from '../types/skill.types';

/* ── Named Parameter Translation ────────────────────── */

/**
 * Translates named parameters ($param_name) to positional ($1, $2, ...).
 *
 * Input:
 *   sql:    "WHERE tenant_id = $tenant_id AND client_id = $client_id"
 *   params: { $tenant_id: "abc", $client_id: 123 }
 *
 * Output:
 *   { text: "WHERE tenant_id = $1 AND client_id = $2", values: ["abc", 123] }
 *
 * Rules:
 *   - Params can be keyed with or without $ prefix (both work)
 *   - Duplicate $param references reuse the same positional index
 *   - Unmatched $params in SQL throw an error (catch typos early)
 */
export function translateParams(
  sql: string,
  params?: Record<string, unknown>,
): { text: string; values: unknown[] } {
  if (!params || Object.keys(params).length === 0) {
    return { text: sql, values: [] };
  }

  // Normalize keys: ensure all have $ prefix
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    const k = key.startsWith('$') ? key : `$${key}`;
    normalized[k] = value;
  }

  const paramMap = new Map<string, number>(); // $name → positional index
  const values: unknown[] = [];

  // Replace all $param_name occurrences with $N
  // Match $word_chars but NOT $1, $2 (already positional)
  const text = sql.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_match, name) => {
    const key = `$${name}`;

    if (!normalized.hasOwnProperty(key)) {
      throw new Error(
        `[DB] SQL parameter ${key} not found in params. ` +
        `Available: ${Object.keys(normalized).join(', ')}`,
      );
    }

    if (!paramMap.has(key)) {
      values.push(normalized[key]);
      paramMap.set(key, values.length);
    }

    return `$${paramMap.get(key)}`;
  });

  return { text, values };
}

/* ── Tenant-scoped Database ─────────────────────────── */

/**
 * Creates a SkillDb bound to a specific tenant.
 * Every query/transaction automatically sets tenant context for RLS.
 *
 * Usage in server.ts:
 *   const db = createTenantDb(pool, tenantId);
 *   const ctx: SkillContext = { tenant_id: tenantId, db };
 */
export function createTenantDb(pool: Pool, tenantId: string): SkillDb {
  /**
   * Execute a single query with named params.
   * Acquires a client, sets tenant context, runs query, releases.
   */
  async function query<T = Record<string, unknown>>(
    sql: string,
    params?: Record<string, unknown>,
  ): Promise<QueryResult<T>> {
    const client = await pool.connect();
    try {
      // RLS safety net: set tenant context on this connection
      await client.query('SELECT set_tenant_context($1)', [tenantId]);

      const { text, values } = translateParams(sql, params);
      const result = await client.query<T>(text, values);
      return { rows: result.rows };
    } finally {
      client.release();
    }
  }

  /**
   * Execute multiple queries in a transaction.
   * Provides a scoped SkillDb that shares a single client + transaction.
   *
   * Pattern:
   *   await ctx.db.transaction(async (tx) => {
   *     await tx.query(INSERT_CLIENT, { $tenant_id: ctx.tenant_id, ... });
   *     await tx.query(INSERT_PORTFOLIO, { $tenant_id: ctx.tenant_id, ... });
   *   });
   *
   * On success: COMMIT
   * On error:   ROLLBACK + rethrow
   * Always:     release client back to pool
   */
  async function transaction<T>(
    fn: (tx: SkillDb) => Promise<T>,
  ): Promise<T> {
    const client = await pool.connect();
    try {
      // Set tenant context BEFORE transaction begins
      await client.query('SELECT set_tenant_context($1)', [tenantId]);
      await client.query('BEGIN');

      // Create a transaction-scoped SkillDb that reuses this client
      const txDb: SkillDb = {
        query: async <R = Record<string, unknown>>(
          txSql: string,
          txParams?: Record<string, unknown>,
        ): Promise<QueryResult<R>> => {
          const { text, values } = translateParams(txSql, txParams);
          const result = await client.query<R>(text, values);
          return { rows: result.rows };
        },
        transaction: () => {
          throw new Error('[DB] Nested transactions are not supported. Use savepoints if needed.');
        },
      };

      const result = await fn(txDb);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {
        // ROLLBACK failed — connection may be broken, pool will discard it
      });
      throw err;
    } finally {
      client.release();
    }
  }

  return { query, transaction };
}
