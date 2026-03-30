/**
 * KI-27: get_clients — Returns client list with key metrics.
 * Supports filtering, search, sorting, and pagination.
 */

import { SkillContext } from '../../../shared/types';

interface ClientFilters {
  search?: string;
  tag?: string;
  min_aum?: number;
  max_aum?: number;
  risk_profile?: string;
  sort_by?: 'name' | 'aum' | 'last_interaction' | 'sip_count';
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

interface ClientRow {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  aum: number;
  sip_count: number;
  active_sips_total: number;
  goals_count: number;
  risk_profile: string | null;
  last_interaction_date: string | null;
  tags: string[];
}

interface ClientItem {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  aum: number;
  sip_count: number;
  active_sips_total: number;
  goals_count: number;
  risk_profile: string | null;
  last_interaction_date: string | null;
  tags: string[];
}

interface GetClientsResult {
  clients: ClientItem[];
  total: number;
  recipe: 'client-list';
}

export async function get_clients(
  params: { filters?: ClientFilters },
  ctx: SkillContext
): Promise<GetClientsResult> {
  const filters = params.filters || {};
  const queryParams: Record<string, unknown> = {
    $tenant_id: ctx.tenant_id,
  };

  // Build WHERE clauses
  const conditions: string[] = [
    'c.tenant_id = $tenant_id',
    'c.active = true',
  ];

  if (filters.search) {
    conditions.push("c.name ILIKE $search");
    queryParams.$search = `%${filters.search}%`;
  }

  if (filters.tag) {
    conditions.push("$tag = ANY(c.tags)");
    queryParams.$tag = filters.tag;
  }

  if (filters.risk_profile) {
    conditions.push("c.risk_overall = $risk_profile");
    queryParams.$risk_profile = filters.risk_profile;
  }

  // Build HAVING clauses for AUM-based filters
  const havingClauses: string[] = [];
  if (filters.min_aum !== undefined) {
    havingClauses.push("COALESCE(SUM(h.units * COALESCE(ln.nav, h.avg_nav)), 0) >= $min_aum");
    queryParams.$min_aum = filters.min_aum;
  }
  if (filters.max_aum !== undefined) {
    havingClauses.push("COALESCE(SUM(h.units * COALESCE(ln.nav, h.avg_nav)), 0) <= $max_aum");
    queryParams.$max_aum = filters.max_aum;
  }

  // Sort mapping
  const sortMap: Record<string, string> = {
    name: 'c.name',
    aum: 'aum',
    last_interaction: 'c.last_interaction_at',
    sip_count: 'sip_count',
  };
  const sortCol = sortMap[filters.sort_by || 'name'] || 'c.name';
  const sortOrder = filters.sort_order === 'desc' ? 'DESC' : 'ASC';

  const limit = filters.limit || 50;
  const offset = filters.offset || 0;

  queryParams.$limit = limit;
  queryParams.$offset = offset;

  const havingClause = havingClauses.length > 0
    ? `HAVING ${havingClauses.join(' AND ')}`
    : '';

  const query = `
    SELECT
      c.id,
      c.name,
      c.email,
      c.phone,
      c.risk_overall AS risk_profile,
      c.tags,
      c.last_interaction_at AS last_interaction_date,
      COALESCE(SUM(h.units * COALESCE(ln.nav, h.avg_nav)), 0) AS aum,
      COUNT(*) FILTER (WHERE h.is_sip = true) AS sip_count,
      COALESCE(SUM(h.sip_amount) FILTER (WHERE h.sip_status = 'active'), 0) AS active_sips_total,
      COALESCE(goals_agg.goals_count, 0) AS goals_count
    FROM ki_clients c
    LEFT JOIN ki_holdings h ON h.client_id = c.id AND h.tenant_id = $tenant_id AND h.units > 0
    LEFT JOIN LATERAL (
      SELECT nav FROM ki_nav_history nh
      WHERE nh.scheme_code = h.scheme_code
      ORDER BY nh.nav_date DESC LIMIT 1
    ) ln ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS goals_count
      FROM ki_goals g
      WHERE g.tenant_id = $tenant_id AND g.client_id = c.id AND g.status = 'active'
    ) goals_agg ON true
    WHERE ${conditions.join(' AND ')}
    GROUP BY c.id, c.name, c.email, c.phone, c.risk_overall, c.tags, c.last_interaction_at, goals_agg.goals_count
    ${havingClause}
    ORDER BY ${sortCol} ${sortOrder}
    LIMIT $limit OFFSET $offset
  `;

  // Count query for total
  const countQuery = `
    SELECT COUNT(*) AS total
    FROM ki_clients c
    WHERE ${conditions.join(' AND ')}
  `;

  const [dataResult, countResult] = await Promise.all([
    ctx.db.query<ClientRow>(query, queryParams),
    ctx.db.query<{ total: number }>(countQuery, queryParams),
  ]);

  const clients: ClientItem[] = dataResult.rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    aum: Number(r.aum),
    sip_count: Number(r.sip_count),
    active_sips_total: Number(r.active_sips_total),
    goals_count: Number(r.goals_count),
    risk_profile: r.risk_profile,
    last_interaction_date: r.last_interaction_date,
    tags: r.tags || [],
  }));

  return {
    clients,
    total: Number(countResult.rows[0]?.total || 0),
    recipe: 'client-list',
  };
}
