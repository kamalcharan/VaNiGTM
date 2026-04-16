/**
 * KI: update_asset_assignment — Update investment plan details.
 *
 * Partial update — only supplied fields are changed.
 * Pass null explicitly to clear duration_months, recurring_amount,
 * investment_frequency, or custom_assumption_rate.
 */

import { SkillContext } from '../../../shared/types';
import * as fs from 'fs';
import * as path from 'path';

interface UpdateParams {
  assignment_id:           number;
  client_id:               number;
  investment_type?:        'one_time' | 'lumpsum' | 'sip' | 'recurring' | null;
  principal_amount?:       number | null;
  start_date?:             string | null;
  duration_months?:        number | null;
  recurring_amount?:       number | null;
  investment_frequency?:   'monthly' | 'quarterly' | 'yearly' | null;
  custom_assumption_rate?: number | null;
  notes?:                  string | null;
}

interface UpdateResult {
  assignment_id: number;
  updated_at:    string;
  recipe: 'asset-assignment-updated';
}

interface ReturnRow {
  assignment_id: number;
  updated_at:    string;
}

const QUERY = fs.readFileSync(
  path.join(__dirname, '../queries/update-asset-assignment.sql'),
  'utf-8'
);

export async function update_asset_assignment(
  params: UpdateParams,
  ctx: SkillContext
): Promise<UpdateResult> {
  const {
    assignment_id,
    client_id,
    investment_type        = null,
    principal_amount       = null,
    start_date             = null,
    duration_months        = null,
    recurring_amount       = null,
    investment_frequency   = null,
    custom_assumption_rate = null,
    notes                  = null,
  } = params;

  let result!: { rows: ReturnRow[] };

  await ctx.db.transaction(async (tx) => {
    result = await tx.query<ReturnRow>(QUERY, {
      $assignment_id:          assignment_id,
      $tenant_id:              ctx.tenant_id,
      $is_live:                ctx.is_live,
      $client_id:              client_id,
      $investment_type:        investment_type,
      $principal_amount:       principal_amount,
      $start_date:             start_date,
      $duration_months:        duration_months,
      $recurring_amount:       recurring_amount,
      $investment_frequency:   investment_frequency,
      $custom_assumption_rate: custom_assumption_rate,
      $notes:                  notes,
    });
  });

  const row = result.rows[0];
  if (!row) {
    throw new Error('Asset assignment not found or access denied');
  }

  return {
    assignment_id: row.assignment_id,
    updated_at:    row.updated_at,
    recipe: 'asset-assignment-updated',
  };
}
