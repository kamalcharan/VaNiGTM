'use client';
/**
 * Knowledge — what VaNi has read, and the door to add to it.
 *
 * The graph is already fed (the wizard's crawl, competitor research) and
 * already read (profile projection, research, the storyteller). What did not
 * exist was any way to CHECK what was fed, or to add to it after the wizard
 * (Charan, 2026-09-22). This is that: `gt_kb_sources` listed as sources, not
 * as a graph — a graph viewer is deliberately not built.
 *
 * Everything goes through ingestion-skill's functions on the generic runner
 * (list_sources / submit_url / submit_text / delete_source) — the /ingest
 * REST router is not on the surface nginx exposes to the console, and the
 * skill runner is. A URL → URL_SUBMITTED, pasted text → FILE_UPLOADED, the
 * worker's ingestion agent does the rest, then KNOWLEDGE_UPDATED recalculates
 * the profile. While any source is still being read the list polls, so the row
 * moves from "reading" to "read · N entries" without a reload.
 */
import { useCallback } from 'react';
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useSkillQuery, type SkillResult } from '@/lib/useSkill';
import { useSkillMutation } from '@/lib/useSkillMutation';

export type SourceStatus = 'pending' | 'processing' | 'complete' | 'error';

export interface KbSource {
  id: string;
  /** 'url' | 'txt' | 'gdrive' | file kinds the pipeline records. */
  source_type: string;
  display_name: string;
  /** The page, for url sources; null for files and pasted text. */
  url?: string | null;
  status: SourceStatus;
  chunk_count: number | null;
  node_count: number | null;
  error_msg: string | null;
  created_at: string;
  updated_at: string;
}

export const isReading = (s: KbSource) => s.status === 'pending' || s.status === 'processing';

export function useSourcesRead(): UseQueryResult<SkillResult<KbSource[]>, Error> {
  return useSkillQuery<{ sources: KbSource[] }>('ingestion-skill', 'list_sources', { limit: 100 }, {
    // The ingestion agent takes seconds to minutes per source. Poll only while
    // something is in flight; a finished list asks nothing.
    refetchInterval: (q) => (q.state.data?.data?.sources?.some(isReading) ? 4000 : false),
    select: (r) => ({ ...r, data: r.data?.sources ?? [] }) as unknown as SkillResult<{ sources: KbSource[] }>,
  }) as unknown as UseQueryResult<SkillResult<KbSource[]>, Error>;
}

export function useTeach() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['skill', 'ingestion-skill'] });

  const url = useSkillMutation<{ source_id: string }>('ingestion-skill', 'submit_url', {
    successMessage: 'Reading it now. The row updates as VaNi gets through it.',
    errorMessage: 'Could not submit that URL.',
    onSuccess: refresh,
  });
  const text = useSkillMutation<{ source_id: string }>('ingestion-skill', 'submit_text', {
    successMessage: 'Reading it now. The row updates as VaNi gets through it.',
    errorMessage: 'Could not submit that text.',
    onSuccess: refresh,
  });
  const del = useSkillMutation<{ deleted: boolean }>('ingestion-skill', 'delete_source', {
    // The server deletes the source row only — gt_kg_nodes survives on
    // purpose, because the tenant may have confirmed or edited what was
    // learned. The toast says so, or "remove" reads as "unlearn".
    successMessage: 'Source removed. What VaNi learned from it stays.',
    errorMessage: 'Could not remove that source.',
    onSuccess: refresh,
  });

  const submitUrl = useCallback((value: string) => url.mutate({ url: value }), [url]);
  const submitText = useCallback(
    (value: string, title: string) => text.mutate({ text: value, title }),
    [text],
  );
  const remove = useCallback((id: string) => del.mutate({ source_id: id }), [del]);

  return { submitUrl, submitText, remove, isBusy: url.isPending || text.isPending || del.isPending };
}

/* ── What VaNi knows: the graph as a list (ingestion-skill.knowledge, REAL) ── */

