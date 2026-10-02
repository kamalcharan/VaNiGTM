'use client';
/**
 * The import, through the real ETL — every route the retired /import wizard
 * and /import-dashboard used, on the console's hooks.
 *
 *   upload (multipart) → headers + detection plan → tags → create_session
 *   (relationship, destination, delivery date, tags, mapping, plan) → process
 *
 * and, on a session afterwards: status, records by state with paging, resolve
 * held rows, reprocess failed rows, edit one row and re-queue it, re-count the
 * counters, land staged rows, delete staging.
 *
 * Reads are `useSkillQuery`; every write is `useSkillMutation` (double-submit
 * guard, idempotency key, stale-response drop, a toast either way). The
 * multipart upload is the one call no JSON skill call can carry, so it goes
 * through `apiRequest` with FormData.
 */
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import { IS_LIVE } from '@/lib/live-transport';
import { callSkill, getSkillTransport, useSkillQuery } from '@/lib/useSkill';
import { useSkillMutation } from '@/lib/useSkillMutation';
import { useToast } from '@/platform/feedback';
import type {
  HeadersInfo, ImportSession, ImportTag, LandingResult, LoadList, Relationship, StagedPage, StagedRow,
} from './mock-data';

export interface Uploaded { file_id: number | string; filename: string; size: number; }

export function useUpload() {
  const [isUploading, setUploading] = useState(false);
  const { showToast } = useToast();
  const upload = useCallback(async (file: File): Promise<Uploaded | null> => {
    if (isUploading) return null;
    setUploading(true);
    try {
      if (!IS_LIVE) {
        const t = getSkillTransport();
        const r = await t!('etl', 'upload', { filename: file.name });
        if (!r.success) throw new Error(r.error ?? 'Upload refused');
        return r.data as Uploaded;
      }
      const form = new FormData();
      form.append('file', file);
      form.append('import_type', 'company');
      return await apiRequest<Uploaded>('POST', '/api/v1/etl/upload', { body: form });
    } catch (err) {
      // The server's own words — a 409 ALREADY_IMPORTED names the earlier
      // load, and that is the message, not "upload failed".
      showToast({ message: err instanceof Error ? err.message : 'Upload failed', type: 'error' });
      return null;
    } finally { setUploading(false); }
  }, [isUploading, showToast]);
  return { upload, isUploading };
}

export const useHeaders = (fileId: number | string | null) =>
  useSkillQuery<HeadersInfo>('etl', 'headers', { file_id: fileId ?? '' }, { enabled: fileId != null });

/* ── Tags — they describe the delivery, picked once at import ── */

export const useTags = (enabled = true) => useSkillQuery<{ tags: ImportTag[] }>('etl', 'tags', {}, { enabled });

export function useCreateTag() {
  const qc = useQueryClient();
  const m = useSkillMutation<{ tag: ImportTag | null; existing?: boolean }>('etl', 'create_tag', {
    successMessage: (r) => (r.existing ? `"${r.tag?.label}" already existed — selected it.` : `Tag "${r.tag?.label}" created.`),
    errorMessage: 'Could not create that tag.',
    onSuccess: () => qc.invalidateQueries({ queryKey: ['skill', 'etl', 'tags'] }),
  });
  return { createTag: (label: string, isPlatform: boolean) => m.mutate({ label, is_platform: isPlatform }), busy: m.isPending };
}

/* ── Stage and land — one confirmed action, two calls ── */

export interface LandArgs {
  file_id: number | string;
  filename: string;
  relationship: Relationship;
  mapping: Record<string, string>;
  extraction_plan: unknown;
  tag_ids: number[];
  load_as_of: string | null;
  /** Pool deliveries only: which registered publisher, and what the delivery covers. */
  source_code?: string;
  load_region?: string | null;
}

export interface LandOutcome {
  session: { session_id: number | string; status: string; total_records: number };
  /** Null when landing failed AFTER staging: the rows are staged and safe. */
  result: LandingResult | null;
  landing_error: string | null;
}

