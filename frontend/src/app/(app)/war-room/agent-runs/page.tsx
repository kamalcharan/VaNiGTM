'use client';

import { useState, useMemo } from 'react';
import { useSkillQuery } from '@/hooks/useSkill';
import { VdfLoader, VdfPageHeader, VdfButton } from '@/components/vdf';
import s from '../war-room.module.css';

/* ── Types ───────────────────────────────────────────── */

interface AgentRun {
  id: number;
  agent_type: string;
  agent_name: string;
  action: string;
  status: string;
  duration_ms: number | null;
  campaign_name: string | null;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

const AGENT_TYPES = ['all', 'orchestrator', 'outreach', 'prospecting', 'conversion', 'aeo', 'feedback'] as const;
const STATUS_TYPES = ['all', 'success', 'partial', 'error', 'skipped'] as const;

const AGENT_CHIP_CSS: Record<string, string> = {
  orchestrator: s.agentOrchestrator,
  outreach:     s.agentOutreach,
  prospecting:  s.agentProspecting,
  conversion:   s.agentConversion,
  aeo:          s.agentAeo,
  feedback:     s.agentFeedback,
};

const STATUS_DOT_CSS: Record<string, string> = {
  success: s.statusSuccess,
  partial: s.statusPartial,
  error:   s.statusError,
  skipped: s.statusSkipped,
};

const PAGE_SIZE = 30;

/* ── Component ───────────────────────────────────────── */

export default function AgentRunsPage() {
  const [agentFilter, setAgentFilter]   = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage]                 = useState(1);
  const [expandedId, setExpandedId]     = useState<number | null>(null);

  const skillParams = useMemo(() => ({
    agent_type: agentFilter === 'all' ? undefined : agentFilter,
    status:     statusFilter === 'all' ? undefined : statusFilter,
    limit:      PAGE_SIZE,
    offset:     (page - 1) * PAGE_SIZE,
  }), [agentFilter, statusFilter, page]);

  const { data, isLoading } = useSkillQuery<{ runs: AgentRun[]; total: number }>(
    'gtm-analytics-skill', 'get_agent_runs', skillParams
  );

  const runs       = data?.data?.runs ?? [];
  const total      = data?.data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (isLoading) return <VdfLoader overlay message="Loading agent runs…" />;

  return (
    <div className={s.page}>
      <VdfPageHeader eyebrow="WAR ROOM" title="Agent Decision Logs" />

      {/* ── Filter toolbar ─────────────────────────────── */}
      <div className={s.runsToolbar}>
        {AGENT_TYPES.map((t) => (
          <button key={t} className={agentFilter === t ? s.filterChipActive : s.filterChip}
            onClick={() => { setAgentFilter(t); setPage(1); }}>
            {t === 'all' ? 'All Agents' : t}
          </button>
        ))}
        <div style={{ width: 1, height: 20, background: 'var(--color-border)', margin: '0 4px' }} />
        {STATUS_TYPES.map((t) => (
          <button key={t} className={statusFilter === t ? s.filterChipActive : s.filterChip}
            onClick={() => { setStatusFilter(t); setPage(1); }}>
            {t === 'all' ? 'All Status' : t}
          </button>
        ))}
      </div>

      {/* ── Run stats ──────────────────────────────────── */}
      <div className={s.runsContent}>
        <div className={s.runStatsRow}>
          <div className={s.kpiCard}><span className={s.kpiValue}>{total}</span><span className={s.kpiLabel}>Total Runs</span></div>
          <div className={s.kpiCard}><span className={s.kpiValue}>{runs.filter(r => r.status === 'success').length}</span><span className={s.kpiLabel}>Success</span></div>
          <div className={s.kpiCard}><span className={s.kpiValue}>{runs.filter(r => r.status === 'error').length}</span><span className={s.kpiLabel}>Errors</span></div>
          <div className={s.kpiCard}>
            <span className={s.kpiValue}>
              {runs.length > 0
                ? `${Math.round(runs.filter(r => r.duration_ms).reduce((s, r) => s + (r.duration_ms ?? 0), 0) / Math.max(runs.filter(r => r.duration_ms).length, 1))}ms`
                : '—'}
            </span>
            <span className={s.kpiLabel}>Avg Duration</span>
          </div>
        </div>

        {/* ── Runs table ───────────────────────────────── */}
        {runs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-muted)', fontSize: '0.85rem' }}>
            No agent runs found
          </div>
        ) : (
          <table className={s.runsTable}>
            <thead>
              <tr>
                <th>Time</th>
                <th>Agent</th>
                <th>Action</th>
                <th>Campaign</th>
                <th>Status</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <>
                  <tr key={run.id} onClick={() => setExpandedId(expandedId === run.id ? null : run.id)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                      {new Date(run.started_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>
                      <span className={`${s.agentChip} ${AGENT_CHIP_CSS[run.agent_type] ?? ''}`}>
                        {run.agent_type}
                      </span>
                    </td>
                    <td>{run.action}</td>
                    <td style={{ color: 'var(--color-muted)', fontSize: '0.78rem' }}>{run.campaign_name ?? '—'}</td>
                    <td>
                      <span className={`${s.statusDot} ${STATUS_DOT_CSS[run.status] ?? ''}`} />
                      {run.status}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                      {run.duration_ms != null ? `${run.duration_ms}ms` : '—'}
                    </td>
                  </tr>
                  {expandedId === run.id && (
                    <tr key={`${run.id}-detail`}>
                      <td colSpan={6} style={{ background: 'color-mix(in srgb, var(--color-primary) 3%, transparent)', padding: 16 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: '0.78rem' }}>
                          <div>
                            <div className={s.kpiLabel} style={{ marginBottom: 4 }}>Inputs</div>
                            <pre style={{ margin: 0, fontSize: '0.7rem', color: 'var(--color-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {JSON.stringify(run.inputs, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <div className={s.kpiLabel} style={{ marginBottom: 4 }}>Outputs</div>
                            <pre style={{ margin: 0, fontSize: '0.7rem', color: 'var(--color-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {JSON.stringify(run.outputs, null, 2)}
                            </pre>
                          </div>
                        </div>
                        {run.error_message && (
                          <div style={{ marginTop: 12, padding: '8px 12px', background: 'color-mix(in srgb, var(--color-danger) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-danger) 20%, transparent)', borderRadius: 6, fontSize: '0.75rem', color: 'var(--color-danger)' }}>
                            {run.error_message}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '20px 0' }}>
            <VdfButton variant="ghost" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</VdfButton>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)', alignSelf: 'center' }}>{page} / {totalPages}</span>
            <VdfButton variant="ghost" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</VdfButton>
          </div>
        )}
      </div>
    </div>
  );
}
