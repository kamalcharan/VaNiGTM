/**
 * KI-28: get_nav_history — Returns historical NAV data for charting.
 * Calculates period_return_pct from first to last NAV in range.
 */

import { SkillContext } from '../../../shared/types';
import * as fs from 'fs';
import * as path from 'path';

interface NavHistoryRow {
  date: string;
  nav: number;
}

interface SchemeRow {
  scheme_name: string;
}

interface GetNavHistoryResult {
  scheme_code: string;
  scheme_name: string;
  data: Array<{ date: string; nav: number }>;
  period_return_pct: number;
  recipe: 'line-chart';
}

const HISTORY_QUERY = fs.readFileSync(
  path.join(__dirname, '../queries/nav-history.sql'),
  'utf-8'
);

const SCHEME_NAME_QUERY = `
  SELECT scheme_name FROM ki_schemes WHERE scheme_code = $scheme_code
`;

export async function get_nav_history(
  params: { scheme_code: string; from_date: string; to_date: string },
  ctx: SkillContext
): Promise<GetNavHistoryResult> {
  const { scheme_code, from_date, to_date } = params;

  const [historyResult, schemeResult] = await Promise.all([
    ctx.db.query<NavHistoryRow>(HISTORY_QUERY, {
      $scheme_code: scheme_code,
      $from_date: from_date,
      $to_date: to_date,
    }),
    ctx.db.query<SchemeRow>(SCHEME_NAME_QUERY, {
      $scheme_code: scheme_code,
    }),
  ]);

  const allData = historyResult.rows.map((r) => ({
    date: r.date,
    nav: Number(r.nav),
  }));

  // Downsample to max 300 points for chart performance
  // Keeps first, last, and evenly spaced points
  const MAX_POINTS = 300;
  let data = allData;
  if (allData.length > MAX_POINTS) {
    const step = (allData.length - 1) / (MAX_POINTS - 1);
    data = [];
    for (let i = 0; i < MAX_POINTS; i++) {
      data.push(allData[Math.round(i * step)]);
    }
  }

  // Calculate period return from first to last NAV (using full data, not downsampled)
  let period_return_pct = 0;
  if (allData.length >= 2) {
    const firstNav = allData[0].nav;
    const lastNav = allData[allData.length - 1].nav;
    if (firstNav > 0) {
      period_return_pct =
        Math.round(((lastNav - firstNav) / firstNav) * 10000) / 100;
    }
  }

  const scheme_name = schemeResult.rows[0]?.scheme_name || '';

  return {
    scheme_code,
    scheme_name,
    data,
    period_return_pct,
    recipe: 'line-chart',
  };
}
