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
