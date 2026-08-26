-- ============================================================================
-- 247_vara_embed_boot_pings.sql
--
-- One column: when did each allowlisted embed origin last boot the widget?
--
-- The Install screen (execution POA Phase 4) has to answer "is my site
-- actually running Vara?" honestly. Before this column there was nowhere to
-- record a boot, so the screen could only show what the tenant DECLARED
-- (embed_origins) and never what was OBSERVED — a setup screen that reports
-- an unpasted snippet as installed is the failure mode rule 9b exists to
-- prevent.
--
-- ── Why a jsonb map and not a timestamptz ────────────────────────────────
-- embed_origins is an ARRAY on a single domain row. A tenant with a Wix
-- careers page and a WordPress site has two origins against one domain, so a
-- scalar last_boot_at would be overwritten by whichever site booted last and
-- the other would read as dead forever. The map is keyed by origin, so each
-- entry stands on its own:
--
--   { "https://acme.com": "2026-08-26T10:04:11.221Z",
--     "https://careers.acme.com": "2026-08-25T18:40:02.007Z" }
--
-- Bounded by the number of origins a tenant declares, NOT by traffic — the
-- writer merges onto an existing key rather than appending. This is
-- deliberately not an append-only event log: it is presence telemetry for one
-- screen, it carries no decision weight, and nothing audits against it. A
-- boot that MATTERS (a candidate applying) writes vara_application and its
-- own audit rows on the paths that come with Phase 5.
--
-- ── Not PII ──────────────────────────────────────────────────────────────
-- Keys are the tenant's own site origins, self-reported by the widget and
-- already validated against embed_origins before any write. No candidate
-- identifier, IP or user agent lands here, so DPDP purge has nothing to do
-- with this column.
--
-- Idempotent and guarded: re-running is a no-op, and the column carries a
-- NOT NULL default so every existing row reads as "never booted" ({}), which
-- is the truthful state for a domain whose snippet was never pasted.
-- ============================================================================

alter table vani_tenant_domain
  add column if not exists boot_pings jsonb not null default '{}'::jsonb;

comment on column vani_tenant_domain.boot_pings is
  'Site-alive telemetry for the Install screen: {origin: last_boot_timestamptz}. '
  'Keyed by origin because embed_origins is an array on one domain row. Merged '
  'in place on every successful /vara/embed/boot, so it is bounded by origin '
  'count, not by traffic. Presence only — never an input to a decision.';
