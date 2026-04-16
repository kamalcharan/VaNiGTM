'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery, useSkillMutation } from './useSkill';

/* ── Types ──────────────────────────────────────────────────────────────────── */

export interface PulseItem {
  id:             number;
  pulse_type:     string;
  origin:         'system' | 'manual';
  status:         'open' | 'snoozed' | 'done' | 'dismissed';
  priority:       'high' | 'medium' | 'low';
  title:          string;
  body:           string | null;
  notes:          string | null;
  due_date:       string | null;
  snoozed_until:  string | null;
  snapshot_id:    number | null;
  assigned_to:    string | null;
  completed_at:   string | null;
  completed_by:   string | null;
  created_at:     string;
  expires_at:     string | null;
  contact_id:     number | null;
  contact_name:   string | null;
  contact_prefix: string | null;
  client_id:      number | null;
  client_name:    string | null;
  client_prefix:  string | null;
  subject_name:   string | null;
  subject_prefix: string | null;
}

export interface ListPulsesParams {
  contact_id?:  number;
  client_id?:   number;
  status?:      'open' | 'snoozed' | 'done' | 'dismissed';
  origin?:      'system' | 'manual';
  pulse_type?:  string;
  limit?:       number;
  offset?:      number;
}

export interface CreatePulseParams {
  pulse_type:   'prospect_followup' | 'client_followup';
  title:        string;
  body?:        string;
  priority?:    'high' | 'medium' | 'low';
  due_date?:    string;
  notes?:       string;
  contact_id?:  number;
  client_id?:   number;
  snapshot_id?: number;
  assigned_to?: string;
}

export interface UpdatePulseParams {
  id:              number;
  status?:         'open' | 'snoozed' | 'done' | 'dismissed';
  priority?:       'high' | 'medium' | 'low';
  title?:          string;
  body?:           string;
  notes?:          string;
  due_date?:       string;
  snoozed_until?:  string;
  assigned_to?:    string;
  clear_due_date?: boolean;
  clear_snooze?:   boolean;
}

/* ── Query key factory ───────────────────────────────────────────────────────── */

export const pulseKeys = {
  all:    (params: ListPulsesParams) => ['skill', 'pulse-skill', 'list_pulses', params] as const,
  counts: ()                         => ['skill', 'pulse-skill', 'list_pulses', { status: 'open', limit: 1 }] as const,
};

/* ── Hooks ───────────────────────────────────────────────────────────────────── */

export function usePulses(params: ListPulsesParams = {}) {
  return useSkillQuery<{ pulses: PulseItem[]; total: number }>(
    'pulse-skill', 'list_pulses', params as Record<string, unknown>,
  );
}

export function useCreatePulse(
  onSuccess?: (pulse: PulseItem) => void,
  onError?: (msg: string) => void,
) {
  const qc = useQueryClient();
  const m = useSkillMutation<{ pulse: PulseItem }>('pulse-skill', 'create_pulse');

  function mutate(params: Record<string, unknown>) {
    m.mutate(params, {
      onSuccess(res) {
        void qc.invalidateQueries({ queryKey: ['skill', 'pulse-skill'] });
        onSuccess?.(res.data.pulse);
      },
      onError(err) {
        onError?.(err.message || 'Failed to create follow-up');
      },
    });
  }

  return { ...m, mutate };
}

export function useUpdatePulse(
  onSuccess?: (pulse: PulseItem) => void,
  onError?: (msg: string) => void,
) {
  const qc = useQueryClient();
  const m = useSkillMutation<{ pulse: PulseItem }>('pulse-skill', 'update_pulse');

  function mutate(params: Record<string, unknown>) {
    m.mutate(params, {
      onSuccess(res) {
        void qc.invalidateQueries({ queryKey: ['skill', 'pulse-skill'] });
        onSuccess?.(res.data.pulse);
      },
      onError(err) {
        onError?.(err.message || 'Failed to update follow-up');
      },
    });
  }

  return { ...m, mutate };
}

/* ── Session types ───────────────────────────────────────────────────────────── */

