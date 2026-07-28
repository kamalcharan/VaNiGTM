-- prospect_stats: the health of the imported set, in the terms the design
-- note scores it — fill rate and validity SEPARATELY, freshness banded, and
-- duplicates counted rather than merged.
--
-- Named params: $tenant_id, $is_live

WITH base AS (
    SELECT id, relationship, completeness, validity, source_as_of,
           domain_normalized, name_key
    FROM   gt_prospects
    WHERE  tenant_id = $tenant_id AND is_live = $is_live AND is_active = true
),
dupe_domain AS (
    SELECT domain_normalized, COUNT(*) AS n
    FROM   base WHERE domain_normalized IS NOT NULL
    GROUP  BY domain_normalized HAVING COUNT(*) > 1
),
dupe_name AS (
    SELECT name_key, COUNT(*) AS n
    FROM   base WHERE name_key <> ''
    GROUP  BY name_key HAVING COUNT(*) > 1
)
SELECT
    COUNT(*)::int                                                         AS total,
    COUNT(*) FILTER (WHERE relationship = 'customer')::int                AS customers,
    COUNT(*) FILTER (WHERE relationship = 'prospect')::int                AS prospects,

    -- Fill rate is NOT quality. Reported beside validity, never blended into
    -- one number, because the provider CSV read 100% populated on revenue
    -- while 60 of 119 values were the literal string 'undefined+'.
    ROUND(AVG(completeness)::numeric, 3)                                  AS avg_completeness,
    ROUND(AVG(validity)::numeric, 3)                                      AS avg_validity,
    COUNT(*) FILTER (WHERE COALESCE(validity, 1) < 1)::int                AS with_rejected_fields,

    COUNT(*) FILTER (WHERE domain_normalized IS NOT NULL)::int            AS with_domain,
    COUNT(*) FILTER (WHERE source_as_of IS NULL)::int                     AS undated,
    COUNT(*) FILTER (WHERE source_as_of > (CURRENT_DATE - INTERVAL '18 months'))::int AS fresh,
    COUNT(*) FILTER (WHERE source_as_of <= (CURRENT_DATE - INTERVAL '36 months'))::int AS stale,

    -- Records sharing an identifier with another record. Shown, not merged.
    (SELECT COALESCE(SUM(n), 0)::int FROM dupe_domain)                    AS sharing_domain,
    (SELECT COALESCE(SUM(n), 0)::int FROM dupe_name)                      AS sharing_name
FROM base;