export interface KgNode {
  id: string;
  label: string;
  name: string;
  description: string | null;
  properties: Record<string, unknown>;
  updated_at: string;
  /** The source it was read from; null when it came from the conversation. */
  source_id: string | null;
  source_name: string | null;
  source_type: string | null;
}
export interface KgEdge { id: string; from_node_id: string; to_node_id: string; relationship: string; created_at: string; }
export interface Knowledge { nodes: KgNode[]; filtered_total: number; labels: { label: string; count: number }[]; edges: KgEdge[]; total: number; }

/** Relationship types as a verb phrase, so an edge reads as a sentence. */
export const RELATION_WORDS: Record<string, string> = {
  HAS_FEATURE: 'has the capability', TARGETS: 'targets', FEELS: 'feels', ADDRESSES: 'addresses', SOLVES: 'solves',
  DIFFERENTIATES_FROM: 'differs from', BUILT_BY: 'is built by', PROVES: 'proves',
};

/** Kinds in the order a person reads them, with plain words. */
export const KIND_LABELS: Record<string, string> = {
  Product: 'What you sell', Feature: 'Capabilities', ICP: 'Who you sell to', UseCase: 'Use cases', PainPoint: 'Problems you solve',
  Differentiator: 'Why you', Team: 'Team', Competitor: 'Competitors', CaseStudy: 'Proof', Metric: 'Numbers', Industry: 'Industries', Pricing: 'Pricing',
};

/** `reading` = a source is still being read; the graph is re-read while it is, and once more after. */
export const useKnowledgeGraph = (label: string | null, reading: boolean) =>
  useSkillQuery<Knowledge>('ingestion-skill', 'knowledge', { limit: 300, ...(label ? { label } : {}) }, {
    refetchInterval: reading ? 4000 : false,
  });

/* ── Runs parked on a failover decision (llm-provider-skill, REAL) ─────────
 * With HAIKU_DEFAULT=false a platform-model failure parks the run instead
 * of spending Vikuna's Anthropic key on its own. Someone has to say yes or
 * no; until now that someone had only the CLI. */

export interface PendingFailover {
  run_id: string;
  agent: string;
  asked_at: string;
  failover_model: string | null;
  /** The server's own words — "cannot reach" and "context size exceeded" are different outages. */
  vps_error: string | null;
  question: string | null;
}
export interface PendingFailovers { runs: PendingFailover[]; detail: string; }

export const useFailovers = () => useSkillQuery<PendingFailovers>('llm-provider-skill', 'pending_failovers');

export function useResolveFailover() {
  const qc = useQueryClient();
  const m = useSkillMutation<{ ok: boolean; approved?: boolean; event_id?: string; reason?: string; detail: string }>('llm-provider-skill', 'resolve_failover', {
    successMessage: (r) => (r.ok ? (r.approved ? 'Approved — the run is re-queued on the failover model. This one costs money.' : 'Declined. The run is failed with its real cause; nothing spent.') : r.detail),
    errorMessage: 'Could not record that decision.',
    onSuccess: () => qc.invalidateQueries({ queryKey: ['skill'] }),
  });
  return { resolve: (run_id: string, approve: boolean) => m.mutate({ run_id, approve }), busy: m.isPending };
}

/* ── A person corrects the graph (ingestion-skill.update_node / delete_node, REAL) ── */

export function useNodeWrites() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['skill', 'ingestion-skill'] });
  const update = useSkillMutation<{ node: KgNode }>('ingestion-skill', 'update_node', {
    successMessage: 'Saved. Your wording stays even when the page is read again.',
    errorMessage: 'Could not save that change.',
    onSuccess: refresh,
  });
  const remove = useSkillMutation<{ deleted: boolean; edges_removed: number }>('ingestion-skill', 'delete_node', {
    successMessage: (r) => (r.edges_removed ? `Removed, with ${r.edges_removed} ${r.edges_removed === 1 ? 'relationship' : 'relationships'}.` : 'Removed.'),
    errorMessage: 'Could not remove that entry.',
    onSuccess: refresh,
  });
  return {
    update: (node_id: string, patch: { name?: string; description?: string }) => update.mutate({ node_id, ...patch }),
    remove: (node_id: string) => remove.mutate({ node_id }),
    busy: update.isPending || remove.isPending,
  };
}
