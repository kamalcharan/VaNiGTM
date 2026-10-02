/**
 * Uploaded files are TEMPORARY (Charan, 2026-10-02).
 *
 *   "files should not be saved … files are like temp till data goes to
 *    staging area … capture file metadata … and the same cannot be uploaded
 *    again."
 *
 * So a file lives in ETL_UPLOAD_DIR only until its rows are staged — by the
 * request, or by the worker for a large CSV — and is then deleted. What stays
 * is the metadata in `ki_file_uploads` (name, date, size, kind, sha256) and
 * the row count on the session. Staged rows keep `raw_data`, so nothing the
 * file said is lost.
 *
 * "The same file" is the same CONTENT (sha256), not the same name: renaming a
 * file does not make it a new delivery. To bring identical content in again,
 * retire the earlier import. A FAILED import never blocks its own file — the
 * rows that overlap earlier ones are duplicates ("already held"), not a
 * refusal.
 */
import fs from 'fs';
import path from 'path';
import type { Pool, PoolClient } from 'pg';
import { readEtlConfig } from './etl.config';

type Db = Pool | PoolClient;

/** The temp folder, resolved against the process's working directory. */
export function uploadDir(): string {
  return path.resolve(readEtlConfig().uploadDir);
}

export function fileIsGone(filePath: string | null | undefined): boolean {
  return !filePath || !fs.existsSync(filePath);
}

/** Delete the file and record how its life ended. A file already gone is fine. */
export async function discardUpload(
  db: Db, fileId: number, filePath: string | null | undefined, outcome: 'completed' | 'failed',
): Promise<void> {
  if (filePath) {
    try { fs.unlinkSync(filePath); }
    catch (e: any) { if (e?.code !== 'ENOENT') console.error(`[ETL:temp] could not delete ${filePath}:`, e.message); }
  }
  await db.query(
    `UPDATE ki_file_uploads SET processing_status = $1, updated_at = now() WHERE id = $2`,
    [outcome, fileId],
  );
}

/**
 * Delete uploads that never reached staging within ETL_UPLOAD_TEMP_TTL_HOURS
 * (uploaded, then abandoned at mapping). Cross-tenant on purpose: this is the
 * temp folder's housekeeping, not a read of anyone's data. A file whose
 * session is still being staged by the worker ('pending') is left alone.
 * Runs on each upload, so there is no timer to supervise.
 */
export async function sweepAbandonedUploads(pool: Pool): Promise<number> {
  const ttl = readEtlConfig().uploadTempTtlHours;
  const r = await pool.query(
    `SELECT f.id, f.file_path
       FROM ki_file_uploads f
      WHERE f.processing_status = 'pending'
        AND f.created_at < now() - make_interval(hours => $1)
        AND NOT EXISTS (SELECT 1 FROM ki_import_sessions s
                         WHERE s.file_upload_id = f.id AND s.status = 'pending')`,
    [ttl],
  );
  for (const row of r.rows as Array<{ id: number; file_path: string }>) {
    await discardUpload(pool, row.id, row.file_path, 'failed');
  }
  if (r.rows.length) console.log(`[ETL:temp] removed ${r.rows.length} upload(s) never staged within ${ttl}h`);
  return r.rows.length;
}

// A load "counts" (blocks the same content) unless every import made from it
// failed or was cancelled. A load with no session at all came from another
// path and counts.
const LOAD_IS_LIVE = `
  (NOT EXISTS (SELECT 1 FROM ki_import_sessions s WHERE s.load_id = l.id)
   OR EXISTS (SELECT 1 FROM ki_import_sessions s
               WHERE s.load_id = l.id AND s.status NOT IN ('failed', 'cancelled')))`;

/** The earlier delivery of this exact content that refuses a new upload, if any. */
export async function blockingLoadFor(
  db: Db, checksum: string, tenantId: string,
): Promise<{ id: number; label: string; loaded_at: string } | null> {
  const r = await db.query(
    `SELECT l.id, l.label, l.loaded_at
       FROM gt_source_loads l
      WHERE l.file_checksum = $1
        AND l.status = 'active'
        AND (l.tenant_id = $2 OR l.tenant_id IS NULL)
        AND ${LOAD_IS_LIVE}
      ORDER BY l.loaded_at DESC
      LIMIT 1`,
    [checksum, tenantId],
  );
  return (r.rows[0] as any) ?? null;
}

/**
 * Retire the active loads of this content whose every import failed, so the
 * unique (tenant, checksum) index lets the new attempt create its load. Their
 * rows stay, labelled by their failed session; a retired load stops
 * contributing to merges (migration 193).
 */
export async function releaseFailedLoads(
  db: Db, checksum: string, loadTenantId: string | null,
): Promise<number> {
  const r = await db.query(
    `UPDATE gt_source_loads l
        SET status = 'retired'
      WHERE l.file_checksum = $1
        AND l.status = 'active'
        AND l.tenant_id IS NOT DISTINCT FROM $2::uuid
        AND NOT ${LOAD_IS_LIVE}`,
    [checksum, loadTenantId],
  );
  return r.rowCount ?? 0;
}
