/**
 * VaNiBase Framework — Migration Runner
 *
 * Runs .sql migration files in order from a migrations directory.
 * Tracks applied migrations in a _migrations table.
 *
 * Usage: tsx vani-base/framework/migrate.ts [--dir ./migrations]
 */

import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

const MIGRATIONS_TABLE = '_migrations';

async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT now()
    )
  `);
}

async function getAppliedMigrations(pool: Pool): Promise<Set<string>> {
  const result = await pool.query(`SELECT name FROM ${MIGRATIONS_TABLE}`);
  return new Set(result.rows.map((r: { name: string }) => r.name));
}

async function runMigrations(migrationsDir: string, pool: Pool): Promise<void> {
  if (!fs.existsSync(migrationsDir)) {
    console.log(`[migrate] No migrations directory: ${migrationsDir}`);
    return;
  }

  await ensureMigrationsTable(pool);
  const applied = await getAppliedMigrations(pool);

  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    console.log(`[migrate] Applying: ${file}`);

    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query(`INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES ($1)`, [file]);
      await pool.query('COMMIT');
      count++;
    } catch (err) {
      await pool.query('ROLLBACK');
      console.error(`[migrate] Failed on ${file}:`, err);
      throw err;
    }
  }

  console.log(`[migrate] Applied ${count} migration(s) from ${migrationsDir}`);
}

/* ── CLI entry point ──────────────────────────────────────── */

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[migrate] DATABASE_URL not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString });

  // Parse --dir flag or use default
  const dirIndex = process.argv.indexOf('--dir');
  const migrationsDir = dirIndex >= 0
    ? path.resolve(process.argv[dirIndex + 1])
    : path.resolve(__dirname, '../../migrations');

  try {
    await runMigrations(migrationsDir, pool);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[migrate] Fatal:', err);
  process.exit(1);
});

export { runMigrations };
