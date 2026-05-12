/**
 * Extractor — per-chunk LLM call that pulls <extract> tags out of the
 * VPS LLM response and dedupes nodes across chunks.
 * Stage 2: stub only.
 */

import type { Pool } from 'pg';
import type { Chunk } from './chunker';

export interface ExtractedNode {
  label: string;
  name: string;
  description: string;
  properties: Record<string, unknown>;
}

export async function extractFromChunks(
  _pool: Pool,
  _tenantId: string,
  _runId: string,
  _chunks: Chunk[],
): Promise<ExtractedNode[]> {
  throw new Error('NOT_IMPLEMENTED');
}
