'use client';

import { useState } from 'react';
import { type PulseHistoryItem } from '@/hooks/usePulses';
import s from './PulseHistoryTimeline.module.css';

/* ── Constants ─────────────────────────────────────────────────────────────── */

const TEMPLATE_LABEL: Record<string, string> = {
  full_review:   'Full Review',
  quick_checkin: 'Quick Check-in',
  annual_review: 'Annual Review',
  gap_followup:  'Gap Follow-up',
};

const MEDIUM_LABEL: Record<string, string> = {
  phone:        'Phone Call',
  google_meet:  'Google Meet',
  in_person:    'In Person',
  whatsapp:     'WhatsApp',
};

const MEDIUM_ICON: Record<string, string> = {
  phone:        '📞',
  google_meet:  '📹',
  in_person:    '🤝',
  whatsapp:     '💬',
};

function dotClass(status: string): string {
  if (status === 'completed')                        return s.dotDone;
  if (status === 'missed')                           return s.dotMissed;
  if (status === 'cancelled')                        return s.dotCancelled;
  if (status === 'in_progress')                      return s.dotActive;
  return s.dotUpcoming;
}

function statusChip(status: string): { label: string; cls: string } {
  const map: Record<string, { label: string; cls: string }> = {
    completed:   { label: '✓ Completed',   cls: s.chipDone },
    missed:      { label: 'Missed',        cls: s.chipMissed },
    cancelled:   { label: 'Cancelled',     cls: s.chipCancelled },
    in_progress: { label: '● In Session',  cls: s.chipActive },
    prep_ready:  { label: 'Brief Ready',   cls: s.chipPrep },
    scheduled:   { label: 'Scheduled',     cls: s.chipScheduled },
  };
  return map[status] ?? { label: status, cls: s.chipScheduled };
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ── Component ─────────────────────────────────────────────────────────────── */

interface Props {
  sessions:  PulseHistoryItem[];
  isLoading: boolean;
}

export function PulseHistoryTimeline({ sessions, isLoading }: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className={s.skeletons}>
        {[1, 2, 3].map(i => <div key={i} className={s.skeletonRow} />)}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className={s.empty}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" width="28" height="28">
          <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
        </svg>
        <p>No pulse sessions yet.</p>
      </div>
    );
  }

  return (
    <div className={s.timeline}>
      {sessions.map((session, idx) => {
        const expanded = expandedId === session.id;
        const chip = statusChip(session.status);
        const isLast = idx === sessions.length - 1;

        return (
          <div key={session.id} className={`${s.item} ${isLast ? s.itemLast : ''}`}>
            <div className={`${s.dot} ${dotClass(session.status)}`} />

            <div
              className={`${s.card} ${expanded ? s.cardExpanded : ''}`}
              onClick={() => setExpandedId(expanded ? null : session.id)}
            >
              {/* Header */}
              <div className={s.cardHeader}>
                <span className={s.date}>{fmtDate(session.scheduled_at)}</span>
                <span className={s.type}>
                  {TEMPLATE_LABEL[session.template] ?? session.template}
                  {session.duration_minutes ? ` · ${session.duration_minutes} min` : ''}
                </span>
                <span className={s.medium}>
                  {MEDIUM_ICON[session.medium]} {MEDIUM_LABEL[session.medium] ?? session.medium}
                </span>
                <span className={`${s.chip} ${chip.cls}`}>{chip.label}</span>
                <span className={s.chevron}>{expanded ? '▲' : '▼'}</span>
              </div>

              {/* Expanded body */}
              {expanded && (
                <div className={s.cardBody}>
                  {session.vani_summary && (
                    <div className={s.summary}>
                      <div className={s.summaryLabel}>
                        <span className={s.vaniMark}>✦</span> VaNi Summary
                      </div>
                      <p className={s.summaryText}>{session.vani_summary}</p>
                    </div>
                  )}

                  {session.meeting_notes && !session.vani_summary && (
                    <div className={s.summary}>
                      <div className={s.summaryLabel}>Meeting Notes</div>
                      <p className={s.summaryText}>{session.meeting_notes}</p>
                    </div>
                  )}

                  {session.actions.length > 0 && (
                    <div className={s.actions}>
                      <div className={s.actionsLabel}>Actions</div>
                      <div className={s.actionPills}>
                        {session.actions.map(a => (
                          <span
                            key={a.id}
                            className={`${s.actionPill} ${a.status === 'done' ? s.actionPillDone : ''}`}
                          >
                            {a.status === 'done' && <span className={s.tick}>✓</span>}
                            {a.text}
                            {a.due_date && (
                              <span className={s.actionDue}>
                                · {new Date(a.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {session.gap_count > 0 && (
                    <div className={s.gapNote}>
                      {session.gap_count} gap{session.gap_count > 1 ? 's' : ''} tracked
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