export function useLand() {
  const qc = useQueryClient();
  const session = useSkillMutation<{ session_id: number | string; status: string; total_records: number }>('etl', 'create_session', {
    errorMessage: 'Could not stage the file.',
  });
  const process = useSkillMutation<LandingResult>('etl', 'process', {
    successMessage: (r) => `${r.successful.toLocaleString()} landed · ${r.duplicate.toLocaleString()} already here · ${r.conflict.toLocaleString()} held for review · ${r.failed.toLocaleString()} failed`,
    errorMessage: 'Landing failed — the rows ARE staged; nothing is lost.',
    onSuccess: () => qc.invalidateQueries({ queryKey: ['skill'] }),
  });
  // A large CSV is staged by the worker in chunks: the session answers
  // 'staging' at once (HTTP 202) and the rows arrive over seconds or minutes.
  // Landing must wait for the last chunk, so the wizard polls the session and
  // shows how far it has got. Leaving the page does not stop the worker; the
  // session then waits under Imports as "staged", ready to land.
  const [staging, setStaging] = useState<{ staged_rows: number } | null>(null);
  const waitUntilStaged = useCallback(async (sessionId: number | string) => {
    for (;;) {
      await new Promise((r) => setTimeout(r, 3000));
      const st = await callSkill<{ session: { status: string; staged_rows: number | null; total_records: number | null; error_summary: string | null } }>(
        'etl', 'status', { session_id: sessionId });
      setStaging({ staged_rows: Number(st.session.staged_rows ?? 0) });
      if (st.session.status === 'staged') return { ok: true as const, total: Number(st.session.total_records ?? st.session.staged_rows ?? 0) };
      if (st.session.status === 'failed' || st.session.status === 'cancelled') {
        return { ok: false as const, error: st.session.error_summary ?? `Staging ${st.session.status}.` };
      }
    }
  }, []);

  const land = useCallback(async (a: LandArgs): Promise<LandOutcome | null> => {
    const s = await session.mutate({
      file_id: a.file_id,
      import_type: 'company',
      field_mappings: a.mapping,
      relationship: a.relationship,
      // The admin gate on the pool is re-checked server-side from the JWT;
      // this only decides what to ask for.
      destination: a.relationship === 'dataset' ? 'universe_companies' : 'prospects',
      extraction_plan: a.extraction_plan,
      tag_ids: a.tag_ids,
      load_label: a.filename,
      load_as_of: a.load_as_of,
      ...(a.relationship === 'dataset' ? { source_code: a.source_code || 'upload', load_region: a.load_region ?? null } : {}),
    });
    if (!s) return null;
    if (s.status === 'staging') {
      setStaging({ staged_rows: 0 });
      let done;
      try { done = await waitUntilStaged(s.session_id); }
      catch (e) { setStaging(null); return { session: s, result: null, landing_error: `Could not follow the staging: ${(e as Error).message}. The worker carries on — the session is under Imports.` }; }
      setStaging(null);
      if (!done.ok) return { session: { ...s, status: 'failed' }, result: null, landing_error: done.error };
      s.status = 'staged';
      s.total_records = done.total;
    }
    // Staging and landing are ONE action from here on: the person confirmed
    // the import and is not asked to come back and press go again. If the
    // second half fails, the rows are staged — say so, never "import failed".
    const r = await process.mutate({ session_id: s.session_id });
    return { session: s, result: r, landing_error: r ? null : (process.error?.message ?? 'Landing failed') };
  }, [session, process, waitUntilStaged]);
  return { land, isStaging: session.isPending || staging !== null, stagingProgress: staging, isLanding: process.isPending };
}

/* ── Past imports and their rows ── */

export const useImportSessions = () => useSkillQuery<{ sessions: ImportSession[] }>('etl', 'sessions');

export const useSessionStatus = (sessionId: number | string | null) =>
  useSkillQuery<{ session: ImportSession; errors: { row_number: number; error_messages: string[]; mapped_data: Record<string, unknown> }[] }>(
    'etl', 'status', { session_id: sessionId ?? '' }, { enabled: sessionId != null });

