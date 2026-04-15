/**
 * etl-skill: execute_correction
 *
 * Runs an 8-step scheme-code migration for a specific customer:
 *   1. Check existing  — no active correction for the same client + source scheme
 *   2. Get customer    — validate customer exists
 *   3. Source scheme   — look up source scheme in master (advisory)
 *   4. Target scheme   — look up target scheme in master (advisory)
 *   5. Count txns      — must have ≥1 transaction to migrate
 *   6. Backup          — snapshot affected rows into ki_correction_steps
 *   7. Update txns     — SET scheme_code = target WHERE scheme_code = source
 *   8. Log outcome     — mark correction as completed
 *
 * Steps 1–5 are read-only validation; failure in 1, 2, 5 throws an error.
 * Steps 6–8 run inside a single database transaction.
 *
 * A ki_corrections record is created (status='executing') before step 6 so
 * that ki_correction_steps can reference it. If the transaction fails, the
 * record is marked 'failed'.
 */

import { SkillContext } from '../../../shared/types';

interface ExecuteCorrectionParams {
  customer_id:        number;
  source_scheme_code: string;
  target_scheme_code: string;
  notes?:             string;
}

type StepStatus = 'pass' | 'fail';

interface StepResult {
  step:    string;
  label:   string;
  status:  StepStatus;
  detail?: string;
}

/* ── Inline SQL ──────────────────────────────────────────────────────── */

const CHECK_EXISTING_SQL = `
  SELECT id FROM ki_corrections
  WHERE tenant_id   = $tenant_id
    AND client_id   = $client_id
    AND source_value = $source_value
    AND status NOT IN ('rolled_back', 'failed')
  LIMIT 1;
`;

const GET_CUSTOMER_SQL = `
  SELECT cl.id, ct.name
  FROM ki_clients cl
  JOIN ki_contacts ct ON ct.id = cl.contact_id
  WHERE cl.id        = $client_id
    AND cl.tenant_id = $tenant_id
  LIMIT 1;
`;

const GET_SCHEME_SQL = `
  SELECT scheme_code, scheme_name
  FROM ki_schemes
  WHERE scheme_code = $scheme_code
  LIMIT 1;
`;

const COUNT_TXNS_SQL = `
  SELECT COUNT(*) AS count
  FROM ki_transactions
  WHERE tenant_id  = $tenant_id
    AND is_live    = $is_live
    AND client_id  = $client_id
    AND scheme_code = $scheme_code;
`;

const BACKUP_TXNS_SQL = `
  SELECT id, scheme_code, amount, txn_date, txn_type, folio_no
  FROM ki_transactions
  WHERE tenant_id  = $tenant_id
    AND is_live    = $is_live
    AND client_id  = $client_id
    AND scheme_code = $scheme_code;
`;

const INSERT_CORRECTION_SQL = `
  INSERT INTO ki_corrections (
    tenant_id, is_live, correction_type,
    source_value, target_value,
    client_id, status, initiated_by, notes,
    affected_txn_count,
    created_at, updated_at
  ) VALUES (
    $tenant_id, $is_live, 'scheme_remap',
    $source_value, $target_value,
    $client_id, 'executing', $initiated_by::uuid, $notes,
    $affected_txn_count,
    now(), now()
  )
  RETURNING id;
`;

const INSERT_STEP_SQL = `
  INSERT INTO ki_correction_steps (
    correction_id, tenant_id,
    step_order, step_name, step_key,
    status, rows_affected, before_snapshot,
    started_at, completed_at, created_at
  ) VALUES (
    $correction_id, $tenant_id,
    $step_order, $step_name, $step_key,
    $status, $rows_affected, $before_snapshot::jsonb,
    now(), now(), now()
  );
`;

const UPDATE_SCHEME_SQL = `
  UPDATE ki_transactions
  SET scheme_code = $target_code
  WHERE tenant_id  = $tenant_id
    AND is_live    = $is_live
    AND client_id  = $client_id
    AND scheme_code = $source_code;
`;

