/**
 * prospect-skill: get_prospects
 *
 * The imported company records, with the three things a user asks about them:
 * is the data any good (completeness / validity / freshness), is it a
 * duplicate (shares a domain or a normalised name with another record), and
 * how is it tagged (directly, or inherited from the delivery).
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const GET_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/get-prospects.sql'), 'utf-8',
);
const COUNT_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/count-prospects.sql'), 'utf-8',
);

interface GetProspectsParams {
  search?: string;
  /** 'prospect' | 'customer' — what the tenant declared at import. */
  relationship?: string;
  tag_id?: number;
  only_duplicates?: boolean;
  /** Minimum completeness, 0–1. */
  min_quality?: number;
  limit?: number;
  offset?: number;
}

export interface ProspectListItem {
  id: number;
  ref: string | null;
  name: string;
  relationship: string;
  domain_normalized: string | null;
  city: string | null;
  state_code: string | null;
  industry_raw: string | null;
  employees_band: string | null;
  completeness: string | null;
  validity: string | null;
  source_as_of: string | null;
  freshness: 'current' | 'recent' | 'ageing' | 'stale' | 'unknown';
  shares_domain: boolean;
  shares_name: boolean;
  load_label: string | null;
  tags: { id: number; label: string; inherited: boolean }[];
}

interface GetProspectsResult {
  prospects: ProspectListItem[];
  total: number;
  recipe: 'prospect-list';
}

export async function get_prospects(
  params: GetProspectsParams,
  ctx: SkillContext,
): Promise<GetProspectsResult> {
  const limit = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;

  const filters = {
    $tenant_id: ctx.tenant_id,
    $is_live: ctx.is_live,
    $relationship: params.relationship?.trim() || null,
    $search: params.search?.trim() || null,
    $tag_id: params.tag_id ?? null,
    $only_duplicates: params.only_duplicates ?? false,
    $min_quality: params.min_quality ?? null,
  };

  const [dataRes, countRes] = await Promise.all([
    ctx.db.query<ProspectListItem>(GET_SQL, { ...filters, $limit: limit, $offset: offset }),
    ctx.db.query<{ total: string }>(COUNT_SQL, filters),
  ]);

  return {
    prospects: dataRes.rows,
    total: Number(countRes.rows[0]?.total ?? 0),
    recipe: 'prospect-list',
  };
}
