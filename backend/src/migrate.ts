/**
 * KI-Prime — Migration Runner
 *
 * Reads SQL files from backend/migrations/ and applies them in alphabetical order.
 * Tracks applied migrations in vn_migrations (framework table, already exists).
 *
 * Usage:
 *   npm run db:migrate              — apply pending migrations
 *   npm run db:migrate -- --status  — show migration status
 *
 * Rules:
 *   - Each migration runs in its own transaction (atomic)
 *   - Skips already-applied migrations (matched by filename)
 *   - Checksum (MD5 of file content) detects modified migrations
 *   - Never re-runs or deletes applied migrations
 *   - VN_ migrations are managed by the framework, not this runner
 *   - KI_ migrations (001_ki_prime.sql, etc.) are managed here
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Pool } from 'pg';

/* ── Configuration ──────────────────────────────────── */

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'migrations');
const isDev = process.env.NODE_ENV !== 'production';

/* ── Pool (standalone — not shared with server) ─────── */

function createMigrationPool(): Pool {
  const connectionString = process.env.DB_PRIMARY;
  if (!connectionString) {
    console.error('[Migrate] DB_PRIMARY environment variable is required.');
    process.exit(1);
  }

  const useSSL = process.env.DB_PRIMARY_SSL === 'true';

  return new Pool({
    connectionString,
    max: 2,
    ssl: useSSL ? { rejectUnauthorized: false } : undefined,
  });
}

/* ── Types ──────────────────────────────────────────── */

interface MigrationFile {
  filename: string;
  filepath: string;
  content: string;
  checksum: string;
}

interface AppliedMigration {
  filename: string;
  checksum: string | null;
  applied_at: Date;
}

/* ── Discover migration files ───────────────────────── */

function discoverMigrations(): MigrationFile[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log(`[Migrate] No migrations directory at ${MIGRATIONS_DIR}`);
    return [];
  }

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort(); // Alphabetical order = execution order

  return files.map(filename => {
    const filepath = path.join(MIGRATIONS_DIR, filename);
    const content = fs.readFileSync(filepath, 'utf-8');
    const checksum = crypto.createHash('md5').update(content).digest('hex');
    return { filename, filepath, content, checksum };
  });
}

/* ── Get applied migrations from DB ─────────────────── */

async function getAppliedMigrations(pool: Pool): Promise<AppliedMigration[]> {
  try {
    const result = await pool.query<AppliedMigration>(
      'SELECT filename, checksum, applied_at FROM vn_migrations ORDER BY applied_at',
    );
    return result.rows;
  } catch (err: unknown) {
    // If vn_migrations doesn't exist, no migrations have been applied
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('does not exist')) {
      if (isDev) console.log('[Migrate] vn_migrations table not found — assuming fresh database');
      return [];
    }
    throw err;
  }
}

/* ── Apply a single migration ───────────────────────── */

async function applyMigration(pool: Pool, migration: MigrationFile): Promise<number> {
  const client = await pool.connect();
  const start = Date.now();

  try {
    await client.query('BEGIN');

    // Execute the migration SQL
    await client.query(migration.content);

    // Record in vn_migrations (upsert to handle re-runs safely)
    await client.query(
      `INSERT INTO vn_migrations (filename, checksum, applied_by, execution_ms, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (filename) DO UPDATE SET
         checksum = EXCLUDED.checksum,
         execution_ms = EXCLUDED.execution_ms`,
      [
        migration.filename,
        migration.checksum,
        'ki-prime-migrate',
        Date.now() - start,
        `Applied by migration runner`,
      ],
    );

    await client.query('COMMIT');
    return Date.now() - start;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/* ── Status command ─────────────────────────────────── */

async function showStatus(pool: Pool): Promise<void> {
  const files = discoverMigrations();
  const applied = await getAppliedMigrations(pool);
  const appliedMap = new Map(applied.map(a => [a.filename, a]));

  console.log('\n  Migration Status\n  ─────────────────────────────────────');

  for (const file of files) {
    const a = appliedMap.get(file.filename);
    if (a) {
      const checksumMatch = a.checksum === file.checksum;
      const status = checksumMatch ? '\x1b[32m✓ applied\x1b[0m' : '\x1b[33m⚠ modified\x1b[0m';
      console.log(`  ${status}  ${file.filename}`);
      if (!checksumMatch) {
        console.log(`           DB checksum:   ${a.checksum}`);
        console.log(`           File checksum: ${file.checksum}`);
      }
    } else {
      console.log(`  \x1b[36m○ pending\x1b[0m  ${file.filename}`);
    }
  }

  const pending = files.filter(f => !appliedMap.has(f.filename));
  console.log(`\n  ${applied.length} applied, ${pending.length} pending\n`);
}

/* ── Exported: run migrations against an existing pool ─ */

export async function runMigrations(pool: Pool): Promise<void> {
  const files = discoverMigrations();
  const applied = await getAppliedMigrations(pool);
  const appliedSet = new Set(applied.map((a) => a.filename));
  const pending = files.filter((f) => !appliedSet.has(f.filename));

  if (pending.length === 0) {
    console.log('[Migrate] All migrations up to date.');
    return;
  }

  console.log(`[Migrate] ${pending.length} pending migration(s) — applying...`);
  for (const migration of pending) {
    process.stdout.write(`  ${migration.filename}...`);
    try {
      const ms = await applyMigration(pool, migration);
      console.log(` done (${ms}ms)`);
    } catch (err) {
      console.error(` FAILED: ${err instanceof Error ? err.message : String(err)}`);
      throw err; // Propagate — server should not start with a failed migration
    }
  }
  console.log(`[Migrate] ${pending.length} migration(s) applied.`);
}

/* ── Main ───────────────────────────────────────────── */

async function main(): Promise<void> {
  const pool = createMigrationPool();
  const args = process.argv.slice(2);

  try {
    // Verify connection
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('[Migrate] Connected to database');

    if (args.includes('--status')) {
      await showStatus(pool);
      return;
    }

    // Discover and apply
    const files = discoverMigrations();
    const applied = await getAppliedMigrations(pool);
    const appliedSet = new Set(applied.map(a => a.filename));

    const pending = files.filter(f => !appliedSet.has(f.filename));

    if (pending.length === 0) {
      console.log('[Migrate] All migrations are up to date.');
      return;
    }

    console.log(`[Migrate] ${pending.length} pending migration(s):\n`);

    for (const migration of pending) {
      process.stdout.write(`  Applying ${migration.filename}...`);
      try {
        const ms = await applyMigration(pool, migration);
        console.log(` \x1b[32mdone\x1b[0m (${ms}ms)`);
      } catch (err) {
        console.log(` \x1b[31mFAILED\x1b[0m`);
        console.error(`\n  Error: ${err instanceof Error ? err.message : String(err)}`);
        console.error(`  Migration ${migration.filename} was rolled back.`);
        console.error('  Fix the issue and re-run db:migrate.\n');
        process.exit(1);
      }
    }

    console.log(`\n[Migrate] ${pending.length} migration(s) applied successfully.`);
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('[Migrate] Fatal error:', err);
  process.exit(1);
});
