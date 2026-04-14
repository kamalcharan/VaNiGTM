/**
 * portfolio-skill: get_family_portfolio
 * Returns aggregated holdings for all active members of a family,
 * consolidated by scheme with per-member attribution.
 */

import { SkillContext } from '../../../shared/types';
import * as fs from 'fs';
import * as path from 'path';

interface MemberHolding {
  client_id: number;
  name: string;
  prefix: string;
  units: number;
  invested: number;
}

interface FamilyHoldingRow {
  scheme_code: string;
  scheme_name: string;
  category: string;
  amc: string;
  units: string;
  total_invested: string;
  avg_nav: string;
  current_nav: string | null;
  nav_date: string | null;
  current_value: string;
  gain_loss: string;
  gain_pct: string;
  members_holding: MemberHolding[];
}

interface FamilyHoldingItem {
  scheme_code: string;
  scheme_name: string;
  category: string;
  amc: string;
  units: number;
  avg_nav: number;
  nav: number;
  nav_date: string | null;
  value: number;
  invested: number;
  gain_loss: number;
  gain_pct: number;
  members: MemberHolding[];
}

interface GetFamilyPortfolioResult {
  family_id: string;
  holdings: FamilyHoldingItem[];
  summary: {
    total_value: number;
    total_invested: number;
    overall_gain_pct: number;
    scheme_count: number;
    member_count: number;
  };
  recipe: 'portfolio-view';
}

const QUERY = fs.readFileSync(
  path.join(__dirname, '../queries/family-holdings.sql'),
  'utf-8'
);

export async function get_family_portfolio(
  params: { family_id: string },
  ctx: SkillContext
): Promise<GetFamilyPortfolioResult> {
  const { family_id } = params;

  const result = await ctx.db.query<FamilyHoldingRow>(QUERY, {
    $tenant_id: ctx.tenant_id,
    $is_live:   ctx.is_live,
    $family_id: family_id,
  });

  const holdings: FamilyHoldingItem[] = result.rows.map((r) => ({
    scheme_code: r.scheme_code,
    scheme_name: r.scheme_name,
    category:    r.category,
    amc:         r.amc,
    units:       Number(r.units),
    avg_nav:     Number(r.avg_nav),
    nav:         r.current_nav != null ? Number(r.current_nav) : 0,
    nav_date:    r.nav_date ?? null,
    value:       Number(r.current_value),
    invested:    Number(r.total_invested),
    gain_loss:   Number(r.gain_loss),
    gain_pct:    Number(r.gain_pct),
    members:     Array.isArray(r.members_holding) ? r.members_holding : [],
  }));

  const total_value    = holdings.reduce((s, h) => s + h.value, 0);
  const total_invested = holdings.reduce((s, h) => s + h.invested, 0);
  const overall_gain_pct =
    total_invested > 0
      ? Math.round(((total_value - total_invested) / total_invested) * 10000) / 100
      : 0;

  // Count distinct members across all holdings
  const memberIds = new Set<number>();
  holdings.forEach(h => h.members.forEach(m => memberIds.add(m.client_id)));

  return {
    family_id,
    holdings,
    summary: {
      total_value,
      total_invested,
      overall_gain_pct,
      scheme_count: holdings.length,
      member_count: memberIds.size,
    },
    recipe: 'portfolio-view',
  };
}
