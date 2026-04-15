/**
 * etl-skill: rollback_correction
 *
 * Reverses a completed scheme-code correction by swapping scheme codes back:
 *   - Finds the correction record for the given correction_id
 *   - Validates it is in 'completed' status and belongs to this tenant
 *   - Restores transactions: SET scheme_code = source_value WHERE scheme_code = target_value
 *   - Marks correction as 'rolled_back'
 *
 * The rollback is idempotent — if already rolled_back, returns success.
 */

import { SkillContext } from '../../../shared/types';

interface RollbackCorrectionParams {
  correction_id: number;
}

/* ── Inline SQL ──────────────────────────────────────────────────────── */

const GET_CORRECTION_SQL = `
  SELECT id, source_value, target_value, client_id, is_live, status
  FROM ki_corrections
  WHERE id        = $correction_id
    AND tenant_id = $tenant_id
  LIMIT 1;
`;

const RESTORE_SCHEME_SQL = `
  UPDATE ki_transactions
  SET scheme_code = $source_code
  WHERE tenant_id  = $tenant_id
    AND is_live    = $is_live
    AND client_id  = $client_id
    AND scheme_code = $target_code
  RETURNING id;
`;

const ROLLBACK_STATUS_SQL = `
  UPDATE ki_corrections
  SET status         = 'rolled_back',
      rolled_back_at = now(),
      updated_at     = now()
  WHERE id        = $id
    AND tenant_id = $tenant_id;
`;

const UPDATE_STEPS_SQL = `
  UPDATE ki_correction_steps
  SET status = 'rolled_back'
  WHERE correction_id = $correction_id
    AND tenant_id     = $tenant_id;
`;

/* ── Handler ─────────────────────────────────────────────────────────── */

export async function rollback_correction(
  params: RollbackCorrectionParams,
  ctx: SkillContext
): Promise<Record<string, unknown>> {
  const { correction_id } = params;

  if (!correction_id) {
    throw new Error('correction_id is required.');
  }

  /* Look up the correction */
  const corrRes = await ctx.db.query<{
    id:           number;
    source_value: string;
    target_value: string;
    client_id:    number;
    is_live:      boolean;
    status:       string;
  }>(GET_CORRECTION_SQL, {
    $correction_id: correction_id,
    $tenant_id:     ctx.tenant_id,
  });

  if (corrRes.rows.length === 0) {
    throw new Error(`Correction ${correction_id} not found.`);
  }

  const corr = corrRes.rows[0];

  if (corr.status === 'rolled_back') {
    return {
      correction_id,
      status:               'rolled_back',
      transactions_restored: 0,
      recipe:               'course-correction',
    };
  }

  if (corr.status !== 'completed') {
    throw new Error(
      `Correction ${correction_id} cannot be rolled back — current status is '${corr.status}'. ` +
      `Only 'completed' corrections can be rolled back.`
    );
  }

  /* Restore scheme codes and update correction status in one transaction */
  let restoredCount = 0;

  await ctx.db.transaction(async (tx) => {
    const restoreRes = await tx.query<{ id: number }>(RESTORE_SCHEME_SQL, {
      $tenant_id:  ctx.tenant_id,
      $is_live:    corr.is_live,
      $client_id:  corr.client_id,
      $source_code: corr.source_value,
      $target_code: corr.target_value,
    });
    restoredCount = restoreRes.rows.length;

    await tx.query(UPDATE_STEPS_SQL, {
      $correction_id: correction_id,
      $tenant_id:     ctx.tenant_id,
    });

    await tx.query(ROLLBACK_STATUS_SQL, {
      $id:        correction_id,
      $tenant_id: ctx.tenant_id,
    });
  });

  return {
    correction_id,
    status:               'rolled_back',
    transactions_restored: restoredCount,
    recipe:               'course-correction',
  };
}
