/**
 * transaction-skill: import_transactions
 *
 * Executes the ki_process_txn_import_session() PL/pgSQL RPC against a
 * previously staged import session. All rows in ki_import_staging that
 * are 'pending' for this session are processed in one DB round-trip.
 *
 * Pre-conditions (caller must ensure):
 *   - Session exists and belongs to this tenant + is_live environment
 *   - Session status is 'staged' (staging complete, ready to process)
 *   - Migrations 043, 044, 045 applied
 *
 * The RPC handles per-row:
 *   ext_ref_id → PAN → name client lookup
 *   txn type + scheme lookup
 *   dedup check
 *   ki_holdings UPSERT (portfolio entry marker)
 *   ki_transactions INSERT
 *   ki_pulses for new scheme appearances (renamed from ki_alerts in migration 057)
 */

import { SkillContext } from '../../../shared/types';

interface ImportTransactionsParams {
  session_id: number;
}

interface RpcRow {
  total_processed:   string;
  successful:        string;
  failed:            string;
  duplicates:        string;
  orphans:           string;
  processing_time_s: string;
}

interface SessionRow {
  id:        number;
  tenant_id: string;
  is_live:   boolean;
  status:    string;
}

export interface ImportTransactionsResult {
  session_id:       number;
  total_processed:  number;
  successful:       number;
  failed:           number;
  duplicates:       number;
  orphans:          number;
  processing_time_s: number;
  status:           'completed' | 'completed_with_errors';
  recipe:           'stat-row';
}

// Validate session before firing the RPC — avoids a cryptic PG exception
const VERIFY_SESSION_SQL = `
  SELECT id, tenant_id, is_live, status
  FROM   ki_import_sessions
  WHERE  id        = $session_id::INTEGER
    AND  tenant_id = $tenant_id::UUID
    AND  is_live   = $is_live::BOOLEAN
`;

// One call — the RPC processes all pending staging rows and returns counters
const RUN_RPC_SQL = `
  SELECT
    total_processed,
    successful,
    failed,
    duplicates,
    orphans,
    processing_time_s
  FROM ki_process_txn_import_session($session_id::INTEGER)
`;

export async function import_transactions(
  params: ImportTransactionsParams,
  ctx: SkillContext
): Promise<ImportTransactionsResult> {
  const { session_id } = params;

  if (!session_id || typeof session_id !== 'number' || !Number.isInteger(session_id)) {
    throw new Error('session_id is required and must be an integer');
  }

  // ── Verify session exists, belongs to this tenant+environment, is processable ──

  const verify = await ctx.db.query<SessionRow>(VERIFY_SESSION_SQL, {
    $session_id: session_id,
    $tenant_id:  ctx.tenant_id,
    $is_live:    ctx.is_live,
  });

  if (verify.rows.length === 0) {
    throw new Error(`Import session ${session_id} not found for this tenant/environment`);
  }

  const session = verify.rows[0];

  if (session.status === 'processing') {
    throw new Error(`Session ${session_id} is already processing — do not call twice`);
  }

  if (session.status === 'completed' || session.status === 'completed_with_errors') {
    throw new Error(`Session ${session_id} has already been processed (status: ${session.status})`);
  }

  if (session.status !== 'staged') {
    throw new Error(
      `Session ${session_id} is not ready to process (status: ${session.status}). ` +
      `Staging must complete before import_transactions is called.`
    );
  }

  // ── Execute the RPC — processes all pending staging rows ──

  const rpc = await ctx.db.query<RpcRow>(RUN_RPC_SQL, {
    $session_id: session_id,
  });

  if (rpc.rows.length === 0) {
    throw new Error(`ki_process_txn_import_session returned no result for session ${session_id}`);
  }

  const row = rpc.rows[0];

  const total_processed  = Number(row.total_processed);
  const successful       = Number(row.successful);
  const failed           = Number(row.failed);
  const duplicates       = Number(row.duplicates);
  const orphans          = Number(row.orphans);
  const processing_time_s = Number(row.processing_time_s);

  const status: 'completed' | 'completed_with_errors' =
    failed + orphans > 0 ? 'completed_with_errors' : 'completed';

  return {
    session_id,
    total_processed,
    successful,
    failed,
    duplicates,
    orphans,
    processing_time_s,
    status,
    recipe: 'stat-row',
  };
}
