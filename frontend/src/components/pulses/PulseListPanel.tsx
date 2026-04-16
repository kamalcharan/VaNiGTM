'use client';

import { useState } from 'react';
import { VdfStatusBadge } from '@/components/vdf/status-badge/VdfStatusBadge';
import { VdfButton } from '@/components/vdf/button/VdfButton';
import { useUpdatePulse, type PulseItem, type ListPulsesParams } from '@/hooks/usePulses';
import { useToast } from '@/components/toast';
import s from './PulseListPanel.module.css';

/* ── Helpers ──────────────────────────────────────────────────────────────── */

const PULSE_TYPE_LABEL: Record<string, string> = {
  prospect_followup:    'Prospect Follow-up',
  client_followup:      'Client Follow-up',
  new_scheme_detected:  'New Scheme',
  rebalance_needed:     'Rebalance',
  sip_at_risk:          'SIP at Risk',
  goal_behind:          'Goal Behind',
  tax_harvest_opportunity: 'Tax Harvest',
  review_due:           'Review Due',
  large_redemption:     'Large Redemption',
  new_nfo_match:        'NFO Match',
  sip_bounced:          'SIP Bounced',
  nav_drop:             'NAV Drop',
};

const PRIORITY_COLORS: Record<string, string> = {
  high:   'var(--color-danger)',
  medium: 'var(--color-warning)',
  low:    'var(--color-muted)',
};

function formatDue(dateStr: string | null): { label: string; urgent: boolean } {
  if (!dateStr) return { label: '', urgent: false };
  const due  = new Date(dateStr);
  const now  = new Date();
  const diff = Math.ceil((due.getTime() - now.getTime()) / 86400000);
  if (diff < 0)   return { label: `${Math.abs(diff)}d overdue`, urgent: true };
  if (diff === 0) return { label: 'Due today', urgent: true };
  if (diff === 1) return { label: 'Due tomorrow', urgent: false };
  if (diff <= 7)  return { label: `Due in ${diff}d`, urgent: false };
  return { label: due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), urgent: false };
}

/* ── Props ────────────────────────────────────────────────────────────────── */

interface Props {
  pulses:      PulseItem[];
  isLoading:   boolean;
  /** Tab filter state lifted from parent so page can sync filters */
  activeStatus: 'open' | 'done' | 'all';
  onStatusChange: (s: 'open' | 'done' | 'all') => void;
  /** Show subject name column (on full page, hide on profile where it's implied) */
  showSubject?: boolean;
  /** CTA to add a new pulse — rendered top-right */
  onAdd?: () => void;
  emptyMessage?: string;
}

/* ── Component ────────────────────────────────────────────────────────────── */

export function PulseListPanel({
  pulses, isLoading,
  activeStatus, onStatusChange,
  showSubject = true,
  onAdd,
  emptyMessage = 'No follow-ups yet.',
}: Props) {
  const { showToast } = useToast();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { mutate: updatePulse, isPending: isUpdating } = useUpdatePulse(
    () => showToast({ message: 'Updated', type: 'success' }),
    (msg) => showToast({ message: msg, type: 'error' }),
  );

  function markDone(pulse: PulseItem) {
    updatePulse({ id: pulse.id, status: 'done' });
  }

  function dismiss(pulse: PulseItem) {
    updatePulse({ id: pulse.id, status: 'dismissed' });
  }

  function reopen(pulse: PulseItem) {
    updatePulse({ id: pulse.id, status: 'open' });
  }

  return (
    <div className={s.panel}>
      {/* Header row */}
      <div className={s.panelHead}>
        <div className={s.filterTabs}>
          {(['open', 'done', 'all'] as const).map(tab => (
            <button
              key={tab}
              className={`${s.filterTab} ${activeStatus === tab ? s.filterTabActive : ''}`}
              onClick={() => onStatusChange(tab)}
            >
              {tab === 'open' ? 'Open' : tab === 'done' ? 'Done' : 'All'}
            </button>
          ))}
        </div>
        {onAdd && (
          <VdfButton variant="primary" size="sm" onClick={onAdd}>
            + New Follow-up
          </VdfButton>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className={s.loadingRows}>
          {[1, 2, 3].map(i => <div key={i} className={s.skeletonRow} />)}
        </div>
      ) : pulses.length === 0 ? (
        <div className={s.empty}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" width="32" height="32">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
            <rect x="9" y="3" width="6" height="4" rx="1"/>
            <path d="M9 12h6M9 16h4"/>
          </svg>
          <p>{emptyMessage}</p>
        </div>
      ) : (
        <div className={s.list}>
          {pulses.map(p => {
            const due      = formatDue(p.due_date);
            const expanded = expandedId === p.id;
            const isDone   = p.status === 'done' || p.status === 'dismissed';

            return (
              <div
                key={p.id}
                className={`${s.row} ${isDone ? s.rowDone : ''} ${expanded ? s.rowExpanded : ''}`}
              >
                {/* Priority stripe */}
                <div className={s.priorityStripe} style={{ background: PRIORITY_COLORS[p.priority] }} />

                {/* Main content */}
                <div className={s.rowMain} onClick={() => setExpandedId(expanded ? null : p.id)}>
                  <div className={s.rowTop}>
                    <span className={s.rowTitle}>{p.title}</span>
                    <div className={s.rowMeta}>
                      {due.label && (
                        <span className={`${s.dueLabel} ${due.urgent ? s.dueLabelUrgent : ''}`}>
                          {due.label}
                        </span>
                      )}
                      <VdfStatusBadge
                        label={PULSE_TYPE_LABEL[p.pulse_type] ?? p.pulse_type}
                        variant={p.origin === 'system' ? 'info' : 'muted'}
                        size="sm"
                      />
                    </div>
                  </div>

                  {showSubject && p.subject_name && (
                    <div className={s.rowSubject}>
                      {p.subject_prefix} {p.subject_name}
                    </div>
                  )}

                  {expanded && (
                    <div className={s.rowDetail}>
                      {p.body  && <p className={s.rowBody}>{p.body}</p>}
                      {p.notes && (
                        <div className={s.notesBlock}>
                          <span className={s.notesLabel}>Notes</span>
                          <p className={s.notesText}>{p.notes}</p>
                        </div>
                      )}
                      <div className={s.rowDetailMeta}>
                        <span>Created {new Date(p.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        {p.completed_at && (
                          <span> · Done {new Date(p.completed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className={s.rowActions}>
                  {!isDone && (
                    <>
                      <button
                        className={s.actionBtn}
                        title="Mark done"
                        disabled={isUpdating}
                        onClick={(e) => { e.stopPropagation(); markDone(p); }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </button>
                      <button
                        className={`${s.actionBtn} ${s.actionBtnMuted}`}
                        title="Dismiss"
                        disabled={isUpdating}
                        onClick={(e) => { e.stopPropagation(); dismiss(p); }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </>
                  )}
                  {isDone && (
                    <button
                      className={`${s.actionBtn} ${s.actionBtnMuted}`}
                      title="Reopen"
                      disabled={isUpdating}
                      onClick={(e) => { e.stopPropagation(); reopen(p); }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                        <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
