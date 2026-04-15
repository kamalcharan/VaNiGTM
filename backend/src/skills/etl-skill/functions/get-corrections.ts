/**
 * etl-skill: get_corrections
 * Lists all scheme-remap correction campaigns for the tenant.
 * Returns step-pass/fail status derived from overall correction state.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

interface GetCorrectionsParams {
  status?: string;
}

type StepStatus = 'pass' | 'fail' | 'pending';

interface CorrectionRow {
  id:                 number;
  source_scheme_code: string;
  target_scheme_code: string;
  source_scheme_name: string | null;
  target_scheme_name: string | null;
  customer_id:        number;
  customer_name:      string;
  transaction_count:  string;
  total_invested:     string;
  status:             string;
  notes:              string | null;
  error_message:      string | null;
  created_at:         string;
  executed_at:        string | null;
  rolled_back_at:     string | null;
}

const QUERY = fs.readFileSync(
  path.join(__dirname, '../queries/get-corrections.sql'),
  'utf-8'
);

/** All 8 UI steps marked as passed — for completed/rolled_back corrections. */
function allPassSteps(): Record<string, StepStatus> {
  return {
    step_1_check_existing:    'pass',
    step_2_get_customer:      'pass',
    step_3_get_source_scheme: 'pass',
    step_4_get_target_scheme: 'pass',
    step_5_count_txns:        'pass',
    step_6_backup:            'pass',
    step_7_update_txns:       'pass',
    step_8_snapshots:         'pass',
  };
}

export async function get_corrections(
  params: GetCorrectionsParams,
  ctx: SkillContext
): Promise<Record<string, unknown>> {
  const result = await ctx.db.query<CorrectionRow>(QUERY, {
    $tenant_id: ctx.tenant_id,
    $is_live:   ctx.is_live,
    $status:    params.status ?? null,
  });

  const corrections = result.rows.map(r => {
    const status = r.status;

    return {
      id:                 r.id,
      customer_id:        r.customer_id,
      customer_name:      r.customer_name,
      source_scheme_code: r.source_scheme_code,
      source_scheme_name: r.source_scheme_name ?? null,
      target_scheme_code: r.target_scheme_code,
      target_scheme_name: r.target_scheme_name ?? null,
      transaction_count:  Number(r.transaction_count),
      total_invested:     Number(r.total_invested),
      status,
      notes:              r.notes ?? null,
      error_message:      r.error_message ?? null,
      created_at:         r.created_at,
      executed_at:        r.executed_at  ?? null,
      rolled_back_at:     r.rolled_back_at ?? null,

      // Derive step statuses from overall correction state.
      // completed / rolled_back → all 8 steps passed.
      // pending / failed        → steps left undefined (shown as pending chips).
      ...(status === 'completed' || status === 'rolled_back'
        ? allPassSteps()
        : {}
      ),
    };
  });

  return {
    corrections,
    total:  corrections.length,
    recipe: 'course-correction',
  };
}
