/**
 * KI-28: search_schemes — Fuzzy search across scheme names, AMCs, categories.
 * Uses PostgreSQL full-text search with ILIKE fallback.
 * Includes NAV data status (records count, date range, latest NAV).
 * Supports pagination (page + limit).
 */

import { SkillContext } from '../../../shared/types';
import * as fs from 'fs';
import * as path from 'path';

interface SearchRow {
  scheme_code: string;
  scheme_name: string;
  amc: string;
  category: string;
  scheme_type: string;
  active: boolean;
  closure_date: string | null;
  launch_date: string | null;
  nav: number | null;
  nav_date: string | null;
  nav_records: number;
  earliest_nav_date: string | null;
  latest_nav_date: string | null;
  metrics_calculated: boolean;
  rank: number;
}

interface SearchResultItem {
  scheme_code: string;
  scheme_name: string;
  amc: string;
  category: string;
  scheme_type: string;
  active: boolean;
  closure_date: string | null;
  launch_date: string | null;
  nav: number | null;
  nav_date: string | null;
  nav_records: number;
  earliest_nav_date: string | null;
  latest_nav_date: string | null;
  metrics_calculated: boolean;
}

interface SearchSchemesResult {
  results: SearchResultItem[];
  total_matches: number;
  page: number;
  limit: number;
  total_pages: number;
  recipe: 'data-table';
}

const SEARCH_QUERY = `
SELECT
    s.scheme_code,
    s.scheme_name,
    s.amc,
    s.category,
    s.scheme_type,
    s.active,
    s.closure_date::text,
    s.launch_date::text,
    ln.nav,
    ln.nav_date::text,
    COALESCE(ns.nav_records, 0)::integer AS nav_records,
    ns.earliest_nav_date::text,
    ns.latest_nav_date::text,
    COALESCE(ns.has_metrics, false) AS metrics_calculated,
    ts_rank(to_tsvector('english', s.scheme_name), plainto_tsquery('english', $query)) AS rank
FROM ki_schemes s
LEFT JOIN LATERAL (
    SELECT nav, nav_date
    FROM ki_nav_history nh
    WHERE nh.scheme_code = s.scheme_code
    ORDER BY nh.nav_date DESC
    LIMIT 1
) ln ON true
LEFT JOIN LATERAL (
    SELECT
        COUNT(*)::integer AS nav_records,
        MIN(nav_date) AS earliest_nav_date,
        MAX(nav_date) AS latest_nav_date,
        (COUNT(metrics_calculated_at) > 0) AS has_metrics
    FROM ki_nav_history nh
    WHERE nh.scheme_code = s.scheme_code
) ns ON true
WHERE (
    to_tsvector('english', s.scheme_name) @@ plainto_tsquery('english', $query)
    OR s.scheme_name ILIKE $query_like
    OR s.amc ILIKE $query_like
    OR s.category ILIKE $query_like
    OR s.scheme_code = $query
)
ORDER BY rank DESC, s.scheme_name ASC
LIMIT $limit OFFSET $offset
`;

const COUNT_QUERY = `
SELECT COUNT(*) AS total
FROM ki_schemes s
WHERE (
    to_tsvector('english', s.scheme_name) @@ plainto_tsquery('english', $query)
    OR s.scheme_name ILIKE $query_like
    OR s.amc ILIKE $query_like
    OR s.category ILIKE $query_like
    OR s.scheme_code = $query
)
`;

export async function search_schemes(
  params: { query: string; limit?: number; page?: number },
  ctx: SkillContext
): Promise<SearchSchemesResult> {
  const { query, limit = 50, page = 1 } = params;
  const offset = (page - 1) * limit;

  const queryParams = {
    $query: query,
    $query_like: `%${query}%`,
    $limit: limit,
    $offset: offset,
  };

  const [dataResult, countResult] = await Promise.all([
    ctx.db.query<SearchRow>(SEARCH_QUERY, queryParams),
    ctx.db.query<{ total: number }>(COUNT_QUERY, queryParams),
  ]);

  const total = Number(countResult.rows[0]?.total || 0);

  const results: SearchResultItem[] = dataResult.rows.map((r) => ({
    scheme_code: r.scheme_code,
    scheme_name: r.scheme_name,
    amc: r.amc,
    category: r.category,
    scheme_type: r.scheme_type,
    active: r.active,
    closure_date: r.closure_date,
    launch_date: r.launch_date,
    nav: r.nav !== null ? Number(r.nav) : null,
    nav_date: r.nav_date,
    nav_records: Number(r.nav_records || 0),
    earliest_nav_date: r.earliest_nav_date,
    latest_nav_date: r.latest_nav_date,
    metrics_calculated: r.metrics_calculated || false,
  }));

  return {
    results,
    total_matches: total,
    page,
    limit,
    total_pages: Math.ceil(total / limit),
    recipe: 'data-table',
  };
}
