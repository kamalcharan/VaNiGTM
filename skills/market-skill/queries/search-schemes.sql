-- KI-28: Full-text search across scheme names with fuzzy matching
-- Uses PostgreSQL to_tsvector + ts_rank for relevance scoring
-- Falls back to ILIKE for partial/fuzzy matches
-- Shared table — no tenant_id filter needed

SELECT
    s.scheme_code,
    s.scheme_name,
    s.amc,
    s.category,
    ln.nav,
    ln.nav_date,
    ts_rank(to_tsvector('english', s.scheme_name), plainto_tsquery('english', $query)) AS rank
FROM ki_schemes s
LEFT JOIN LATERAL (
    SELECT nav, nav_date
    FROM ki_nav_history nh
    WHERE nh.scheme_code = s.scheme_code
    ORDER BY nh.nav_date DESC
    LIMIT 1
) ln ON true
WHERE s.active = true
  AND (
    to_tsvector('english', s.scheme_name) @@ plainto_tsquery('english', $query)
    OR s.scheme_name ILIKE $query_like
    OR s.amc ILIKE $query_like
    OR s.category ILIKE $query_like
  )
ORDER BY rank DESC, s.scheme_name ASC
LIMIT $limit;
