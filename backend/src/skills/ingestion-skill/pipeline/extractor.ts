/**
 * Extractor — per-chunk LLM call that pulls <extract> (nodes) and
 * <relate> (relationships) tags out of the VPS LLM response and dedupes
 * across chunks.
 *
 * - One LLM call per chunk (max 800 output tokens).
 * - <extract> tags are JSON-parsed and validated (label, name, description
 *   all present and non-empty). Malformed tags are skipped silently — the
 *   LLM sometimes emits broken JSON, and one bad tag must not poison the run.
 * - <relate> tags connect two extracted nodes ("Label:Name" endpoints) with
 *   one of the fixed relationship types — this is what makes the knowledge
 *   a GRAPH instead of a tag list. Unknown types are dropped.
 * - Per-page provenance: chunks carry the source_url of the page they came
 *   from; every node extracted from that chunk gets properties.source_url,
 *   so future agents can cite where a fact came from.
 * - Cross-chunk dedup key: `${label}:${name}` lowercased. First occurrence
 *   wins for nodes; relations dedupe on from+type+to.
 * - Chunk-level failures (LLM unreachable, token budget exceeded, etc.)
 *   are logged and skipped. Never throws — partial results are better
 *   than nothing on a multi-chunk doc.
 */

import { callLLM } from '../../../agent-core/llm.client';
import type { Pool } from 'pg';
import type { Chunk } from './chunker';

export interface SourcedChunk extends Chunk {
  /** URL of the page this chunk came from (null for pasted text / files). */
  source_url?: string | null;
}

export interface ExtractedNode {
  label: string;
  name: string;
  description: string;
  properties: Record<string, unknown>;
}

export interface ExtractedRelation {
  /** "Label:Name" of the from-node as emitted in an <extract> tag */
  from: string;
  type: string;
  /** "Label:Name" of the to-node */
  to: string;
}

export interface ExtractionResult {
  nodes: ExtractedNode[];
  relations: ExtractedRelation[];
}

const RELATION_TYPES = new Set([
  'HAS_FEATURE', 'TARGETS', 'FEELS', 'ADDRESSES', 'SOLVES',
  'DIFFERENTIATES_FROM', 'BUILT_BY', 'PROVES',
]);

const EXTRACTION_PROMPT = `You are a knowledge extraction system for a GTM platform.
Extract product and GTM knowledge from the text below.

For each distinct insight, output:
<extract>{"label":"Product|Feature|ICP|UseCase|PainPoint|Differentiator|Team|Competitor|CaseStudy|Metric|Industry|Pricing","name":"short unique name","description":"one clear sentence","properties":{}}</extract>

For relationships BETWEEN insights you extracted, output:
<relate>{"from":"Label:Name","type":"HAS_FEATURE|TARGETS|FEELS|ADDRESSES|SOLVES|DIFFERENTIATES_FROM|BUILT_BY|PROVES","to":"Label:Name"}</relate>

Label guidance:
- CaseStudy: a named customer story or engagement outcome
- Metric: a specific number/result (e.g. "73% downtime reduction")
- Industry: a vertical the company serves or targets
- Pricing: pricing model, tiers, or cost positioning
Relationship guidance:
- Metric/CaseStudy PROVES a Differentiator or Product claim
- Product TARGETS an ICP or Industry; ICP FEELS a PainPoint
- Product/Feature SOLVES or ADDRESSES a PainPoint or UseCase

Rules:
- One <extract> per insight. Multiple allowed. <relate> only between insights you extracted.
- Only extract what is explicitly stated. Never infer.
- Skip generic statements. Specific knowledge only.
- If nothing useful in this chunk, output nothing.`;

export async function extractFromChunks(
  pool: Pool,
  tenantId: string,
  runId: string,
  chunks: SourcedChunk[],
): Promise<ExtractionResult> {
  const nodes: ExtractedNode[] = [];
  const relations: ExtractedRelation[] = [];
  const seenNodes = new Set<string>();
  const seenRelations = new Set<string>();

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

      const nodeMatches = [...result.text.matchAll(/<extract>([\s\S]*?)<\/extract>/g)];
      for (const match of nodeMatches) {
        let parsed: Partial<ExtractedNode>;
        try {
          parsed = JSON.parse(match[1]) as Partial<ExtractedNode>;
        } catch {
          continue; // malformed JSON inside the tag — skip silently
        }

        if (
          typeof parsed.label       === 'string' && parsed.label.length       > 0
          && typeof parsed.name        === 'string' && parsed.name.length        > 0
          && typeof parsed.description === 'string' && parsed.description.length > 0
        ) {
          const key = `${parsed.label}:${parsed.name}`.toLowerCase();
          if (!seenNodes.has(key)) {
            seenNodes.add(key);
            nodes.push({
              label:       parsed.label,
              name:        parsed.name,
              description: parsed.description,
              properties:  {
                ...((parsed.properties as Record<string, unknown>) ?? {}),
                ...(chunk.source_url ? { source_url: chunk.source_url } : {}),
              },
            });
          }
        }
      }

      const relMatches = [...result.text.matchAll(/<relate>([\s\S]*?)<\/relate>/g)];
      for (const match of relMatches) {
        let parsed: Partial<ExtractedRelation>;
        try {
          parsed = JSON.parse(match[1]) as Partial<ExtractedRelation>;
        } catch {
          continue;
        }

        if (
          typeof parsed.from === 'string' && parsed.from.includes(':')
          && typeof parsed.to === 'string' && parsed.to.includes(':')
          && typeof parsed.type === 'string' && RELATION_TYPES.has(parsed.type)
        ) {
          const key = `${parsed.from}|${parsed.type}|${parsed.to}`.toLowerCase();
          if (!seenRelations.has(key)) {
            seenRelations.add(key);
            relations.push({ from: parsed.from, type: parsed.type, to: parsed.to });
          }
        }
      }
    } catch (err) {
      console.warn(`[Ingestion] Chunk ${chunk.index} extraction failed:`, err);
    }
  }

  return { nodes, relations };
}
