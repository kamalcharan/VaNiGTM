/**
 * contact-skill: get_snapshot_full
 *
 * Returns the complete active (or draft) snapshot for a contact,
 * including all child rows from the versioned snapshot system.
 *
 * Returns null if no snapshot exists yet for this contact.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const GET_HEADER_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/get-snapshot-header.sql'), 'utf-8'
);

interface GetSnapshotFullParams {
  contact_id: number;
  /** Which version to fetch. Defaults to 'active', falls back to 'draft'. */
  prefer_status?: 'active' | 'draft';
}

export async function get_snapshot_full(
  params: GetSnapshotFullParams,
  ctx: SkillContext
): Promise<{ snapshot: Record<string, unknown> | null; recipe: 'snapshot-view' }> {
  const { contact_id, prefer_status = 'active' } = params;

  const base = { $tenant_id: ctx.tenant_id, $contact_id: contact_id, $is_live: ctx.is_live };

  // Try preferred status first, then fall back
  let headerRes = await ctx.db.query(GET_HEADER_SQL, { ...base, $status: prefer_status });
  if (!headerRes.rows[0] && prefer_status === 'active') {
    headerRes = await ctx.db.query(GET_HEADER_SQL, { ...base, $status: 'draft' });
  }

  const header = headerRes.rows[0] ?? null;
  if (!header) return { snapshot: null, recipe: 'snapshot-view' };

  const snap_id = (header as { id: number }).id;
  const snapParam = { $snapshot_id: snap_id };

  // Fetch all child tables in parallel
  const [incomeRes, expenseRes, assetRes, liabRes, protRes, goalRes] = await Promise.all([
    ctx.db.query(
      `SELECT source, amount_monthly, notes
       FROM ki_snapshot_income WHERE snapshot_id = $snapshot_id ORDER BY source`,
      snapParam
    ),
    ctx.db.query(
      `SELECT category, amount_monthly
       FROM ki_snapshot_expenses WHERE snapshot_id = $snapshot_id ORDER BY category`,
      snapParam
    ),
    ctx.db.query(
      `SELECT a.id, a.asset_type_id,
              t.asset_type_name AS asset_type_label,
              t.asset_type_code AS asset_type_code,
              a.description, a.current_value, a.is_liquid, a.years_held, a.sort_order
       FROM ki_snapshot_assets a
       JOIN ki_asset_types t ON t.id = a.asset_type_id
       WHERE a.snapshot_id = $snapshot_id ORDER BY a.sort_order, a.id`,
      snapParam
    ),
    ctx.db.query(
      `SELECT l.id, l.liability_type_id, t.label AS liability_type_label, t.code AS liability_type_code,
              l.description, l.outstanding_amount, l.monthly_emi, l.interest_rate_pct, l.sort_order
       FROM ki_snapshot_liabilities l
       JOIN ki_liability_types t ON t.id = l.liability_type_id
       WHERE l.snapshot_id = $snapshot_id ORDER BY l.sort_order, l.id`,
      snapParam
    ),
    ctx.db.query(
      `SELECT life_cover_amount, life_premium_annual, health_cover_amount,
              health_premium_annual, ci_cover_amount, protection_ratio,
              has_term_plan, has_health_cover, notes
       FROM ki_snapshot_protection WHERE snapshot_id = $snapshot_id`,
      snapParam
    ),
    ctx.db.query(
      `SELECT id, goal_type, name, target_amount, timeline_years,
              priority, seeded_goal_id, notes, sort_order
       FROM ki_snapshot_goals WHERE snapshot_id = $snapshot_id
       ORDER BY priority, sort_order, id`,
      snapParam
    ),
  ]);

  return {
    snapshot: {
      ...header,
      income:      incomeRes.rows,
      expenses:    expenseRes.rows,
      assets:      assetRes.rows,
      liabilities: liabRes.rows,
      protection:  protRes.rows[0] ?? null,
      goals:       goalRes.rows,
    },
    recipe: 'snapshot-view',
  };
}
