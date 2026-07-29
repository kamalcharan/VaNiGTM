-- ============================================================
-- Migration: 218_prospect_industry_sub.sql
-- Purpose:   Store the SUB-cluster, not just the cluster — and surface both
--            on the record view so /prospects can filter on them.
--
-- Plan: documents/design-notes-research.md §7, NEXT item 8.
--
-- ── WHY THE CLUSTER ALONE IS NOT ENOUGH ───────────────────────────────
--
-- `industry_canonical` says "manufacturing". FTCCI's industry_raw is a product
-- description, not a category, so that one bucket holds bulk-drug makers and
-- plastic-chair makers alike. One message cannot address both — a cohort has
-- to be narrower than the cluster or every campaign built on it is generic by
-- construction.
--
-- industry-normalizer.ts has ALREADY been computing the sub-cluster (pharma,
-- food, chemicals, …) since migration 206. It was returned by
-- canonicalIndustry(), used to print the segment table in the cohort report,
-- and then thrown away — there was no column. Every segment question since
-- has been answered by re-running a CLI script, which is exactly the thing
-- that kept the user out of their own product.
--
-- ── THE CAVEAT, WRITTEN DOWN ──────────────────────────────────────────
--
-- These rules are ours, derived from FTCCI data. Changing a rule silently
-- changes who is in a segment. Nothing here can prevent that; what it can do
-- is keep the raw text next to the derived value so a reclassification is
-- always re-runnable and always arguable (design-notes-research.md §8).
-- ============================================================

DO $$ BEGIN
    IF to_regclass('public.gt_prospects') IS NULL THEN
        RAISE EXCEPTION 'Missing prerequisite table gt_prospects.';
    END IF;
END $$;

ALTER TABLE gt_prospects
    ADD COLUMN IF NOT EXISTS industry_sub VARCHAR(60);

COMMENT ON COLUMN gt_prospects.industry_sub IS
    'Narrower segment inside industry_canonical (pharma, food, chemicals…), derived by etl/industry-normalizer.ts. NULL means the row is in the cluster but no sub-rule claimed it — a real answer, not a failure. Backfill: npx tsx src/cohort.ts --tenant=<uuid> --apply';

-- Partial: most rows have no cluster at all, and an index over those is dead
-- weight on every write.
CREATE INDEX IF NOT EXISTS idx_gt_prospects_industry_sub
    ON gt_prospects(tenant_id, is_live, industry_sub)
    WHERE industry_sub IS NOT NULL;

-- ── The record view ───────────────────────────────────────────────────
--
-- CREATE OR REPLACE VIEW can only APPEND columns, and both arms of the UNION
-- must gain them in the same position — hence the full restatement rather
-- than an ALTER. This is migration 205's definition with two columns added at
-- the end of each arm.
--
-- The pool arm gets NULLs, deliberately. industry_canonical and industry_sub
-- are a TENANT's classification of their own records (CLAUDE.md rule 13
-- territory: what a tenant decided, not what was delivered). A pool row is
-- raw source text and is classified by whoever pulls it into their own list.
DROP VIEW IF EXISTS gt_record_view;

CREATE VIEW gt_record_view AS

SELECT
    'mine'::text                AS scope,
    p.id,
    p.tenant_id,
    p.is_live,
    p.ref,
    p.name,
    p.domain_normalized,
    p.website, p.email, p.phone, p.address_line,
    p.city, p.state_code, p.pin, p.country,
    p.industry_raw, p.employees_band, p.revenue_band,
    p.linkedin_url, p.year_founded, p.description,
    p.completeness, p.validity, p.source_as_of,
    p.raw,
    p.load_id,
    p.relationship,
    p.is_active,
    NULL::boolean               AS resolved,
    (p.domain_normalized IS NOT NULL AND EXISTS (
        SELECT 1 FROM gt_prospects d
        WHERE d.tenant_id = p.tenant_id AND d.is_live = p.is_live
          AND d.is_active = true AND d.id <> p.id
          AND d.domain_normalized = p.domain_normalized))
    OR EXISTS (
        SELECT 1 FROM gt_prospects d
        WHERE d.tenant_id = p.tenant_id AND d.is_live = p.is_live
          AND d.is_active = true AND d.id <> p.id
          AND d.name_key = p.name_key AND p.name_key <> '')
                                AS duplicate,
    p.created_at                AS recorded_at,
    p.industry_canonical,
    p.industry_sub
FROM gt_prospects p

UNION ALL

SELECT
    'pool'::text                AS scope,
    u.id,
    NULL::uuid                  AS tenant_id,
    NULL::boolean               AS is_live,
    u.source_record_id          AS ref,
    u.name,
    u.domain_normalized,
    u.website, u.email, u.phone, u.address_line,
    u.city, u.state_code, u.pin, u.country,
    u.industry_raw, u.employees_band, u.revenue_band,
    u.linkedin_url, u.year_founded, u.description,
    u.completeness, u.validity, u.source_as_of,
    u.raw,
    u.load_id,
    NULL::varchar(16)           AS relationship,
    true                        AS is_active,
    u.company_id IS NOT NULL    AS resolved,
    (u.blocking_key IS NOT NULL AND EXISTS (
        SELECT 1 FROM gt_universe_company_sources d
        WHERE d.id <> u.id AND d.blocking_key = u.blocking_key))
                                AS duplicate,
    u.ingested_at               AS recorded_at,
    -- A pool row carries no tenant's classification. Whoever pulls it into
    -- their own list classifies it there.
    NULL::varchar(60)           AS industry_canonical,
    NULL::varchar(60)           AS industry_sub
FROM gt_universe_company_sources u;

COMMENT ON VIEW gt_record_view IS 'One shape for every imported record. is_active is a COLUMN, not a filter — the caller decides whether to show deactivated rows. `scope` = mine (gt_prospects, tenant-scoped) | pool (gt_universe_company_sources, cross-tenant, admin only). Callers MUST filter tenant_id and is_live when scope = mine. industry_canonical/industry_sub are a tenant''s own classification and are NULL for pool rows.';
