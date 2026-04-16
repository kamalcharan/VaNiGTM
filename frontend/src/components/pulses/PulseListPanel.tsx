'use client';

import { useState } from 'react';
import { VdfButton } from '@/components/vdf/button/VdfButton';
import { useUpdatePulse, type PulseItem } from '@/hooks/usePulses';
import { useToast } from '@/components/toast';
import s from './PulseListPanel.module.css';

/* ── Helpers ──────────────────────────────────────────────────────────────── */

const PULSE_ICONS: Record<string, string> = {
  prospect_followup:        '👤',
  client_followup:          '💼',
  new_scheme_detected:      '📊',
  rebalance_needed:         '⚖️',
  sip_at_risk:              '⚠️',
  goal_behind:              '🎯',
  tax_harvest_opportunity:  '💡',
  review_due:               '📋',
  large_redemption:         '💸',
  new_nfo_match:            '✨',
  sip_bounced:              '🔔',
  nav_drop:                 '📉',
};

const PULSE_TYPE_LABEL: Record<string, string> = {
  prospect_followup:        'Prospect',
  client_followup:          'Client',
  new_scheme_detected:      'New Scheme',
  rebalance_needed:         'Rebalance',
  sip_at_risk:              'SIP Risk',
  goal_behind:              'Goal',
  tax_harvest_opportunity:  'Tax Harvest',
  review_due:               'Review',
  large_redemption:         'Redemption',
  new_nfo_match:            'NFO Match',
  sip_bounced:              'SIP Bounce',
  nav_drop:                 'NAV Drop',
};

function cardVariant(p: PulseItem): 'Urgent' | 'Action' | 'Info' | 'Done' {
  if (p.status === 'done' || p.status === 'dismissed') return 'Done';
  if (p.priority === 'high')   return 'Urgent';
  if (p.priority === 'medium') return 'Action';
  return 'Info';
}

function formatDue(dateStr: string | null): { label: string; urgent: boolean } {
  if (!dateStr) return { label: '', urgent: false };
  const due  = new Date(dateStr);
  const now  = new Date();
  const diff = Math.ceil((due.getTime() - now.getTime()) / 86400000);
  if (diff < 0)   return { label: `${Math.abs(diff)}d overdue`, urgent: true };
  if (diff === 0) return { label: 'today', urgent: true };
  if (diff === 1) return { label: 'tomorrow', urgent: false };
  if (diff <= 7)  return { label: `in ${diff}d`, urgent: false };
  return { label: due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), urgent: false };
}

/* ── Props ────────────────────────────────────────────────────────────────── */

interface Props {
  pulses:         PulseItem[];
  isLoading:      boolean;
  activeStatus:   'open' | 'done' | 'all';
  onStatusChange: (s: 'open' | 'done' | 'all') => void;
  showSubject?:   boolean;
  onAdd?:         () => void;
  emptyMessage?:  string;
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

  function markDone(p: PulseItem) { updatePulse({ id: p.id, status: 'done' } as Record<string, unknown>); }
  function dismiss(p: PulseItem)  { updatePulse({ id: p.id, status: 'dismissed' } as Record<string, unknown>); }
  function reopen(p: PulseItem)   { updatePulse({ id: p.id, status: 'open' } as Record<string, unknown>); }

  return (
    <div className={s.panel}>

      {/* Header */}
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

      {/* Body */}
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
            const variant   = cardVariant(p);
            const due       = formatDue(p.due_date);
            const expanded  = expandedId === p.id;
            const isDone    = p.status === 'done' || p.status === 'dismissed';
            const icon      = PULSE_ICONS[p.pulse_type] ?? '📌';
            const typeLabel = PULSE_TYPE_LABEL[p.pulse_type] ?? p.pulse_type;

            return (
              <div key={p.id} className={`${s.card} ${s[`card${variant}`]}`}>

                {/* Main row — click to expand */}
                <div className={s.row} onClick={() => setExpandedId(expanded ? null : p.id)}>

                  <div className={s.icon}>{icon}</div>

                  <div className={s.body}>
                    <div className={s.title}>{p.title}</div>
                    <div className={s.meta}>
                      <span className={s.typeChip}>{typeLabel}</span>
                      {showSubject && p.subject_name && (
                        <>
                          <span className={s.metaSep}>·</span>
                          <span>{p.subject_prefix} {p.subject_name}</span>
                        </>
                      )}
                      {due.label && (
                        <>
                          <span className={s.metaSep}>·</span>
                          <span className={due.urgent ? s.metaDueUrgent : s.metaDue}>
                            due {due.label}
                          </span>
                        </>
                      )}
                      {p.status === 'dismissed' && (
                        <>
                          <span className={s.metaSep}>·</span>
                          <span>dismissed</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Action pills — stop click from toggling expand */}
                  <div className={s.actions} onClick={e => e.stopPropagation()}>
                    {!isDone ? (
                      <>
                        <button
                          className={`${s.pill} ${s.pillDone}`}
                          disabled={isUpdating}
                          onClick={() => markDone(p)}
                          title="Mark done"
                        >
                          ✓ Done
                        </button>
                        <button
                          className={`${s.pill} ${s.pillDismiss}`}
                          disabled={isUpdating}
                          onClick={() => dismiss(p)}
                          title="Dismiss"
                        >
                          × Skip
                        </button>
                      </>
                    ) : (
                      <button
                        className={`${s.pill} ${s.pillReopen}`}
                        disabled={isUpdating}
                        onClick={() => reopen(p)}
                        title="Reopen"
                      >
                        ↺ Reopen
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded detail */}
                {expanded && (
                  <div className={s.detail}>
                    {p.body && (
                      <div
                        className={s.detailBody}
                        dangerouslySetInnerHTML={{ __html: p.body }}
                      />
                    )}
                    {p.notes && (
                      <div className={s.notesBlock}>
                        <span className={s.notesLabel}>Notes</span>
                        <div
                          className={s.notesText}
                          dangerouslySetInnerHTML={{ __html: p.notes }}
                        />
                      </div>
                    )}
                    <div className={s.detailMeta}>
                      Created {new Date(p.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {p.completed_at && (
                        <> · Done {new Date(p.completed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
