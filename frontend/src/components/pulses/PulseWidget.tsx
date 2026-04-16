'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePulses, useUpdatePulse, type PulseItem } from '@/hooks/usePulses';
import { useToast } from '@/components/toast';
import { CreatePulseModal } from './CreatePulseModal';
import s from './PulseWidget.module.css';

const PRIORITY_DOT: Record<string, string> = {
  high:   'var(--color-danger)',
  medium: 'var(--color-warning)',
  low:    'var(--color-muted)',
};

function formatDue(dateStr: string | null): { label: string; urgent: boolean } {
  if (!dateStr) return { label: '', urgent: false };
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
  if (diff < 0)   return { label: `${Math.abs(diff)}d overdue`, urgent: true };
  if (diff === 0) return { label: 'Today', urgent: true };
  if (diff === 1) return { label: 'Tomorrow', urgent: false };
  if (diff <= 7)  return { label: `${diff}d`, urgent: false };
  return {
    label: new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
    urgent: false,
  };
}

export function PulseWidget() {
  const router = useRouter();
  const { showToast } = useToast();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = usePulses({ status: 'open', limit: 6 });
  const pulses: PulseItem[] = data?.data?.pulses ?? [];
  const total:  number      = data?.data?.total  ?? 0;

  const { mutate: updatePulse, isPending } = useUpdatePulse(
    () => showToast({ message: 'Done!', type: 'success' }),
    (msg) => showToast({ message: msg, type: 'error' }),
  );

  const preview = pulses.slice(0, 5);

  return (
    <div className={s.widget}>
      {/* Widget header */}
      <div className={s.head}>
        <div className={s.headLeft}>
          <span className={s.headTitle}>Follow-ups</span>
          {total > 0 && (
            <span className={s.badge}>{total > 99 ? '99+' : total}</span>
          )}
        </div>
        <div className={s.headActions}>
          <button className={s.addBtn} onClick={() => setShowCreate(true)} title="New follow-up">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="12" height="12">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          <button className={s.viewAllBtn} onClick={() => router.push('/pulses')}>
            View all →
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className={s.skeletons}>
          {[1,2,3].map(i => <div key={i} className={s.skeleton} />)}
        </div>
      ) : preview.length === 0 ? (
        <div className={s.empty}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" width="24" height="24">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
            <rect x="9" y="3" width="6" height="4" rx="1"/>
            <path d="M9 12h6M9 16h4"/>
          </svg>
          <span>No open follow-ups</span>
        </div>
      ) : (
        <div className={s.list}>
          {preview.map(p => {
            const due = formatDue(p.due_date);
            return (
              <div key={p.id} className={s.item}>
                <div
                  className={s.dot}
                  style={{ background: PRIORITY_DOT[p.priority] }}
                />
                <div className={s.itemMain}>
                  <span className={s.itemTitle}>{p.title}</span>
                  {p.subject_name && (
                    <span className={s.itemSub}>{p.subject_name}</span>
                  )}
                </div>
                <div className={s.itemRight}>
                  {due.label && (
                    <span className={`${s.dueLabel} ${due.urgent ? s.dueLabelUrgent : ''}`}>
                      {due.label}
                    </span>
                  )}
                  <button
                    className={s.doneBtn}
                    title="Mark done"
                    disabled={isPending}
                    onClick={() => updatePulse({ id: p.id, status: 'done' })}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="12" height="12">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}

          {total > 5 && (
            <button className={s.moreBtn} onClick={() => router.push('/pulses')}>
              +{total - 5} more open →
            </button>
          )}
        </div>
      )}

      <CreatePulseModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
      />
    </div>
  );
}
