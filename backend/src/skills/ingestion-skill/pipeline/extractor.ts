/**
 * Extractor — per-chunk LLM call that pulls <extract> tags out of the
 * VPS LLM response and dedupes nodes across chunks.
 *
 * - One LLM call per chunk (max 800 output tokens).
 * - Each chunk's response is scanned for <extract>{...}</extract> tags.
 * - Each tag is JSON-parsed and validated (label, name, description all
 *   present and non-empty). Malformed tags are skipped silently — the LLM
 *   sometimes emits broken JSON, and one bad tag must not poison the run.
 * - Cross-chunk dedup key: `${label}:${name}` lowercased. First occurrence
 *   wins.
 * - Chunk-level failures (LLM unreachable, token budget exceeded, etc.)
 *   are logged and skipped. Never throws — partial results are better
 *   than nothing on a multi-chunk doc.
 */

import { callLLM } from '../../../agent-core/llm.client';
import type { Pool } from 'pg';
import type { Chunk } from './chunker';

export interface ExtractedNode {
  label: string;
  name: string;
  description: string;
  properties: Record<string, unknown>;
}

const EXTRACTION_PROMPT = `You are a knowledge extraction system for a GTM platform.
Extract product and GTM knowledge from the text below.

For each distinct insight, output:
<extract>{"label":"Product|Feature|ICP|UseCase|PainPoint|Differentiator|Team|Competitor","name":"short unique name","description":"one clear sentence","properties":{}}</extract>

Rules:
- One <extract> per insight. Multiple allowed.
- Only extract what is explicitly stated. Never infer.
- Skip generic statements. Specific knowledge only.
- If nothing useful in this chunk, output nothing.`;

export async function extractFromChunks(
  pool: Pool,
  tenantId: string,
  runId: string,
  chunks: Chunk[],
): Promise<ExtractedNode[]> {
  const nodes: ExtractedNode[] = [];
  const seen = new Set<string>();

  for (const chunk of chunks) {
    try {
      const result = await callLLM({
        tenantId,
        pool,
        runId,
        system:    EXTRACTION_PROMPT,
        messages:  [{ role: 'user', content: chunk.text }],
        maxTokens: 800,
      });

      const matches = [...result.text.matchAll(/<extract>([\s\S]*?)<\/extract>/g)];

      for (const match of matches) {
        let parsed: Partial<ExtractedNode>;
        try {
          parsed = JSON.parse(match[1]) as Partial<ExtractedNode>;
        } catch {
          // Malformed JSON inside the tag — skip silently.
          continue;
        }

        if (
          typeof parsed.label       === 'string' && parsed.label.length       > 0
          && typeof parsed.name        === 'string' && parsed.name.length        > 0
          && typeof parsed.description === 'string' && parsed.description.length > 0
        ) {
          const key = `${parsed.label}:${parsed.name}`.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            nodes.push({
              label:       parsed.label,
              name:        parsed.name,
              description: parsed.description,
              properties:  (parsed.properties as Record<string, unknown>) ?? {},
            });
          }
        }
      }
    } catch (err) {
      console.warn(`[Ingestion] Chunk ${chunk.index} extraction failed:`, err);
    }
  }

  return nodes;
}
