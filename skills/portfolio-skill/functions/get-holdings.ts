/**
 * KI-25: get_holdings — Returns current holdings for a client
 * with NAV, value, and gain/loss.
 */

import { SkillContext } from '../../../shared/types';
import * as fs from 'fs';
import * as path from 'path';

interface HoldingRow {
  scheme_code: string;
  scheme_name: string;
  category: string;
  amc: string;
  units: number;
  current_nav: number;
  current_value: number;
  total_invested: number;
  gain_loss: number;
  gain_pct: number;
}

interface HoldingItem {
  scheme_name: string;
  scheme_code: string;
  category: string;
  amc: string;
  units: number;
  nav: number;
  value: number;
  invested: number;
  gain_loss: number;
  gain_pct: number;
}

interface GetHoldingsResult {
  holdings: HoldingItem[];
  summary: {
    total_value: number;
    total_invested: number;
    overall_gain_pct: number;
    scheme_count: number;
  };
  recipe: 'portfolio-view';
}

const QUERY = fs.readFileSync(
  path.join(__dirname, '../queries/holdings-by-client.sql'),
  'utf-8'
);

export async function get_holdings(
  params: { client_id: number },
  ctx: SkillContext
): Promise<GetHoldingsResult> {
  const { client_id } = params;

  const result = await ctx.db.query<HoldingRow>(QUERY, {
    $tenant_id: ctx.tenant_id,
    $client_id: client_id,
  });

  const holdings: HoldingItem[] = result.rows.map((r) => ({
    scheme_name: r.scheme_name,
    scheme_code: r.scheme_code,
    category: r.category,
    amc: r.amc,
    units: Number(r.units),
    nav: Number(r.current_nav),
    value: Number(r.current_value),
    invested: Number(r.total_invested),
    gain_loss: Number(r.gain_loss),
    gain_pct: Number(r.gain_pct),
  }));

  const total_value = holdings.reduce((sum, h) => sum + h.value, 0);
  const total_invested = holdings.reduce((sum, h) => sum + h.invested, 0);
  const overall_gain_pct =
    total_invested > 0
      ? Math.round(((total_value - total_invested) / total_invested) * 10000) / 100
      : 0;

  return {
    holdings,
    summary: {
      total_value,
      total_invested,
      overall_gain_pct,
      scheme_count: holdings.length,
    },
    recipe: 'portfolio-view',
  };
}
