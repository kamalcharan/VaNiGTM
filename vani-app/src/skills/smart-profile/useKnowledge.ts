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
