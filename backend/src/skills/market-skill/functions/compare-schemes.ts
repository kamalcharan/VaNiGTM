/**
 * KI-28: compare_schemes — Side-by-side comparison of schemes.
 * Accepts array of scheme_codes, returns metrics including period returns.
 */

import { SkillContext } from '../../../shared/types';
import * as fs from 'fs';
import * as path from 'path';

interface SchemeRow {
  scheme_code: string;
  scheme_name: string;
  amc: string;
  category: string;
  expense_ratio: number | null;
  risk_grade: string | null;
  aum: number | null;
  nav: number | null;
}

interface NavPointRow {
  nav: number;
}

interface SchemeComparison {
  scheme_code: string;
  scheme_name: string;
  amc: string;
  category: string;
  nav: number | null;
  returns_1y: number | null;
  returns_3y: number | null;
  returns_5y: number | null;
  expense_ratio: number | null;
  risk_grade: string | null;
  aum: number | null;
}

interface CompareSchemesResult {
  schemes: SchemeComparison[];
  recipe: 'comparison';
}

const QUERY = fs.readFileSync(
  path.join(__dirname, '../queries/compare-schemes.sql'),
  'utf-8'
);

const NAV_AT_DATE_QUERY = `
  SELECT nav
  FROM ki_nav_history
  WHERE scheme_code = $scheme_code
    AND nav_date <= $target_date
  ORDER BY nav_date DESC
  LIMIT 1
`;

function calcReturn(currentNav: number | null, pastNav: number | null): number | null {
  if (!currentNav || !pastNav || pastNav === 0) return null;
  return Math.round(((currentNav - pastNav) / pastNav) * 10000) / 100;
}

function dateMinusYears(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

export async function compare_schemes(
  params: { scheme_codes: string[]; metric?: 'returns' | 'risk' | 'expense_ratio' | 'all' },
  ctx: SkillContext
): Promise<CompareSchemesResult> {
  const { scheme_codes } = params;

  // Fetch scheme details
  const schemeResult = await ctx.db.query<SchemeRow>(QUERY, {
    $scheme_codes: scheme_codes,
  });

  const date1y = dateMinusYears(1);
  const date3y = dateMinusYears(3);
  const date5y = dateMinusYears(5);

  // For each scheme, fetch historical NAV points for return calculation
  const schemes: SchemeComparison[] = await Promise.all(
    schemeResult.rows.map(async (s) => {
      const [nav1y, nav3y, nav5y] = await Promise.all([
        ctx.db.query<NavPointRow>(NAV_AT_DATE_QUERY, {
          $scheme_code: s.scheme_code,
          $target_date: date1y,
        }),
        ctx.db.query<NavPointRow>(NAV_AT_DATE_QUERY, {
          $scheme_code: s.scheme_code,
          $target_date: date3y,
        }),
        ctx.db.query<NavPointRow>(NAV_AT_DATE_QUERY, {
          $scheme_code: s.scheme_code,
          $target_date: date5y,
        }),
      ]);

      const currentNav = s.nav !== null ? Number(s.nav) : null;

      return {
        scheme_code: s.scheme_code,
        scheme_name: s.scheme_name,
        amc: s.amc,
        category: s.category,
        nav: currentNav,
        returns_1y: calcReturn(currentNav, nav1y.rows[0]?.nav ? Number(nav1y.rows[0].nav) : null),
        returns_3y: calcReturn(currentNav, nav3y.rows[0]?.nav ? Number(nav3y.rows[0].nav) : null),
        returns_5y: calcReturn(currentNav, nav5y.rows[0]?.nav ? Number(nav5y.rows[0].nav) : null),
        expense_ratio: s.expense_ratio !== null ? Number(s.expense_ratio) : null,
        risk_grade: s.risk_grade,
        aum: s.aum !== null ? Number(s.aum) : null,
      };
    })
  );

  return {
    schemes,
    recipe: 'comparison',
  };
}
