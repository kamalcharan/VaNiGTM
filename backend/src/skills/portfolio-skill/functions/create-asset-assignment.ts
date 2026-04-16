/**
 * KI: create_asset_assignment — Create a new investment plan for a client.
 *
 * Covers both:
 *   - Non-MF assets (GOLD, FD, PPF, etc.) — manually entered by advisor
 *   - MF assets — normally auto-created on import, but can be manually added
 *
 * All writes are in a transaction.
 */

import { SkillContext } from '../../../shared/types';
import * as fs from 'fs';
import * as path from 'path';

interface CreateParams {
  client_id:              number;
  asset_type_id:          number;
  scheme_code?:           string | null;
  investment_type:        'one_time' | 'lumpsum' | 'sip' | 'recurring';
  principal_amount:       number;
  start_date?:            string | null;      // ISO date "YYYY-MM-DD"
  duration_months?:       number | null;
  recurring_amount?:      number | null;
  investment_frequency?:  'monthly' | 'quarterly' | 'yearly' | null;
  custom_assumption_rate?: number | null;
  notes?:                 string | null;
}

interface CreateResult {
  assignment_id: number;
  created_at:    string;
  recipe: 'asset-assignment-created';
}

interface ReturnRow {
  assignment_id: number;
  created_at:    string;
}

const QUERY = fs.readFileSync(
  path.join(__dirname, '../queries/create-asset-assignment.sql'),
  'utf-8'
);

export async function create_asset_assignment(
  params: CreateParams,
  ctx: SkillContext
): Promise<CreateResult> {
  const {
    client_id,
    asset_type_id,
    scheme_code       = null,
    investment_type,
    principal_amount,
    start_date        = null,
    duration_months   = null,
    recurring_amount  = null,
    investment_frequency = null,
    custom_assumption_rate = null,
    notes             = null,
  } = params;

  let result!: { rows: ReturnRow[] };

  await ctx.db.transaction(async (tx) => {
    result = await tx.query<ReturnRow>(QUERY, {
      $tenant_id:              ctx.tenant_id,
      $is_live:                ctx.is_live,
      $client_id:              client_id,
      $asset_type_id:          asset_type_id,
      $scheme_code:            scheme_code,
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
    throw new Error('Failed to create asset assignment — conflict with existing record?');
  }

  return {
    assignment_id: row.assignment_id,
    created_at:    row.created_at,
    recipe: 'asset-assignment-created',
  };
}