export const useStagedRows = (sessionId: number | string | null, status: string, page = 1, limit = 50) =>
  useSkillQuery<StagedPage>('etl', 'records', { session_id: sessionId ?? '', status, page, limit }, { enabled: sessionId != null });

export function useResolve() {
  const qc = useQueryClient();
  const m = useSkillMutation<{ applied: number; skipped: number; conflicts_remaining: number }>('etl', 'resolve_conflicts', {
    successMessage: (r) => `${r.applied} applied${r.skipped ? ` · ${r.skipped} skipped (campaign-locked rows need a per-row decision)` : ''} · ${r.conflicts_remaining} still held`,
    errorMessage: 'Could not apply those decisions.',
    onSuccess: () => qc.invalidateQueries({ queryKey: ['skill'] }),
  });
  return {
    acceptRecommended: (session_id: number | string) => m.mutate({ session_id, accept_recommended: true }),
    decide: (session_id: number | string, decisions: { staging_id: number | string; fields: Record<string, 'take' | 'keep'> }[]) => m.mutate({ session_id, decisions }),
    busy: m.isPending,
  };
}

/** The dashboard's maintenance verbs on one session. */
export function useSessionActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['skill'] });

  const processStaged = useSkillMutation<LandingResult>('etl', 'process', {
    successMessage: (r) => [`${r.successful.toLocaleString()} imported`, r.duplicate ? `${r.duplicate.toLocaleString()} already held` : null, r.conflict ? `${r.conflict.toLocaleString()} need your call` : null, r.failed ? `${r.failed.toLocaleString()} failed` : null].filter(Boolean).join(' · '),
    errorMessage: 'Could not import the staged rows.',
    onSuccess: refresh,
  });
  const reprocess = useSkillMutation<{ reprocessed: number; message: string }>('etl', 'reprocess', {
    successMessage: (r) => (r.reprocessed ? `${r.reprocessed} failed ${r.reprocessed === 1 ? 'row' : 'rows'} re-queued — landing them now.` : 'No failed rows to retry.'),
    errorMessage: 'Could not re-queue the failed rows.',
  });
  const patch = useSkillMutation<{ record: StagedRow }>('etl', 'patch_record', {
    successMessage: 'Row saved and re-queued — land the staged rows to process it.',
    errorMessage: 'Could not save that row.',
    onSuccess: refresh,
  });
  const syncStats = useSkillMutation<{ session: Partial<ImportSession> }>('etl', 'sync_stats', {
    successMessage: 'Counters recounted from the staged rows.',
    errorMessage: 'Could not recount.',
    onSuccess: refresh,
  });
  const deleteStaging = useSkillMutation<{ deleted_records: number }>('etl', 'delete_staging', {
    successMessage: (r) => `Staging cleared — ${r.deleted_records.toLocaleString()} rows removed. What already landed stays.`,
    errorMessage: 'Could not delete the staging rows.',
    onSuccess: refresh,
  });

  /**
   * Retry = re-queue the failed rows, then land the session again. Two calls
   * because they are two routes; if the second fails the rows are pending in
   * staging, which the session row will show as "staged, not landed".
   */
  const retryFailed = useCallback(async (session_id: number | string) => {
    const r = await reprocess.mutate({ session_id });
    if (!r || !r.reprocessed) { refresh(); return r; }
    return processStaged.mutate({ session_id });
  }, [reprocess, processStaged]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    processStaged: (session_id: number | string) => processStaged.mutate({ session_id }),
    retryFailed,
    patchRecord: (session_id: number | string, record_id: number | string, mapped_data: Record<string, unknown>) => patch.mutate({ session_id, record_id, mapped_data }),
    syncStats: (session_id: number | string) => syncStats.mutate({ session_id }),
    deleteStaging: (session_id: number | string) => deleteStaging.mutate({ session_id }),
    busy: processStaged.isPending || reprocess.isPending || patch.isPending || syncStats.isPending || deleteStaging.isPending,
  };
}

/* ── Deliveries — prospect-skill.get_loads, either scope ── */

export const useLoads = (scope: 'mine' | 'pool', enabled = true) =>
  useSkillQuery<LoadList>('prospect-skill', 'get_loads', { scope }, { enabled });
