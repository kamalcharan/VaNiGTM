/**
 * KI-28: get_nav — Returns latest NAV for a scheme.
 * Reads from DB only (NAV seeded from MFAPI).
 */

import { SkillContext } from '../../../shared/types';
import * as fs from 'fs';
import * as path from 'path';

interface NavRow {
  scheme_code: string;
  scheme_name: string;
  amc: string;
  category: string;
  nav: number;
  nav_date: string;
}

interface GetNavResult {
  scheme_code: string;
  scheme_name: string;
  nav: number;
  nav_date: string;
  amc: string;
  category: string;
  recipe: 'stat-row';
}

const QUERY = fs.readFileSync(
  path.join(__dirname, '../queries/latest-nav.sql'),
  'utf-8'
);

export async function get_nav(
  params: { scheme_code: string },
  ctx: SkillContext
): Promise<GetNavResult | null> {
  const result = await ctx.db.query<NavRow>(QUERY, {
    $scheme_code: params.scheme_code,
  });

  if (result.rows.length === 0) return null;

  const r = result.rows[0];
  return {
    scheme_code: r.scheme_code,
    scheme_name: r.scheme_name,
    nav: Number(r.nav),
    nav_date: r.nav_date,
    amc: r.amc,
    category: r.category,
    recipe: 'stat-row',
  };
}
