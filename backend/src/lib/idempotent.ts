/**
 * KI-Prime — Idempotent Operation Wrapper
 *
 * Ensures global data operations (NAV download, metrics calculation)
 * are safe when triggered by multiple tenants concurrently.
 *
 * 3-layer protection:
 *   1. Freshness check — skip if recently done
 *   2. PostgreSQL advisory lock — prevent concurrent execution for same key
 *   3. DB UPSERT — safety net against any remaining race
 *
 * Advisory locks are:
 *   - Per-connection, auto-released on disconnect
 *   - Non-blocking (pg_try_advisory_lock returns false immediately)
 *   - No table bloat (no lock rows to clean up)
 *   - No Redis dependency
 */

import type { Pool } from 'pg';

export interface IdempotentResult<T> {
  status: 'executed' | 'skipped';
  reason?: 'already_fresh' | 'completed_by_other' | 'lock_held';
  result?: T;
}

export interface IdempotencyOptions {
  /** Milliseconds to wait before rechecking freshness when lock is held (default: 2000) */
  retryDelayMs?: number;
  /** Number of retry attempts when lock is held (default: 1) */
  retryAttempts?: number;
}

/**
 * Execute an operation with idempotency guarantees on global (non-tenant) data.
 *
 * @param pool       — Direct pool (not tenant-scoped, since this is for global data)
 * @param lockKey    — Unique string for this operation (e.g. 'nav_download_100033')
 * @param isFresh    — Returns true if the operation was recently completed (skip)
 * @param operation  — The actual work to perform
 * @param options    — Retry configuration
 *
 * Usage:
 *   const result = await withIdempotency(
 *     pool,
 *     `nav_download_${schemeCode}`,
 *     () => checkNavExistsForToday(pool, schemeCode),
 *     () => fetchAndUpsertNav(pool, schemeCode),
 *   );
 */
export async function withIdempotency<T>(
  pool: Pool,
  lockKey: string,
  isFresh: () => Promise<boolean>,
  operation: () => Promise<T>,
  options?: IdempotencyOptions,
): Promise<IdempotentResult<T>> {
  const retryDelay = options?.retryDelayMs ?? 2000;
  const retryAttempts = options?.retryAttempts ?? 1;

  // 1. Freshness check — fast path, no lock needed
  if (await isFresh()) {
    return { status: 'skipped', reason: 'already_fresh' };
  }

  // 2. Acquire advisory lock (non-blocking)
  const client = await pool.connect();
  try {
    const lockResult = await client.query(
      `SELECT pg_try_advisory_lock(hashtext($1))`,
      [lockKey],
    );
    const acquired = lockResult.rows[0]?.pg_try_advisory_lock === true;

    if (!acquired) {
      // Another process holds the lock — wait and recheck
      for (let attempt = 0; attempt < retryAttempts; attempt++) {
        await new Promise((r) => setTimeout(r, retryDelay));
        if (await isFresh()) {
          return { status: 'skipped', reason: 'completed_by_other' };
        }
      }
      return { status: 'skipped', reason: 'lock_held' };
    }

    // 3. Double-check freshness after acquiring lock (another process may have just finished)
    if (await isFresh()) {
      return { status: 'skipped', reason: 'already_fresh' };
    }

    // 4. Execute the operation
    const result = await operation();
    return { status: 'executed', result };
  } finally {
    // 5. Release advisory lock
    await client.query(
      `SELECT pg_advisory_unlock(hashtext($1))`,
      [lockKey],
    ).catch(() => { /* lock released on disconnect anyway */ });
    client.release();
  }
}
