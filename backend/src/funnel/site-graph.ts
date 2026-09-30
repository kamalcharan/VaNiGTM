/**
 * The visitor's homepage as a knowledge graph — "this is your data" on
 * vani.vikuna.io (design-notes-landing.md B2).
 *
 * The SAME extraction ingestion runs (chunker, EXTRACTION_PROMPT,
 * extractFromChunks, the same chunk size) — only it writes nothing: the
 * result is returned and stored with the read, and reaches a tenant's
 * knowledge graph only when a signed-up visitor claims it (claimSite).
 *
 * Cost: at most FUNNEL_GRAPH_MAX_CHUNKS model calls per NEW read, spent under
 * the funnel system tenant, so its daily cap applies. When the page has more
 * text than that, the graph says it came from the first part of the page.
 *
 * Rule 12: no nodes is a failure with its reason, never an empty graph
 * passed off as a read one; a cut-off answer is marked `truncated`.
 */
import type { Pool } from 'pg';
import { charBudgetFor } from '../agent-core/llm.gate';
import { chunkText } from '../skills/ingestion-skill/pipeline/chunker';
import {
  EXTRACT_CHUNK_CAP, EXTRACTION_PROMPT, extractFromChunks, extractMaxTokens, type SourcedChunk,
} from '../skills/ingestion-skill/pipeline/extractor';

export interface GraphNode { id: string; label: string; name: string; description: string | null; properties: Record<string, unknown> }
export interface GraphEdge { id: string; from_node_id: string; to_node_id: string; relationship: string }

export type SiteGraph =
  | { status: 'read'; nodes: GraphNode[]; edges: GraphEdge[]; truncated: boolean; chunks_read: number; chunks_total: number }
  | { status: 'failed'; failure: string };

export async function readSiteGraph(
  pool: Pool, tenantId: string, runId: string, text: string, pageUrl: string, maxChunks: number,
): Promise<SiteGraph> {
  const room = charBudgetFor(undefined, extractMaxTokens(), EXTRACTION_PROMPT);
  if (room < 400) {
    return { status: 'failed', failure: 'VaNi’s model window is too small to read this page into a graph right now.' };
  }
  const all: SourcedChunk[] = chunkText(text, Math.min(EXTRACT_CHUNK_CAP, room)).map((c) => ({ ...c, source_url: pageUrl }));
  const chunks = all.slice(0, maxChunks);
  if (!chunks.length) return { status: 'failed', failure: 'There was no text on this page to build a graph from.' };

  const { nodes, relations, truncatedChunks } = await extractFromChunks(pool, tenantId, runId, chunks);
  if (!nodes.length) {
    return { status: 'failed', failure: 'VaNi found nothing specific enough on this page to build a graph from.' };
  }

  // Local ids for the page; the claim re-keys them into the tenant's graph.
  const ids = new Map<string, string>();
  const out: GraphNode[] = nodes.map((n, i) => {
    const id = `n${i + 1}`;
    ids.set(`${n.label}:${n.name}`.toLowerCase(), id);
    return { id, label: n.label, name: n.name, description: n.description || null, properties: n.properties ?? {} };
  });
  const edges: GraphEdge[] = [];
  for (const r of relations) {
    const from = ids.get(r.from.toLowerCase());
    const to = ids.get(r.to.toLowerCase());
    if (from && to && from !== to) edges.push({ id: `e${edges.length + 1}`, from_node_id: from, to_node_id: to, relationship: r.type });
  }
  return {
    status: 'read', nodes: out, edges,
    truncated: truncatedChunks.length > 0,
    chunks_read: chunks.length, chunks_total: all.length,
  };
}
