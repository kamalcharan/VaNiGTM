-- ============================================================
-- Migration: 204_gt_record_view.sql
-- Purpose:   ONE definition of an imported record, for every surface.
--
-- User ruling, said more than once before it was acted on: both are the same
-- shape, they should share the same code and infrastructure.
--
-- gt_prospects and gt_universe_company_sources share 25 of their columns. The
-- differences are real — a tenant's working record needs tenant_id, is_live,
-- ref, status and score; an immutable source row needs source_record_id,
-- blocking_key and field_quality — and the two have OPPOSITE dedup rules, so
-- they cannot be one table:
--
--   the pool KEEPS one row per source per record (that is what makes the
--   field-level merge re-runnable)
--   gt_prospects must have exactly ONE row per company per tenant
--
-- But everything DERIVED from those columns was written twice: the freshness
-- banding, the duplicate flag, the tag join, the quality pair. Two copies is
-- why the pool query was missing `raw` after the tenant side already had it,
-- and it is the same habit that let is_live drift and hide landed records.
--
-- So the tables stay separate and the derived logic lives here, once.
--
-- ── ISOLATION ─────────────────────────────────────────────────────────
--
-- This view spans a tenant-scoped table and a cross-tenant one, so it carries
-- `scope`, `tenant_id` and `is_live` and callers MUST filter on them. Pool
-- rows have a NULL tenant_id and are only ever served to an admin — enforced
-- in the skill, and covered by a wrong-tenant test.
-- ============================================================

DROP VIEW IF EXISTS gt_record_view;

CREATE VIEW gt_record_view AS

-- ── The tenant's own companies ────────────────────────────────────────
SELECT
    'mine'::text                AS scope,
    p.id,
    p.tenant_id,
    p.is_live,
    p.ref,                                        -- PROS-0001
    p.name,
    p.domain_normalized,
    p.website, p.email, p.phone, p.address_line,
    p.city, p.state_code, p.pin, p.country,
    p.industry_raw, p.employees_band, p.revenue_band,
    p.linkedin_url, p.year_founded, p.description,
    p.completeness, p.validity, p.source_as_of,
    p.raw,
    p.load_id,
    p.relationship,                               -- prospect | customer
    NULL::boolean               AS resolved,      -- pool-only concept
    -- Shares an identifier with another record IN THE SAME SCOPE.
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
    p.created_at                AS recorded_at
FROM gt_prospects p
WHERE p.is_active = true

UNION ALL

-- ── The common pool ───────────────────────────────────────────────────
SELECT
    'pool'::text                AS scope,
    u.id,
    NULL::uuid                  AS tenant_id,     -- cross-tenant by design
    NULL::boolean               AS is_live,
    u.source_record_id          AS ref,           -- the source's own id
    u.name,
    u.domain_normalized,
    u.website, u.email, u.phone, u.address_line,
    u.city, u.state_code, u.pin, u.country,
    u.industry_raw, u.employees_band, u.revenue_band,
    u.linkedin_url, u.year_founded, u.description,
    u.completeness, u.validity, u.source_as_of,
    u.raw,
    u.load_id,
    NULL::varchar(16)           AS relationship,  -- a pool row is nobody's customer
    u.company_id IS NOT NULL    AS resolved,
    (u.blocking_key IS NOT NULL AND EXISTS (
        SELECT 1 FROM gt_universe_company_sources d
        WHERE d.id <> u.id AND d.blocking_key = u.blocking_key))
                                AS duplicate,
    u.ingested_at               AS recorded_at
FROM gt_universe_company_sources u;

COMMENT ON VIEW gt_record_view IS 'One shape for every imported record. `scope` = mine (gt_prospects, tenant-scoped) | pool (gt_universe_company_sources, cross-tenant, admin only). Callers MUST filter tenant_id and is_live when scope = mine. Derived logic — freshness, duplicate flags — is defined here once instead of in each query.';
