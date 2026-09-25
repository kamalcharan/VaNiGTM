'use client';
/**
 * The tenant's own list, through the real ETL: upload (multipart) → headers
 * and a suggested mapping → a session with the mapping the human confirmed →
 * process, which lands unambiguous rows in gt_prospects and holds genuine
 * clashes for review. Station 2 of G1 in the upload posture; the 2,016-line
 * import destination becomes one step here.
 */
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import { IS_LIVE } from '@/lib/live-transport';
import { getSkillTransport, useSkillQuery } from '@/lib/useSkill';
import { useSkillMutation } from '@/lib/useSkillMutation';
import { useToast } from '@/platform/feedback';
import type { HeadersInfo, ImportSession, LandingResult, StagedRow } from './mock-data';

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
      showToast({ message: err instanceof Error ? err.message : 'Upload failed', type: 'error' });
      return null;
    } finally { setUploading(false); }
  }, [isUploading, showToast]);
  return { upload, isUploading };
}

export const useHeaders = (fileId: number | string | null) =>
  useSkillQuery<HeadersInfo>('etl', 'headers', { file_id: fileId ?? '' }, { enabled: fileId != null });

export function useLand() {
  const qc = useQueryClient();
  const session = useSkillMutation<{ session_id: number | string; status: string; total_records: number }>('etl', 'create_session', { errorMessage: 'Could not stage the file.' });
  const process = useSkillMutation<LandingResult>('etl', 'process', {
    successMessage: (r) => `${r.successful} landed · ${r.duplicate} already here · ${r.conflict} held for review · ${r.failed} failed`,
    errorMessage: 'Landing failed — the rows ARE staged; nothing is lost.',
    onSuccess: () => qc.invalidateQueries({ queryKey: ['skill'] }),
  });
  const land = useCallback(async (args: { file_id: number | string; filename: string; mapping: Record<string, string>; extraction_plan: unknown }) => {
    const s = await session.mutate({ file_id: args.file_id, import_type: 'company', field_mappings: args.mapping, relationship: 'dataset', destination: 'prospects', extraction_plan: args.extraction_plan, load_label: args.filename, tag_ids: [] });
    if (!s) return null;
    return process.mutate({ session_id: s.session_id });
  }, [session, process]);
  return { land, isLanding: session.isPending || process.isPending };
}

/* ── The review half: past imports, and the rows a load held for a person ── */

export const useImportSessions = () => useSkillQuery<{ sessions: ImportSession[] }>('etl', 'sessions');

export const useStagedRows = (sessionId: number | string | null, status: string) =>
  useSkillQuery<{ records: StagedRow[]; total: number }>('etl', 'records', { session_id: sessionId ?? '', status, limit: 100 }, { enabled: sessionId != null });

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
