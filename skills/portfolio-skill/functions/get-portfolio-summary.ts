/**
 * KI-25: get_portfolio_summary — Aggregated portfolio overview.
 * Total invested, current value, returns, top/bottom performers, SIP info.
 */

import { SkillContext } from '../../../shared/types';
import { calc_xirr } from './calc-xirr';

interface HoldingRow {
  scheme_code: string;
  scheme_name: string;
  units: number;
  current_nav: number;
  total_invested: number;
  gain_pct: number;
  is_sip: boolean;
  sip_amount: number | null;
  sip_status: string | null;
}

interface PerformerItem {
  scheme_name: string;
  gain_pct: number;
}

interface GetPortfolioSummaryResult {
  total_invested: number;
  current_value: number;
  overall_return_pct: number;
  xirr_pct: number;
  top_performers: PerformerItem[];
  bottom_performers: PerformerItem[];
  sip_count: number;
  sip_total_monthly: number;
  recipe: 'portfolio-view';
}

const SUMMARY_QUERY = `
  SELECT
    h.scheme_code,
    s.scheme_name,
    h.units,
    COALESCE(ln.nav, h.avg_nav) AS current_nav,
    h.total_invested,
    CASE
      WHEN h.total_invested > 0
      THEN ROUND(((h.units * COALESCE(ln.nav, h.avg_nav) - h.total_invested) / h.total_invested) * 100, 2)
      ELSE 0
    END AS gain_pct,
    h.is_sip,
    h.sip_amount,
    h.sip_status
  FROM holdings h
  JOIN schemes s ON s.scheme_code = h.scheme_code
  LEFT JOIN LATERAL (
    SELECT nav FROM nav_history nh
    WHERE nh.scheme_code = h.scheme_code
    ORDER BY nh.nav_date DESC LIMIT 1
  ) ln ON true
  WHERE h.tenant_id = $tenant_id
    AND h.client_id = $client_id
    AND h.units > 0
  ORDER BY gain_pct DESC
`;

export async function get_portfolio_summary(
  params: { client_id: number },
  ctx: SkillContext
): Promise<GetPortfolioSummaryResult> {
  const { client_id } = params;

  // Fetch holdings and XIRR in parallel
  const [holdingsResult, xirrResult] = await Promise.all([
    ctx.db.query<HoldingRow>(SUMMARY_QUERY, {
      $tenant_id: ctx.tenant_id,
      $client_id: client_id,
    }),
    calc_xirr({ client_id }, ctx),
  ]);

  const rows = holdingsResult.rows;

  let total_invested = 0;
  let current_value = 0;
  let sip_count = 0;
  let sip_total_monthly = 0;

  const performers: PerformerItem[] = [];

  for (const r of rows) {
    const units = Number(r.units);
    const nav = Number(r.current_nav);
    const invested = Number(r.total_invested);
    const value = units * nav;

    total_invested += invested;
    current_value += value;

    performers.push({
      scheme_name: r.scheme_name,
      gain_pct: Number(r.gain_pct),
    });

    if (r.is_sip && r.sip_status === 'active') {
      sip_count++;
      sip_total_monthly += Number(r.sip_amount || 0);
    }
  }

  const overall_return_pct =
    total_invested > 0
      ? Math.round(((current_value - total_invested) / total_invested) * 10000) / 100
      : 0;

  // Top 3 and bottom 3 performers (already sorted DESC by gain_pct)
  const top_performers = performers.slice(0, 3);
  const bottom_performers = performers.length > 3
    ? performers.slice(-3).reverse()
    : [];

  return {
    total_invested,
    current_value,
    overall_return_pct,
    xirr_pct: xirrResult.xirr_pct,
    top_performers,
    bottom_performers,
    sip_count,
    sip_total_monthly,
    recipe: 'portfolio-view',
  };
}
