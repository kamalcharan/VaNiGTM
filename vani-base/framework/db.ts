/**
 * VaNiBase Framework — Database Pool with RLS
 *
 * Wraps pg.Pool, sets app.tenant_id per-query for Row Level Security.
 */

import { Pool, PoolClient } from 'pg';
import type { QueryResult, SkillDb } from '../../shared/types';

let pool: Pool | null = null;

export function getPool(connectionString: string): Pool {
  if (!pool) {
    pool = new Pool({ connectionString, max: 20 });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Convert named params ($tenant_id, $client_id) to positional ($1, $2)
 * and return [transformedSql, values[]].
 */
function namedToPositional(
  sql: string,
  params?: Record<string, unknown>
): [string, unknown[]] {
  if (!params || Object.keys(params).length === 0) return [sql, []];

  const values: unknown[] = [];
  const seen = new Map<string, number>();

  const transformed = sql.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (match, name) => {
    const key = `$${name}`;
    if (!(key in params)) return match; // leave as-is if not in params
    if (seen.has(key)) return `$${seen.get(key)}`;
    values.push(params[key]);
    const idx = values.length;
    seen.set(key, idx);
    return `$${idx}`;
  });

  return [transformed, values];
}

/**
 * Creates a SkillDb bound to a specific tenant.
 * Sets RLS context on each query via SET LOCAL.
 */
export function createSkillDb(dbPool: Pool, tenantId: string): SkillDb {
  return {
    async query<T = Record<string, unknown>>(
      sql: string,
      params?: Record<string, unknown>
    ): Promise<QueryResult<T>> {
      const client: PoolClient = await dbPool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SET LOCAL app.tenant_id = '${tenantId.replace(/'/g, "''")}'`);
        const [positionalSql, values] = namedToPositional(sql, params);
        const result = await client.query<T>(positionalSql, values);
        await client.query('COMMIT');
        return { rows: result.rows };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
  };
}