export interface PulseConfig {
  id:                number;
  client_id:         number;
  contact_id:        number | null;
  frequency:         'monthly' | 'bimonthly' | 'quarterly' | 'custom';
  custom_days:       number | null;
  template:          string;
  medium:            string;
  preferred_day:     string | null;
  preferred_time:    string | null;
  jtd_auto_schedule: boolean;
  vani_auto_brief:   boolean;
  vani_include_gaps: boolean;
  client_reminder:   boolean;
  assigned_to:       string | null;
  is_active:         boolean;
  created_at:        string;
  updated_at:        string;
}

export interface PulseSessionAction {
  id:           number;
  text:         string;
  owner_type:   'mfd' | 'client' | 'auto';
  due_date:     string | null;
  status:       'open' | 'done' | 'cancelled';
  completed_at: string | null;
}

export interface PulseHistoryItem {
  id:                number;
  config_id:         number | null;
  client_id:         number;
  scheduled_at:      string;
  started_at:        string | null;
  ended_at:          string | null;
  duration_minutes:  number | null;
  status:            'scheduled' | 'prep_ready' | 'in_progress' | 'completed' | 'missed' | 'cancelled';
  template:          string;
  medium:            string;
  meeting_notes:     string | null;
  vani_summary:      string | null;
  summary_confirmed: boolean;
  report_generated:  boolean;
  next_session_id:   number | null;
  assigned_to:       string | null;
  created_at:        string;
  actions:           PulseSessionAction[];
  gap_count:         number;
}

export interface PulseQueueStats {
  overdue_count:       number;
  due_this_week_count: number;
  upcoming_count:      number;
  completed_ytd:       number;
  total_configs:       number;
}

/* ── Session hooks ───────────────────────────────────────────────────────────── */

export function usePulseConfig(clientId: number | null | undefined) {
  return useSkillQuery<{ config: PulseConfig | null }>(
    'pulse-skill', 'get_pulse_config',
    { client_id: clientId } as Record<string, unknown>,
    { enabled: !!clientId },
  );
}

export function useClientPulseHistory(
  clientId: number | null | undefined,
  params: { limit?: number; offset?: number } = {},
) {
  return useSkillQuery<{ sessions: PulseHistoryItem[]; total: number }>(
    'pulse-skill', 'get_client_pulse_history',
    { client_id: clientId, ...params } as Record<string, unknown>,
    { enabled: !!clientId },
  );
}

export function useUpsertPulseConfig(
  onSuccess?: (config: PulseConfig) => void,
  onError?: (msg: string) => void,
) {
  const qc = useQueryClient();
  const m = useSkillMutation<{ config: PulseConfig }>('pulse-skill', 'upsert_pulse_config');

  function mutate(params: Record<string, unknown>) {
    m.mutate(params, {
      onSuccess(res) {
        void qc.invalidateQueries({ queryKey: ['skill', 'pulse-skill'] });
        onSuccess?.(res.data.config);
      },
      onError(err) {
        onError?.(err.message || 'Failed to save pulse config');
      },
    });
  }

  return { ...m, mutate };
}

export function useCreatePulseSession(
  onSuccess?: () => void,
  onError?: (msg: string) => void,
) {
  const qc = useQueryClient();
  const m = useSkillMutation<{ session: PulseHistoryItem }>('pulse-skill', 'create_pulse_session');

  function mutate(params: Record<string, unknown>) {
    m.mutate(params, {
      onSuccess() {
        void qc.invalidateQueries({ queryKey: ['skill', 'pulse-skill'] });
        onSuccess?.();
      },
      onError(err) {
        onError?.(err.message || 'Failed to create session');
      },
    });
  }

  return { ...m, mutate };
}

export function useUpdatePulseSession(
  onSuccess?: () => void,
  onError?: (msg: string) => void,
) {
  const qc = useQueryClient();
  const m = useSkillMutation<{ session: PulseHistoryItem }>('pulse-skill', 'update_pulse_session');

  function mutate(params: Record<string, unknown>) {
    m.mutate(params, {
      onSuccess() {
        void qc.invalidateQueries({ queryKey: ['skill', 'pulse-skill'] });
        onSuccess?.();
      },
      onError(err) {
        onError?.(err.message || 'Failed to update session');
      },
    });
  }

  return { ...m, mutate };
}
