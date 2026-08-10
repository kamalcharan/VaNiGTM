'use client';

import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery, useSkillMutation } from '@/hooks/useSkill';
import { useToast } from '@/components/toast';
import { VdfLoader, VdfEmptyState, VdfButton, VdfStatusBadge, VdfSearchBar } from '@/components/vdf';
import s from '../campaign-detail.module.css';

/* ── Types ───────────────────────────────────────────── */

interface PipelineContact {
  assignment_id: number;
  contact_id: number;
  stage: string;
  score: number;
  contact_name: string;
  prefix: string;
  contact_no: string | null;
  primary_mobile: string | null;
  primary_email: string | null;
  first_contacted_at: string | null;
  last_activity_at: string | null;
}

interface PipelineStats {
  total: number;
  identified: number;
  contacted: number;
  engaged: number;
  interested: number;
  qualified: number;
  converted: number;
  lost: number;
}

const STAGES = [
  { id: 'all',        label: 'All' },
  { id: 'identified', label: 'Identified' },
  { id: 'contacted',  label: 'Contacted' },
  { id: 'engaged',    label: 'Engaged' },
  { id: 'interested', label: 'Interested' },
  { id: 'qualified',  label: 'Qualified' },
  { id: 'converted',  label: 'Converted' },
  { id: 'lost',       label: 'Lost' },
] as const;

const STAGE_BADGE: Record<string, { variant: 'success' | 'warning' | 'danger' | 'info' | 'muted' }> = {
  identified: { variant: 'muted' },
  contacted:  { variant: 'info' },
  engaged:    { variant: 'info' },
  interested: { variant: 'warning' },
  qualified:  { variant: 'success' },
  converted:  { variant: 'success' },
  lost:       { variant: 'danger' },
};

const PAGE_SIZE = 50;

/* ── Component ───────────────────────────────────────── */

export function ContactsTab({ campaignId }: { campaignId: number }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [stageFilter, setStageFilter] = useState<string>('all');
  const [search, setSearch]           = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage]               = useState(1);

  function handleSearch(v: string) {
    setSearch(v);
    if (!v) { setDebouncedSearch(''); setPage(1); }
  }

  function triggerSearch() {
    setDebouncedSearch(search);
    setPage(1);
  }

  const skillParams = useMemo(() => ({
    campaign_id: campaignId,
    stage:       stageFilter === 'all' ? undefined : stageFilter,
    search:      debouncedSearch || undefined,
    limit:       PAGE_SIZE,
    offset:      (page - 1) * PAGE_SIZE,
  }), [campaignId, stageFilter, debouncedSearch, page]);

  const { data, isLoading } = useSkillQuery<{ contacts: PipelineContact[]; stats: PipelineStats }>(
    'contact-skill', 'get_pipeline', skillParams
  );

  const { mutate: updateStage } = useSkillMutation('contact-skill', 'update_stage', {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skill', 'contact-skill', 'get_pipeline'] });
      showToast({ message: 'Stage updated.', type: 'success' });
    },
    onError: (err) => showToast({ message: err.message || 'Failed', type: 'error' }),
  });

  const contacts = data?.data?.contacts ?? [];
  const stats    = data?.data?.stats ?? { total: 0, identified: 0, contacted: 0, engaged: 0, interested: 0, qualified: 0, converted: 0, lost: 0 };

  if (isLoading) return <VdfLoader message="Loading pipeline…" />;

  return (
    <>
      {/* ── Funnel ─────────────────────────────────────── */}
      <div className={s.funnelRow}>
        {STAGES.map((st) => {
          const count = st.id === 'all' ? stats.total : (stats[st.id as keyof PipelineStats] as number ?? 0);
          const isActive = stageFilter === st.id;
          return (
            <div
              key={st.id}
              className={isActive ? s.funnelStageActive : s.funnelStage}
              onClick={() => { setStageFilter(st.id); setPage(1); }}
            >
              <span className={s.funnelCount}>{count}</span>
              <span className={s.funnelLabel}>{st.label}</span>
            </div>
          );
        })}
      </div>

      {/* ── Search ─────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <VdfSearchBar value={search} onChange={handleSearch} onSearch={triggerSearch} placeholder="Search contacts…" />
      </div>

      {/* ── Contact list ───────────────────────────────── */}
      {contacts.length === 0 ? (
        <VdfEmptyState
          title={stageFilter === 'all' ? 'No contacts assigned' : `No contacts in "${stageFilter}" stage`}
          description="Assign contacts from your contact list to this campaign."
        />
      ) : (
        <div className={s.pipelineList}>
          {contacts.map((c) => {
            const badge = STAGE_BADGE[c.stage] ?? STAGE_BADGE.identified;
            return (
              <div key={c.assignment_id} className={s.pipelineRow}>
                <div className={s.pipelineContact}>
                  <div className={s.pipelineContactName}>{c.prefix} {c.contact_name}</div>
                  <div className={s.pipelineContactMeta}>
                    {c.contact_no && <span>{c.contact_no}</span>}
                    {c.primary_mobile && <span> &middot; {c.primary_mobile}</span>}
                    {c.primary_email && <span> &middot; {c.primary_email}</span>}
                  </div>
                </div>
                <span className={s.pipelineScore}>{c.score}</span>
                <VdfStatusBadge label={c.stage} variant={badge.variant} />
                <select
                  style={{
                    fontSize: '0.72rem', padding: '4px 8px', borderRadius: 6,
                    border: '1px solid var(--color-border)', background: 'var(--color-bg)',
                    color: 'var(--color-fg)', cursor: 'pointer',
                  }}
                  value={c.stage}
                  onChange={(e) => updateStage({ assignment_id: c.assignment_id, stage: e.target.value })}
                >
                  {STAGES.filter(st => st.id !== 'all').map(st => (
                    <option key={st.id} value={st.id}>{st.label}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
