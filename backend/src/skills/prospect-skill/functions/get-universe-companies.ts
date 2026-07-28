/**
 * prospect-skill: get_universe_companies
 *
 * The COMMON POOL — company records delivered by directories and providers,
 * shared across tenants. The admin counterpart to get_prospects.
 *
 * ── ADMIN ONLY, CHECKED AGAINST THE DATABASE ──────────────────────────
 *
 * gt_universe_company_sources is cross-tenant infrastructure with no
 * tenant_id, so nothing in the query itself constrains who sees it. The gate
 * is ctx.is_admin, resolved once per request from the JWT by the single
 * auth resolver — the same flag the ETL routes use.
 *
 * ── THESE ARE SOURCE ROWS, NOT MERGED COMPANIES ───────────────────────
 *
 * Every source keeps its own immutable row; the golden record
 * (gt_universe_companies) is DERIVED from them. That merge is the Phase B
 * engine and is not built, so `resolved` is false for everything today. The
 * count is reported rather than hidden — showing a pool as "merged" when
 * nothing has merged it would be exactly the impressive-looking emptiness
 * rule 12 exists to prevent.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const LIST_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/get-universe-companies.sql'), 'utf-8',
);
const STATS_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/universe-stats.sql'), 'utf-8',
);

interface GetUniverseParams {
  search?: string;
  load_id?: number;
  tag_id?: number;
  only_duplicates?: boolean;
  limit?: number;
  offset?: number;
}

export interface UniverseCompany {
  id: number;
  name: string;
  source_record_id: string;
  domain_normalized: string | null;
  city: string | null;
  state_code: string | null;
  industry_raw: string | null;
  employees_band: string | null;
  completeness: string | null;
  validity: string | null;
  source_as_of: string | null;
  freshness: 'current' | 'recent' | 'ageing' | 'stale' | 'unknown';
  resolved: boolean;
  shares_block: boolean;
  load_label: string | null;
  source_code: string | null;
  /** The complete original row from the file. */
  raw: Record<string, unknown>;
  tags: { id: number; label: string; inherited: boolean }[];
}

interface UniverseStats {
  total: number;
  loads: number;
  resolved: number;
  avg_completeness: string | null;
  avg_validity: string | null;
  with_rejected_fields: number;
  with_domain: number;
  undated: number;
  sharing_block: number;
}

interface GetUniverseResult {
  companies: UniverseCompany[];
  total: number;
  stats: UniverseStats;
  recipe: 'universe-list';
}

export async function get_universe_companies(
  params: GetUniverseParams,
  ctx: SkillContext,
): Promise<GetUniverseResult> {
  // One flag, resolved once for the request (auth/auth-context.ts). This used
  // to re-query vn_tenants — a second answer to a question already answered,
  // which is exactly how is_live drifted apart.
  if (!ctx.is_admin) {
    throw new Error('The common pool is available to admin tenants only.');
  }

  const limit = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;

  const [listRes, statsRes] = await Promise.all([
    ctx.db.query<UniverseCompany>(LIST_SQL, {
      $search: params.search?.trim() || null,
      $load_id: params.load_id ?? null,
      $tag_id: params.tag_id ?? null,
      $only_duplicates: params.only_duplicates ?? false,
      $limit: limit,
      $offset: offset,
    }),
    ctx.db.query<UniverseStats>(STATS_SQL, {}),
  ]);

  const stats = statsRes.rows[0] ?? {
    total: 0, loads: 0, resolved: 0, avg_completeness: null, avg_validity: null,
    with_rejected_fields: 0, with_domain: 0, undated: 0, sharing_block: 0,
  };

  return {
    companies: listRes.rows,
    // The pool is unscoped, so the filtered total is the stats total unless a
    // filter narrowed it — recomputed here rather than issuing a third query.
    total: params.search || params.load_id || params.tag_id || params.only_duplicates
      ? listRes.rows.length + offset
      : stats.total,
    stats,
    recipe: 'universe-list',
  };
}
