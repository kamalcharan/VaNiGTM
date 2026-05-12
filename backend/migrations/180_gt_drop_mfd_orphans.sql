-- ════════════════════════════════════════════════════════════════════════════
-- 180_gt_drop_mfd_orphans.sql
-- Drop MFD-era tables whose owning skills (portfolio-skill, market-skill,
-- planning-skill) and frontend routes (/portfolio, /market/*, /global-nav,
-- /my-nav, /planning, /goals) were removed in the GTM cleanup.
--
-- Conservative scope: only tables with ZERO references from kept skills.
-- Tables left in place (still referenced or future-useful):
--   ki_holdings        — client-skill stat counts
--   ki_goals           — client-skill, contact-skill stat counts
--   ki_schemes         — etl-skill scheme import infra
--   ki_transactions    — etl-skill txn import infra
--   ki_transaction_types — global ref data
--
-- All drops use CASCADE to handle dependent FKs/views.
-- Idempotent (DROP IF EXISTS).
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

DROP TABLE IF EXISTS ki_portfolios          CASCADE;
DROP TABLE IF EXISTS ki_goal_projections    CASCADE;

-- Market / NAV / scheme reference
DROP TABLE IF EXISTS ki_nav_history         CASCADE;
DROP TABLE IF EXISTS ki_scheme_aliases      CASCADE;
DROP TABLE IF EXISTS ki_scheme_bookmarks    CASCADE;
DROP TABLE IF EXISTS ki_scheme_categories   CASCADE;
DROP TABLE IF EXISTS ki_market_indices      CASCADE;
DROP TABLE IF EXISTS ki_market_data         CASCADE;
DROP TABLE IF EXISTS ki_market_jobs         CASCADE;

-- Legacy: ki_alerts was renamed to ki_pulses in migration 157.
-- If a stale ki_alerts table still exists (e.g. in a partially-migrated DB),
-- drop it. Migration 157 should already have removed it.
DROP TABLE IF EXISTS ki_alerts              CASCADE;

COMMIT;
