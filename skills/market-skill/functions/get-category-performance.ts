/**
 * KI-28: get_category_performance — Category-level performance for benchmarking.
 * Aggregates by category, ranks top 5 / bottom 5 by period return.
 */

import { SkillContext } from '../../../shared/types';
import * as fs from 'fs';
import * as path from 'path';

interface CategorySchemeRow {
  scheme_code: string;
  scheme_name: string;
  nav_current: number | null;
  nav_period_start: number | null;
}

interface PerformerItem {
  scheme_name: string;
  return_pct: number;
}

interface GetCategoryPerformanceResult {
  category: string;
  period: string;
  avg_return: number;
  top_5: PerformerItem[];
  bottom_5: PerformerItem[];
  total_schemes: number;
  recipe: 'data-table';
}

const QUERY = fs.readFileSync(
  path.join(__dirname, '../queries/category-schemes.sql'),
  'utf-8'
);

/** Convert period string to a Date representing the start of that period */
function periodToStartDate(period: string): string {
  const now = new Date();
  switch (period) {
    case '1m':
      now.setMonth(now.getMonth() - 1);
      break;
    case '3m':
      now.setMonth(now.getMonth() - 3);
      break;
    case '6m':
      now.setMonth(now.getMonth() - 6);
      break;
    case '1y':
      now.setFullYear(now.getFullYear() - 1);
      break;
    case '3y':
      now.setFullYear(now.getFullYear() - 3);
      break;
    case '5y':
      now.setFullYear(now.getFullYear() - 5);
      break;
    default:
      now.setFullYear(now.getFullYear() - 1);
  }
  return now.toISOString().slice(0, 10);
}

export async function get_category_performance(
  params: { category: string; period?: string },
  ctx: SkillContext
): Promise<GetCategoryPerformanceResult> {
  const { category, period = '1y' } = params;
  const periodStartDate = periodToStartDate(period);

  const result = await ctx.db.query<CategorySchemeRow>(QUERY, {
    $category: category,
    $period_start_date: periodStartDate,
  });

  // Calculate return for each scheme that has both NAV points
  const schemeReturns: Array<{ scheme_name: string; return_pct: number }> = [];

  for (const r of result.rows) {
    const current = r.nav_current !== null ? Number(r.nav_current) : null;
    const start = r.nav_period_start !== null ? Number(r.nav_period_start) : null;

    if (current !== null && start !== null && start > 0) {
      const return_pct =
        Math.round(((current - start) / start) * 10000) / 100;
      schemeReturns.push({ scheme_name: r.scheme_name, return_pct });
    }
  }

  // Sort by return descending
  schemeReturns.sort((a, b) => b.return_pct - a.return_pct);

  const avg_return =
    schemeReturns.length > 0
      ? Math.round(
          (schemeReturns.reduce((s, r) => s + r.return_pct, 0) /
            schemeReturns.length) *
            100
        ) / 100
      : 0;

  const top_5 = schemeReturns.slice(0, 5).map((s) => ({
    scheme_name: s.scheme_name,
    return_pct: s.return_pct,
  }));

  const bottom_5 = schemeReturns
    .slice(-5)
    .reverse()
    .map((s) => ({
      scheme_name: s.scheme_name,
      return_pct: s.return_pct,
    }));

  return {
    category,
    period,
    avg_return,
    top_5,
    bottom_5,
    total_schemes: schemeReturns.length,
    recipe: 'data-table',
  };
}
