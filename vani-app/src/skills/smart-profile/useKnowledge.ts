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
 * Reads go to `GET /ingest/sources` (raw_text omitted — it can be large).
 * Writes go through useSkillMutation via the transport's `ingest.*` entries:
 * a URL → URL_SUBMITTED, pasted text → FILE_UPLOADED, and the worker's
 * ingestion agent does the rest, then KNOWLEDGE_UPDATED recalculates the
 * profile. While any source is still being read the list polls, so the row
 * moves from "reading" to "read · N entries" without a reload.
 */
import { useCallback } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import type { SkillResult } from '@/lib/useSkill';
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

const KEY = ['smart-profile', 'sources'] as const;

export const isReading = (s: KbSource) => s.status === 'pending' || s.status === 'processing';

export function useSourcesRead(): UseQueryResult<SkillResult<KbSource[]>, Error> {
  return useQuery<SkillResult<KbSource[]>, Error>({
    queryKey: KEY,
    queryFn: async () => {
      const raw = await apiFetch<{ sources?: KbSource[] }>(API.ingest.listSources, {
        queryParams: { limit: '100' },
      });
      return { success: true, skill: 'smart-profile', function: 'sources', data: raw?.sources ?? [] };
    },
    // The ingestion agent takes seconds to minutes per source. Poll only while
    // something is in flight; a finished list asks nothing.
    refetchInterval: (q) => (q.state.data?.data?.some(isReading) ? 4000 : false),
  });
}

export function useTeach() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: KEY });

  const url = useSkillMutation<{ source_id: string }>('ingest', 'submit_url', {
    successMessage: 'Reading it now. The row updates as VaNi gets through it.',
    errorMessage: 'Could not submit that URL.',
    onSuccess: refresh,
  });
  const text = useSkillMutation<{ source_id: string }>('ingest', 'submit_text', {
    successMessage: 'Reading it now. The row updates as VaNi gets through it.',
    errorMessage: 'Could not submit that text.',
    onSuccess: refresh,
  });
  const del = useSkillMutation<{ deleted: boolean }>('ingest', 'delete_source', {
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
  const remove = useCallback((id: string) => del.mutate({ id }), [del]);

  return { submitUrl, submitText, remove, isBusy: url.isPending || text.isPending || del.isPending };
}