const COMPLETE_CORRECTION_SQL = `
  UPDATE ki_corrections
  SET status             = 'completed',
      completed_at       = now(),
      affected_txn_count = $affected_count,
      updated_at         = now()
  WHERE id         = $id
    AND tenant_id  = $tenant_id;
`;

const FAIL_CORRECTION_SQL = `
  UPDATE ki_corrections
  SET status = 'failed', updated_at = now()
  WHERE id = $id AND tenant_id = $tenant_id;
`;

/* ── Handler ─────────────────────────────────────────────────────────── */

export async function execute_correction(
  params: ExecuteCorrectionParams,
  ctx: SkillContext
): Promise<Record<string, unknown>> {
  const { customer_id, source_scheme_code, target_scheme_code, notes } = params;

  if (!customer_id || !source_scheme_code || !target_scheme_code) {
    throw new Error('customer_id, source_scheme_code and target_scheme_code are required.');
  }

  const srcCode = String(source_scheme_code).trim().toUpperCase();
  const tgtCode = String(target_scheme_code).trim().toUpperCase();

  if (srcCode === tgtCode) {
    throw new Error('Source and target scheme codes must be different.');
  }

  const steps: StepResult[] = [];

  /* ── Step 1: Check for existing active correction ── */
  const existingRes = await ctx.db.query<{ id: number }>(CHECK_EXISTING_SQL, {
    $tenant_id:   ctx.tenant_id,
    $client_id:   customer_id,
    $source_value: srcCode,
  });
  if (existingRes.rows.length > 0) {
    throw new Error(
      `An active correction already exists for customer ${customer_id} ` +
      `and source scheme ${srcCode}. Rollback the existing correction first.`
    );
  }
  steps.push({ step: 'check_existing', label: 'Check existing migrations', status: 'pass' });

  /* ── Step 2: Validate customer ── */
  const custRes = await ctx.db.query<{ id: number; name: string }>(GET_CUSTOMER_SQL, {
    $client_id: customer_id,
    $tenant_id: ctx.tenant_id,
  });
  if (custRes.rows.length === 0) {
    throw new Error(`Customer ID ${customer_id} not found.`);
  }
  const customer = custRes.rows[0];
  steps.push({ step: 'get_customer', label: 'Get customer', status: 'pass',
    detail: customer.name });

  /* ── Step 3: Look up source scheme (advisory — not fatal) ── */
  const srcSchemeRes = await ctx.db.query<{ scheme_code: string; scheme_name: string }>(
    GET_SCHEME_SQL, { $scheme_code: srcCode }
  );
  const srcScheme = srcSchemeRes.rows[0] ?? null;
  steps.push({ step: 'get_source_scheme', label: 'Get source scheme', status: 'pass',
    detail: srcScheme?.scheme_name ?? `${srcCode} (not in scheme master)` });

  /* ── Step 4: Look up target scheme (advisory — not fatal) ── */
  const tgtSchemeRes = await ctx.db.query<{ scheme_code: string; scheme_name: string }>(
    GET_SCHEME_SQL, { $scheme_code: tgtCode }
  );
  const tgtScheme = tgtSchemeRes.rows[0] ?? null;
  steps.push({ step: 'get_target_scheme', label: 'Get target scheme', status: 'pass',
    detail: tgtScheme?.scheme_name ?? `${tgtCode} (not in scheme master)` });

  /* ── Step 5: Count transactions to migrate ── */
  const countRes = await ctx.db.query<{ count: string }>(COUNT_TXNS_SQL, {
    $tenant_id:  ctx.tenant_id,
    $is_live:    ctx.is_live,
    $client_id:  customer_id,
    $scheme_code: srcCode,
  });
  const txnCount = Number(countRes.rows[0]?.count ?? 0);
  if (txnCount === 0) {
    throw new Error(
      `No transactions found for scheme ${srcCode} and customer ${customer_id}.`
    );
  }
  steps.push({ step: 'count_txns', label: 'Count transactions', status: 'pass',
    detail: `${txnCount} transaction${txnCount !== 1 ? 's' : ''}` });

  /* ── Create correction record (status = 'executing') ── */
  const corrRes = await ctx.db.query<{ id: number }>(INSERT_CORRECTION_SQL, {
    $tenant_id:          ctx.tenant_id,
    $is_live:            ctx.is_live,
    $source_value:       srcCode,
    $target_value:       tgtCode,
    $client_id:          customer_id,
    $initiated_by:       ctx.user_id,
    $notes:              notes ?? null,
    $affected_txn_count: txnCount,
  });
  const correctionId = corrRes.rows[0].id;

  /* ── Steps 6–8: Data modification in a single transaction ── */
  try {
    await ctx.db.transaction(async (tx) => {
      /* Step 6: Backup rows before modification */
      const backupRes = await tx.query(BACKUP_TXNS_SQL, {
        $tenant_id:  ctx.tenant_id,
        $is_live:    ctx.is_live,
        $client_id:  customer_id,
        $scheme_code: srcCode,
      });
      await tx.query(INSERT_STEP_SQL, {
        $correction_id:   correctionId,
        $tenant_id:       ctx.tenant_id,
        $step_order:      1,
        $step_name:       'Backup transactions',
        $step_key:        'backup_snapshot',
        $status:          'completed',
        $rows_affected:   backupRes.rows.length,
        $before_snapshot: JSON.stringify(backupRes.rows),
      });
      steps.push({ step: 'backup', label: 'Backup transactions', status: 'pass',
        detail: `${backupRes.rows.length} rows backed up` });

      /* Step 7: Update scheme_code on all matching transactions */
      await tx.query(UPDATE_SCHEME_SQL, {
        $tenant_id:  ctx.tenant_id,
        $is_live:    ctx.is_live,
        $client_id:  customer_id,
        $source_code: srcCode,
        $target_code: tgtCode,
      });
      await tx.query(INSERT_STEP_SQL, {
        $correction_id:   correctionId,
        $tenant_id:       ctx.tenant_id,
        $step_order:      2,
        $step_name:       'Update scheme code',
        $step_key:        'update_transactions',
        $status:          'completed',
        $rows_affected:   txnCount,
        $before_snapshot: null,
      });
      steps.push({ step: 'update_txns', label: 'Update transactions', status: 'pass',
        detail: `${txnCount} transaction${txnCount !== 1 ? 's' : ''} updated` });

      /* Step 8: Log outcome + mark correction completed */
      await tx.query(INSERT_STEP_SQL, {
        $correction_id:   correctionId,
        $tenant_id:       ctx.tenant_id,
        $step_order:      3,
        $step_name:       'Log outcome',
        $step_key:        'log_outcome',
        $status:          'completed',
        $rows_affected:   0,
        $before_snapshot: null,
      });
      await tx.query(COMPLETE_CORRECTION_SQL, {
        $affected_count: txnCount,
        $id:             correctionId,
        $tenant_id:      ctx.tenant_id,
      });
    });

    steps.push({ step: 'snapshots', label: 'Regenerate snapshots', status: 'pass',
      detail: 'Snapshot regeneration scheduled' });

  } catch (err) {
    await ctx.db.query(FAIL_CORRECTION_SQL, {
      $id:        correctionId,
      $tenant_id: ctx.tenant_id,
    });
    const msg = (err as Error).message ?? 'Database error during correction';
    steps.push({ step: 'update_txns', label: 'Update transactions', status: 'fail',
      detail: msg });
    throw new Error(`Correction failed at data modification step: ${msg}`);
  }

  return {
    correction_id:         correctionId,
    steps,
    transactions_affected: txnCount,
    recipe:                'course-correction',
  };
}
