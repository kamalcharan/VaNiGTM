/**
 * KI-28: search_schemes — Fuzzy search across scheme names, AMCs, categories.
 * Uses PostgreSQL full-text search with ILIKE fallback.
 */

import { SkillContext } from '../../../shared/types';
import * as fs from 'fs';
import * as path from 'path';

interface SearchRow {
  scheme_code: string;
  scheme_name: string;
  amc: string;
  category: string;
  nav: number | null;
  nav_date: string | null;
  rank: number;
}

interface SearchResultItem {
  scheme_code: string;
  scheme_name: string;
  amc: string;
  category: string;
  nav: number | null;
  nav_date: string | null;
}

interface SearchSchemesResult {
  results: SearchResultItem[];
  total_matches: number;
  recipe: 'data-table';
}

const QUERY = fs.readFileSync(
  path.join(__dirname, '../queries/search-schemes.sql'),
  'utf-8'
);

const COUNT_QUERY = `
  SELECT COUNT(*) AS total
  FROM schemes s
  WHERE s.active = true
    AND (
      to_tsvector('english', s.scheme_name) @@ plainto_tsquery('english', $query)
      OR s.scheme_name ILIKE $query_like
      OR s.amc ILIKE $query_like
      OR s.category ILIKE $query_like
    )
`;

export async function search_schemes(
  params: { query: string; limit?: number },
  ctx: SkillContext
): Promise<SearchSchemesResult> {
  const { query, limit = 20 } = params;

  const queryParams = {
    $query: query,
    $query_like: `%${query}%`,
    $limit: limit,
  };

  const [dataResult, countResult] = await Promise.all([
    ctx.db.query<SearchRow>(QUERY, queryParams),
    ctx.db.query<{ total: number }>(COUNT_QUERY, queryParams),
  ]);

  const results: SearchResultItem[] = dataResult.rows.map((r) => ({
    scheme_code: r.scheme_code,
    scheme_name: r.scheme_name,
    amc: r.amc,
    category: r.category,
    nav: r.nav !== null ? Number(r.nav) : null,
    nav_date: r.nav_date,
  }));

  return {
    results,
    total_matches: Number(countResult.rows[0]?.total || 0),
    recipe: 'data-table',
  };
}
