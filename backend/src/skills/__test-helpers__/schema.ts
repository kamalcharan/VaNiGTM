/**
 * The one place tests get their schema from.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────
 *
 * We shipped three production bugs in three days because inline CREATE
 * TABLE declarations in test files drifted from the real migrations. Each
 * time the test schema was "close enough" to pass tests, and off enough
 * that the first real write against production crashed:
 *
 *   · gt_contacts.full_name          (was: name)
 *   · gt_contact_channels.updated_at (does not exist)
 *   · get_briefs missing prospect_id filter
 *
 * The pattern is: test schemas that write themselves rather than reading
 * the migration files. This module fixes it by loading the actual
 * migration SQL — the same SQL that ships to production. A column named
 * here IS a column production has, or the migration itself is wrong.
 *
 * ── WHAT IT LOADS ─────────────────────────────────────────────────────
 *
 * Framework prerequisites (vn_tenants + the update_updated_at trigger)
 * are declared inline because they belong to the platform and rarely
 * change; product tables come from `backend/migrations/`. If a test needs
 * a table beyond the standard set, pass it in `extra`.
 *
 * Every migration this loads is guarded (IF NOT EXISTS + IF NOT EXISTS
 * on the ki_ table copies) and idempotent, so re-running is safe.
 */

import fs from 'fs';
import path from 'path';
import type { Pool } from 'pg';
// Side-effect: registers the int8→Number parser at pg module scope so every
// Pool this process opens (test and prod) returns bigserial ids as numbers.
import '../../db/pool';

const MIGRATIONS = path.resolve(__dirname, '../../../migrations');
const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '33333333-3333-3333-3333-333333333333';

/** Framework tables + trigger function. Not in migrations (managed by the
 *  VN framework); tests need them under them. */
const FRAMEWORK = `
CREATE TABLE IF NOT EXISTS vn_tenants (
  id UUID PRIMARY KEY,
  slug VARCHAR(80) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- migration 012_vn_tenant_is_admin — referenced by 209's seed clause and
  -- any later migration that gates on admin. Declared here so the loader
  -- does not need to run the whole framework migration series.
  is_admin  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$ LANGUAGE plpgsql;
-- Framework's own variant, referenced by legacy migrations (001_vn_foundation).
-- Declared here because tests do not run the vn framework migrations.
CREATE OR REPLACE FUNCTION vn_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION set_tenant_context(t UUID) RETURNS void AS $$
BEGIN PERFORM set_config('app.current_tenant_id', t::text, true); END $$ LANGUAGE plpgsql;
`;

/** Every migration a normal skill test needs, in order. Additive by
 *  design — a new phase adds one line here. */
const CORE_MIGRATIONS = [
  '187_gt_contacts.sql',         // gt_contacts + gt_contact_channels (the truth)
  '189_gt_contacts_sequences.sql', // gt_seq_counters + gt_next_seq
  '196_gt_prospects.sql',        // gt_prospects (schema, no pool)
  '207_gt_account_briefs.sql',
  '210_brief_extract_failed.sql',
  '209_gt_offers.sql',
  '211_brief_facts_and_judgement.sql',
  '212_offer_commitment.sql',
  '213_brief_human_offer.sql',
  '221_gt_touch_log.sql',
  '222_gt_journeys.sql',
  '223_gt_cadence_governor.sql',
  '224_contact_evidence.sql',
  '225_gt_journey_stories.sql',
  '226_gt_channel_types.sql',
  '227_channel_type_fk.sql',
];

export interface TestSchema {
  A: string; B: string;
}

/**
 * Bring the database up to the schema every test in the repo shares.
 *
 * Migration 187 assumes gt_industries + gt_source_loads (for the prospect
 * table's FKs) so we bootstrap those minimally beforehand. Adding real
 * migrations 193/194 might be cleaner, but they carry seed data and
 * checks the pilot does not need — the tiny stub declarations here are
 * the whole cost of not loading them.
 */
export async function bootstrapSchema(pool: Pool, extra: string[] = []): Promise<TestSchema> {
  await pool.query(FRAMEWORK);

  // Minimal stubs for tables 187 / 196 reference but do not own.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gt_industries (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS gt_universe_companies (
      id BIGSERIAL PRIMARY KEY, name TEXT);
    CREATE TABLE IF NOT EXISTS gt_source_loads (
      id BIGSERIAL PRIMARY KEY, tenant_id UUID, is_live BOOLEAN);
  `);

  for (const m of [...CORE_MIGRATIONS, ...extra]) {
    const p = path.join(MIGRATIONS, m);
    // Give the caller a real error line if a migration file is missing —
    // silent skip is exactly the class of bug this module exists to stop.
    if (!fs.existsSync(p)) throw new Error(`Test schema loader: ${m} not found in ${MIGRATIONS}`);
    await pool.query(fs.readFileSync(p, 'utf8'));
  }

  await pool.query(
    `INSERT INTO vn_tenants (id, slug) VALUES ($1, 'us'), ($2, 'them')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );

  return { A: TENANT_A, B: TENANT_B };
}

/** Every table a test might have written to, in a safe order. */
export const CLEAN_TABLES = [
  'gt_journey_stories',
  'gt_journey_events',
  'gt_journeys',
  'gt_touch_reservations',
  'gt_touch_log',
  'gt_account_briefs',
  'gt_contact_channels',
  'gt_contacts',
  'gt_prospects',
] as const;

export async function cleanBetweenTests(pool: Pool): Promise<void> {
  for (const t of CLEAN_TABLES) {
    // TRUNCATE with RESTART IDENTITY so BIGSERIAL rows in one test do not
    // leak numbering into the next; CASCADE for anything hanging off.
    await pool.query(`TRUNCATE TABLE ${t} RESTART IDENTITY CASCADE`);
  }
}
