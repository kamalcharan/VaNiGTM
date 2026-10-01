/**
 * IMPORT_STAGE_REQUESTED — staging a large CSV in chunks, on the worker.
 *
 * Common pool P1. `POST /etl/sessions` hands a file over this threshold
 * (ETL_SYNC_MAX_BYTES) to here and returns at once. This reads the file one
 * record at a time (csv-stream.ts), builds each staging row with the SAME code
 * the request path uses (staging.ts), and commits every ETL_STAGE_CHUNK_ROWS
 * rows in one transaction together with the session's `last_processed_row`.
 *
 * So a crash loses at most the chunk in flight, and a re-run (the queue
 * reclaims a dead worker's event, migration 253) resumes after the last
 * committed row with no duplicates — the rows and the marker move together.
 *
 * A file that is not valid CSV fails the session with the reason (it would
 * fail the same way on every retry); anything else is rethrown for the queue
 * to retry. The run feed carries one step per chunk.
 */
import type { Pool } from 'pg';
import { appendStep } from '../agent-core/agent.runner';
import { readCsvRecords, CsvFormatError } from './csv-stream';
import { buildStagingRow, insertStagingRows, type StagingRow } from './staging';
import { resolveMappings, planToMapping } from './mapping-plan';
import { readEtlConfig } from './etl.config';

interface SessionRow {
  id: number; tenant_id: string; status: string; import_type: string;
  field_mappings: Record<string, string> | null; extraction_plan: unknown;
  last_processed_row: number; file_path: string;
}

export async function runStageJob(
  pool: Pool, tenantId: string, payload: Record<string, unknown>, runId: string | number,
): Promise<{ staged: number; total: number } | { skipped: string }> {
  const sessionId = Number(payload.session_id);
  if (!Number.isInteger(sessionId)) throw new Error('IMPORT_STAGE_REQUESTED without a session_id');
  const cfg = readEtlConfig();

  const r = await pool.query<SessionRow>(
    `SELECT s.id, s.tenant_id, s.status, s.import_type, s.field_mappings, s.extraction_plan,
            s.last_processed_row, f.file_path
       FROM ki_import_sessions s
       JOIN ki_file_uploads f ON f.id = s.file_upload_id
      WHERE s.id = $1 AND s.tenant_id = $2`,
    [sessionId, tenantId],
  );
  const s = r.rows[0];
  if (!s) throw new Error(`Import session ${sessionId} not found for this tenant`);
  if (s.status !== 'pending') {
    await appendStep(pool, runId, { step_name: 'stage', action: `Session ${sessionId} is "${s.status}" — nothing to stage`, status: 'skipped' });
    return { skipped: s.status };
  }

  // The same choice the request path makes: the human's assignment (as sent
  // with the session) wins, else the detector's plan in the same shape.
  const given = (payload.field_mappings ?? null) as Record<string, string> | null;
  const explicit = resolveMappings(given as any) ?? planToMapping(s.extraction_plan as any);
  const ctx = { importType: s.import_type, explicit, mappings: s.field_mappings ?? {} };

  const resumeFrom = s.last_processed_row ?? 0;
  if (resumeFrom > 0) {
    await appendStep(pool, runId, { step_name: 'restore', action: `Resuming after row ${resumeFrom} (already staged)`, status: 'ok' });
  }

  let chunk: StagingRow[] = [];
  let lastRow = resumeFrom;
  const commit = async () => {
    if (chunk.length === 0) return;
    const first = chunk[0].rowNumber;
    const last = chunk[chunk.length - 1].rowNumber;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await insertStagingRows(client, sessionId, chunk);
      await client.query(
        `UPDATE ki_import_sessions
            SET last_processed_row = $1, total_records = $1, current_batch = current_batch + 1, updated_at = now()
          WHERE id = $2`,
        [last, sessionId],
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    lastRow = last;
    chunk = [];
    await appendStep(pool, runId, { step_name: 'stage_chunk', action: `Staged rows ${first}–${last}`, status: 'ok' });
  };

  try {
    for await (const { rowNumber, record } of readCsvRecords(s.file_path, resumeFrom)) {
      chunk.push(buildStagingRow(record, rowNumber, ctx));
      if (chunk.length >= cfg.stageChunkRows) await commit();
    }
    await commit();
  } catch (e) {
    if (e instanceof CsvFormatError) {
      const msg = `The file is not valid CSV after row ${lastRow}: ${e.message}. Rows up to ${lastRow} are staged.`;
      await pool.query(`UPDATE ki_import_sessions SET status = 'failed', error_summary = $1 WHERE id = $2`, [msg, sessionId]);
      await appendStep(pool, runId, { step_name: 'stage', action: msg, status: 'error' });
      throw new Error(msg);
    }
    throw e;
  }

  await pool.query(
    `UPDATE ki_import_sessions
        SET status = 'staged', total_records = $1, staging_completed_at = now(), updated_at = now()
      WHERE id = $2`,
    [lastRow, sessionId],
  );
  await appendStep(pool, runId, { step_name: 'stage', action: `Staged ${lastRow} rows — ready to review and land`, status: 'ok' });
  return { staged: lastRow - resumeFrom, total: lastRow };
}
