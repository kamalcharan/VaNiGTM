/**
 * KI: get_asset_assignments — All asset assignments for a client (MF + non-MF).
 *
 * Returns every ki_customer_asset_assignments row enriched with:
 *   - Asset type metadata (name, category, default growth rate)
 *   - MF: live holdings data (units, invested) + latest NAV + gain/loss
 *   - Non-MF: estimated current value via compound growth formula
 *
 * Results are grouped by category for the client Assets tab.
 */

import { SkillContext } from '../../../shared/types';
import * as fs from 'fs';
import * as path from 'path';

/* ── Raw DB row ──────────────────────────────────────────────────────────── */

interface AssignmentRow {
  assignment_id:            number | null;
  has_assignment:           boolean;
  scheme_code:              string | null;
  investment_type:          string | null;
  principal_amount:         string | null;
  start_date:               string | null;
  duration_months:          number | null;
  recurring_amount:         string | null;
  investment_frequency:     string | null;
  custom_assumption_rate:   string | null;
  is_active:                boolean;
  notes:                    string | null;
  created_at:               string;
  asset_type_id:            number;
  asset_type_code:          string;
  asset_type_name:          string;
  category:                 string;
  default_assumption_rate:  string;
  display_order:            number;
  scheme_name:              string | null;
  amc:                      string | null;
  fund_category:            string | null;
  units:                    string | null;
  mf_invested:              string | null;
  avg_nav:                  string | null;
  current_nav:              string | null;
  nav_date:                 string | null;
  effective_rate:           string;
  years_held:               string;
  estimated_current_value:  string | null;
  gain_loss:                string | null;
  gain_pct:                 string | null;
}

/* ── Exported shapes ────────────────────────────────────────────────────── */

export interface AssetAssignmentItem {
  assignment_id:          number | null;
  has_assignment:         boolean;
  asset_type_code:        string;
  asset_type_name:        string;
  category:               string;
  display_order:          number;
  investment_type:        string | null;
  start_date:             string | null;
  duration_months:        number | null;
  recurring_amount:       number | null;
  investment_frequency:   string | null;
  effective_rate:         number;
  notes:                  string | null;
  created_at:             string;
  // MF-specific
  scheme_code:            string | null;
  scheme_name:            string | null;
  amc:                    string | null;
  fund_category:          string | null;
  units:                  number | null;
  avg_nav:                number | null;
  current_nav:            number | null;
  nav_date:               string | null;
  mf_invested:            number | null;
  // Valuation
  principal_amount:       number | null;
  estimated_current_value: number | null;
  gain_loss:              number | null;
  gain_pct:               number | null;
}

export interface AssetCategoryGroup {
  category:        string;
  label:           string;
  total_value:     number;
  total_invested:  number;
  assignments:     AssetAssignmentItem[];
}

interface GetAssetAssignmentsResult {
  assignments:    AssetAssignmentItem[];
  by_category:    AssetCategoryGroup[];
  summary: {
    total_value:    number;
    total_invested: number;
    asset_count:    number;
    mf_count:       number;
    non_mf_count:   number;
  };
  recipe: 'asset-assignments';
}

/* ── Category labels ────────────────────────────────────────────────────── */

const CATEGORY_LABELS: Record<string, string> = {
  equity:       'Equity',
  fixed_income: 'Fixed Income',
  commodity:    'Commodities',
  real_estate:  'Real Estate',
  insurance:    'Insurance',
};

/* ── SQL ────────────────────────────────────────────────────────────────── */

const QUERY = fs.readFileSync(
  path.join(__dirname, '../queries/asset-assignments.sql'),
  'utf-8'
);

/* ── Handler ────────────────────────────────────────────────────────────── */

export async function get_asset_assignments(
  params: { client_id: number },
  ctx: SkillContext
): Promise<GetAssetAssignmentsResult> {
  const { client_id } = params;

  const result = await ctx.db.query<AssignmentRow>(QUERY, {
    $tenant_id: ctx.tenant_id,
    $is_live:   ctx.is_live,
    $client_id: client_id,
  });

  /* ── Map rows to typed items ── */
  const assignments: AssetAssignmentItem[] = result.rows.map((r) => ({
    assignment_id:           r.assignment_id,
    has_assignment:          r.has_assignment,
    asset_type_code:         r.asset_type_code,
    asset_type_name:         r.asset_type_name,
    category:                r.category,
    display_order:           r.display_order,
    investment_type:         r.investment_type,
    start_date:              r.start_date,
    duration_months:         r.duration_months,
    recurring_amount:        r.recurring_amount != null ? Number(r.recurring_amount) : null,
    investment_frequency:    r.investment_frequency,
    effective_rate:          Number(r.effective_rate),
    notes:                   r.notes,
    created_at:              r.created_at,
    // MF
    scheme_code:             r.scheme_code,
    scheme_name:             r.scheme_name,
    amc:                     r.amc,
    fund_category:           r.fund_category,
    units:                   r.units != null ? Number(r.units) : null,
    avg_nav:                 r.avg_nav != null ? Number(r.avg_nav) : null,
    current_nav:             r.current_nav != null ? Number(r.current_nav) : null,
    nav_date:                r.nav_date,
    mf_invested:             r.mf_invested != null ? Number(r.mf_invested) : null,
    // Valuation
    principal_amount:        r.principal_amount != null ? Number(r.principal_amount) : null,
    estimated_current_value: r.estimated_current_value != null ? Number(r.estimated_current_value) : null,
    gain_loss:               r.gain_loss != null ? Number(r.gain_loss) : null,
    gain_pct:                r.gain_pct != null ? Number(r.gain_pct) : null,
  }));

  /* ── Group by category ── */
  const categoryMap = new Map<string, AssetCategoryGroup>();

  for (const a of assignments) {
    if (!categoryMap.has(a.category)) {
      categoryMap.set(a.category, {
        category:       a.category,
        label:          CATEGORY_LABELS[a.category] ?? a.category,
        total_value:    0,
        total_invested: 0,
        assignments:    [],
      });
    }
    const grp = categoryMap.get(a.category)!;
    grp.assignments.push(a);
    grp.total_value    += a.estimated_current_value ?? 0;
    grp.total_invested += a.mf_invested ?? a.principal_amount ?? 0;
  }

  // Sort categories by display_order of first assignment in each group
  const by_category = Array.from(categoryMap.values()).sort((a, b) => {
    const aOrd = a.assignments[0]?.display_order ?? 99;
    const bOrd = b.assignments[0]?.display_order ?? 99;
    return aOrd - bOrd;
  });

  /* ── Summary ── */
  const total_value    = assignments.reduce((s, a) => s + (a.estimated_current_value ?? 0), 0);
  const total_invested = assignments.reduce((s, a) => s + (a.mf_invested ?? a.principal_amount ?? 0), 0);
  const mf_count       = assignments.filter(a => a.scheme_code != null).length;

  return {
    assignments,
    by_category,
    summary: {
      total_value:    Math.round(total_value * 100) / 100,
      total_invested: Math.round(total_invested * 100) / 100,
      asset_count:    assignments.length,
      mf_count,
      non_mf_count:   assignments.length - mf_count,
    },
    recipe: 'asset-assignments',
  };
}
