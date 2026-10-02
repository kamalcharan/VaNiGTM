'use client';
/**
 * Enriching the common pool, for the console (release 4, prototype
 * documents/prototypes/p2c-pool-enrich.html). Shapes follow pool-skill's
 * workbench / enrich_estimate / start_enrich / enrich_run / withdraw_enrich_run
 * (backend/src/skills/pool-skill/SKILL.md). Admin only on the server.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery } from '@/lib/useSkill';
import { useSkillMutation } from '@/lib/useSkillMutation';
import type { Level } from '@/skills/scoring/useScoring';

export type Levels = Record<Level, number>;
export interface Gap { key: string; label: string; companies: number; filled_by: string; enrich: { raw_or_identified: boolean; industry_missing: boolean } | null }
export interface WbDelivery { id: string; label: string; source_code: string; companies: number; qualified_plus: number; qualified_pct: number; as_of: string | null; loaded_at: string; eligible: number }
export type RunStatus = 'queued' | 'running' | 'finished' | 'stopped' | 'failed' | 'withdrawn';
export interface RunSummary { event_id: string; run_no: number; delivery_label: string; records: number; status: RunStatus; created_at: string; attempted: number; before_avg: number | null; after_avg: number | null }
export interface Workbench {
  total: number; levels: Levels; qualified_plus: number; with_website: number; website_from_email: number;
  profile: { version: number };
  limit: { daily: number; used: number; left: number };
  gaps: Gap[]; deliveries: WbDelivery[]; runs: RunSummary[];
  suggestion: { delivery: string; delivery_label: string; eligible: number; records: number } | null;
}

export interface Slice { delivery: string; raw_or_identified: boolean; industry_missing: boolean }
export interface ProviderLine { code: string; model: string; companies: number; text: string; off: boolean; paid: boolean }
export interface Estimate {
  records: number; limit: { daily: number; used: number; left: number };
  per_company: { high: number; low: number; measured: boolean };
  tokens: number; providers: ProviderLine[]; unplaced: number; minutes: number | null; minutes_measured: boolean;
}
export interface EstimateResult { slice: Slice; matched: number; estimate: Estimate | null }

export interface Snapshot { levels: Levels; avg: number; parts: Record<string, number>; weights: Record<string, number>; n: number }
export interface FeedItem { ts: string; kind: string; text: string; model: string | null; status: string }
export interface RunModel { provider: string; model: string; companies: number; tokens: number; bad: number; quota_spent: boolean }
export interface RunView {
  event_id: string; run_no: number; delivery_label: string; records: number; status: RunStatus;
  created_at: string; started_at: string | null; finished_at: string | null; duration_ms: number | null;
  progress: { done: number; total: number };
  counts: { read: number; js_only: number; not_live: number; abstained: number; failed: number; moved_up: number; unreadable: number; not_reached: number };
  before: Snapshot | null; now: Snapshot | null;
  feed: FeedItem[]; models: RunModel[]; bad_answers: number; tokens: number; paid_tokens: number;
  estimate: Estimate | null; stopped: string | null; stop_requested_at: string | null; error: string | null;
  withdrawn_at: string | null; touched: number; abstained: Array<{ company_id: string; name: string }>;
}

export const useWorkbench = (enabled = true) => useSkillQuery<Workbench>('pool-skill', 'workbench', {}, { enabled });
export const useEnrichEstimate = (slice: Slice, records: number, enabled = true) =>
  useSkillQuery<EstimateResult>('pool-skill', 'enrich_estimate', { ...slice, records }, { enabled });
/** Polls while the run is queued or running; still once it has finished. */
export const useEnrichRun = (eventId: string) =>
  useSkillQuery<{ run: RunView | null; reason?: 'NOT_FOUND' }>('pool-skill', 'enrich_run', { event_id: eventId }, {
    refetchInterval: (q) => {
      const st = (q.state.data as { data?: { run?: RunView | null } } | undefined)?.data?.run?.status;
      return st === 'queued' || st === 'running' ? 3000 : false;
    },
  });

export function useEnrichWrites() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['skill', 'pool-skill'] });
  const start = useSkillMutation<{ event_id: string; run_no: number; records: number }>('pool-skill', 'start_enrich', {
    successMessage: (r) => `Run #${r.run_no} started — ${r.records.toLocaleString('en-US')} companies, on the worker.`,
    errorMessage: 'The run did not start.',
    onSuccess: refresh,
  });
  const withdraw = useSkillMutation<{ run_no: number; companies_rescored: number }>('pool-skill', 'withdraw_enrich_run', {
    successMessage: (r) => `Run #${r.run_no} withdrawn — ${r.companies_rescored.toLocaleString('en-US')} companies re-scored from what was delivered.`,
    errorMessage: 'The run was not withdrawn.',
    onSuccess: refresh,
  });
  const stop = useSkillMutation<{ stopped: 'before_start' | 'requested' }>('pool-skill', 'stop_enrich_run', {
    successMessage: (r) => r.stopped === 'before_start' ? 'Stopped — the run never started; its records are released.' : 'Stopping — the company being read finishes, then the run stops.',
    errorMessage: 'The run was not stopped.',
    onSuccess: refresh,
  });
  return { start, withdraw, stop };
}

export const fmt = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
export const sliceHref = (s: Partial<Slice> & { records?: number }) => {
  const q = new URLSearchParams();
  if (s.delivery) q.set('delivery', s.delivery);
  if (s.raw_or_identified === false) q.set('raw_or_identified', '0');
  if (s.industry_missing) q.set('industry_missing', '1');
  if (s.records) q.set('records', String(s.records));
  const qs = q.toString();
  return `/agents/gtm/pool/enrich${qs ? `?${qs}` : ''}`;
};
export const runHref = (eventId: string) => `/agents/gtm/pool/runs/${eventId}`;
