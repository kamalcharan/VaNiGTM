/**
 * Ingestion Agent
 *
 * Stage 2: method stubs only.
 *
 *   run         — processes a single gt_kb_sources row end-to-end:
 *                 parse → chunk → extract → upsert nodes → emit KNOWLEDGE_UPDATED.
 *                 Triggered by FILE_UPLOADED / URL_SUBMITTED events.
 *   syncFolder  — pulls the tenant's connected Google Drive folder, diffs
 *                 against gt_kb_sources by gdrive_modified_at, and queues
 *                 new/changed files. Triggered by FOLDER_CONNECTED or by
 *                 the scheduler.
 */

import type { Pool } from 'pg';

export class IngestionAgent {
  static async run(
    _pool: Pool,
    _tenantId: string,
    _payload: Record<string, unknown>,
    _runId: string,
  ): Promise<void> {
    throw new Error('NOT_IMPLEMENTED');
  }

  static async syncFolder(_pool: Pool, _tenantId: string): Promise<void> {
    throw new Error('NOT_IMPLEMENTED');
  }
}
