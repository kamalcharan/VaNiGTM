'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { VdfPageHeader, VdfButton, VdfEmptyState } from '@/components/vdf';
import {
  usePulseQueue,
  type PulseQueueItem,
  type PulseQueueStats,
} from '@/hooks/usePulses';
import { useToast } from '@/components/toast';
import s from './pulses-page.module.css';

/* ── Constants ─────────────────────────────────────────────────────────────── */

const FREQ_LABEL: Record<string, string> = {
  monthly:   'Monthly',
  bimonthly: 'Bimonthly',
  quarterly: 'Quarterly',
  custom:    'Custom',
};

const MEDIUM_ICON: Record<string, string> = {
  phone:       '📞',
  google_meet: '📹',
  in_person:   '🤝',
  whatsapp:    '💬',
};

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtShort(d: string): string {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function urgencyDate(item: PulseQueueItem): { text: string; cls: string } {
  const { urgency, days_from_now, scheduled_at, last_completed_at } = item;
  if (urgency === 'overdue' && days_from_now !== null) {
    const d = Math.abs(days_from_now);
    return { text: `${d} day${d !== 1 ? 's' : ''} overdue`, cls: s.dateOverdue };
  }
  if (urgency === 'due_soon' && days_from_now !== null) {
    return { text: `Due in ${days_from_now} day${days_from_now !== 1 ? 's' : ''}`, cls: s.dateDueSoon };
  }
  if (urgency === 'upcoming' && scheduled_at) {
    return { text: fmtShort(scheduled_at), cls: s.dateUpcoming };
  }
  if (urgency === 'completed' && last_completed_at) {
    return { text: fmtShort(last_completed_at), cls: s.dateCompleted };
  }
  return { text: 'Not scheduled', cls: s.dateMuted };
}

function itemBorderClass(urgency: string): string {
  if (urgency === 'overdue')    return s.itemOverdue;
  if (urgency === 'due_soon')   return s.itemDueSoon;
  if (urgency === 'upcoming')   return s.itemUpcoming;
  if (urgency === 'completed')  return s.itemCompleted;
  return s.itemNoSession;
}

function avatarClass(urgency: string): string {
  if (urgency === 'overdue')   return s.avDanger;
  if (urgency === 'due_soon')  return s.avWarning;
  if (urgency === 'upcoming')  return s.avInfo;
  if (urgency === 'completed') return s.avSuccess;
  return s.avPrimary;
}

function detailLine(item: PulseQueueItem): string {
  if (item.urgency === 'no_session') return 'No pulse sessions yet';
  if (item.urgency === 'completed' && item.last_completed_at) {
    return `Last pulse: ${fmtDate(item.last_completed_at)}`;
  }
  if (item.session_status === 'prep_ready') return 'Brief ready — session coming up';
  if (item.session_status === 'in_progress') return 'Session in progress';
  if (item.session_status === 'scheduled' && item.scheduled_at) {
    return `Scheduled: ${fmtDate(item.scheduled_at)}`;
  }
  if (item.last_completed_at) return `Last pulse: ${fmtDate(item.last_completed_at)}`;
  return 'No previous sessions';
}

/* ── Queue Row ─────────────────────────────────────────────────────────────── */

interface RowProps {
  item:   PulseQueueItem;
  onOpen: (clientId: number) => void;
}

function QueueRow({ item, onOpen }: RowProps) {
  const dateInfo = urgencyDate(item);

  function ActionBtn() {
    if (item.urgency === 'overdue') {
      return (
        <VdfButton variant="danger" size="xs" onClick={e => { e.stopPropagation(); onOpen(item.client_id); }}>
          Prepare
        </VdfButton>
      );
    }
    if (item.urgency === 'due_soon') {
      return (
        <VdfButton variant="outline" size="xs" onClick={e => { e.stopPropagation(); onOpen(item.client_id); }}>
          Schedule
        </VdfButton>
      );
    }
    if (item.urgency === 'no_session') {
      return (
        <VdfButton variant="outline" size="xs" onClick={e => { e.stopPropagation(); onOpen(item.client_id); }}>
          Set Up
        </VdfButton>
      );
    }
    if (item.urgency === 'completed') {
      return (
        <VdfButton variant="ghost" size="xs" onClick={e => { e.stopPropagation(); onOpen(item.client_id); }}>
          History
        </VdfButton>
      );
    }
    return null;
  }

  return (
    <div
      className={`${s.queueItem} ${itemBorderClass(item.urgency)}`}
      onClick={() => onOpen(item.client_id)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onOpen(item.client_id)}
    >
      <div className={`${s.avatar} ${avatarClass(item.urgency)}`}>
        {item.initials}
      </div>

      <div className={s.itemInfo}>
        <div className={s.itemName}>{item.client_prefix} {item.client_name}</div>
        <div className={s.itemDetail}>{detailLine(item)}</div>
        <div className={s.itemFreq}>
          🔁 {FREQ_LABEL[item.frequency] ?? item.frequency}
          {' · '}
          {MEDIUM_ICON[item.medium] ?? ''} {item.medium.replace('_', ' ')}
        </div>
      </div>

      <div className={s.itemRight}>
        <div className={`${s.itemDate} ${dateInfo.cls}`}>{dateInfo.text}</div>
        {item.urgency === 'upcoming' && item.session_status && (
          <div className={s.itemStatus}>
            {item.session_status.replace('_', ' ')}
          </div>
        )}
        <div className={s.itemAction}>
          <ActionBtn />
        </div>
      </div>
    </div>
  );
}

/* ── Stat Card ─────────────────────────────────────────────────────────────── */

interface StatCardProps {
  value:   number;
  label:   string;
  accent:  string;
  valCls?: string;
  active:  boolean;
  onClick: () => void;
}

function StatCard({ value, label, accent, valCls, active, onClick }: StatCardProps) {
  return (
    <div
      className={`${s.statCard} ${active ? s.statCardActive : ''}`}
      style={{ '--stat-accent': accent } as React.CSSProperties}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
    >
      <div className={s.statAccent} />
      <div className={`${s.statValue} ${valCls ?? ''}`}>{value}</div>
      <div className={s.statLabel}>{label}</div>
    </div>
  );
}

/* ── Empty State ───────────────────────────────────────────────────────────── */

function QueueEmpty() {
  const router = useRouter();
  return (
    <div className={s.emptyWrap}>
      <VdfEmptyState
        title="No clients in queue"
        description="Set up pulse schedules on client profiles to see them here."
        action={
          <VdfButton variant="outline" size="sm" onClick={() => router.push('/clients')}>
            Go to Clients →
          </VdfButton>
        }
      />
    </div>
  );
}

/* ── Skeleton ──────────────────────────────────────────────────────────────── */

function QueueSkeleton() {
  return (
    <div className={s.skeletons}>
      {[1, 2, 3, 4, 5].map(i => <div key={i} className={s.skeletonRow} />)}
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

type UrgencyFilter = '' | 'overdue' | 'due_soon' | 'upcoming' | 'no_session';
type FreqFilter    = '' | 'monthly' | 'bimonthly' | 'quarterly';

const EMPTY_STATS: PulseQueueStats = {
  overdue_count: 0, due_this_week_count: 0, upcoming_count: 0, completed_ytd: 0, total_configs: 0,
};

export default function PulsesPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [urgency,  setUrgency]  = useState<UrgencyFilter>('');
  const [freq,     setFreq]     = useState<FreqFilter>('');

  const { data, isLoading, isError, error } = usePulseQueue({
    ...(urgency  ? { urgency  } : {}),
    ...(freq     ? { frequency: freq } : {}),
  });

  useEffect(() => {
    if (isError) showToast({ message: (error as Error)?.message || 'Failed to load queue', type: 'error' });
  }, [isError, error, showToast]);

  const items = data?.data?.items  ?? [];
  const stats = data?.data?.stats  ?? EMPTY_STATS;

  function setUrgencyFilter(u: UrgencyFilter) {
    setUrgency(u);
    setFreq('');
  }

  function setFreqFilter(f: FreqFilter) {
    setFreq(f);
    setUrgency('');
  }

  function openClient(clientId: number) {
    router.push(`/clients/${clientId}?tab=pulses`);
  }

  const activeFilter = urgency || freq || 'all';

  return (
    <div className={s.page}>
      <VdfPageHeader
        eyebrow="PULSE QUEUE"
        title="Pulse Queue"
        titleEm="relationship reviews"
        meta={
          <>
            <strong>{stats.total_configs}</strong> client{stats.total_configs !== 1 ? 's' : ''} configured
            {stats.overdue_count > 0 && (
              <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
                {' · '}{stats.overdue_count} overdue
              </span>
            )}
          </>
        }
        actions={
          <VdfButton variant="primary" size="sm" onClick={() => router.push('/clients')}>
            + Set Up Pulse
          </VdfButton>
        }
      />

      <div className={s.body}>

        {/* ── Stats strip ── */}
        <div className={s.statsRow}>
          <StatCard
            value={stats.overdue_count}
            label="Overdue"
            accent="var(--color-danger)"
            valCls={stats.overdue_count > 0 ? s.valDanger : undefined}
            active={urgency === 'overdue'}
            onClick={() => setUrgencyFilter(urgency === 'overdue' ? '' : 'overdue')}
          />
          <StatCard
            value={stats.due_this_week_count}
            label="Due This Week"
            accent="var(--color-warning)"
            valCls={stats.due_this_week_count > 0 ? s.valWarning : undefined}
            active={urgency === 'due_soon'}
            onClick={() => setUrgencyFilter(urgency === 'due_soon' ? '' : 'due_soon')}
          />
          <StatCard
            value={stats.upcoming_count}
            label="Upcoming"
            accent="var(--color-info)"
            valCls={s.valInfo}
            active={urgency === 'upcoming'}
            onClick={() => setUrgencyFilter(urgency === 'upcoming' ? '' : 'upcoming')}
          />
          <StatCard
            value={stats.completed_ytd}
            label="Completed (YTD)"
            accent="var(--color-success)"
            valCls={stats.completed_ytd > 0 ? s.valSuccess : undefined}
            active={false}
            onClick={() => {}}
          />
        </div>

        {/* ── Filter pills ── */}
        <div className={s.filters}>
          {[
            { key: 'all',       label: 'All' },
            { key: 'overdue',   label: 'Overdue',      urgency: 'overdue'  as UrgencyFilter },
            { key: 'due_soon',  label: 'Due This Week', urgency: 'due_soon' as UrgencyFilter },
            { key: 'upcoming',  label: 'Upcoming',     urgency: 'upcoming'  as UrgencyFilter },
            { key: 'no_session',label: 'No Session',   urgency: 'no_session' as UrgencyFilter },
            { key: '|' },
            { key: 'monthly',   label: 'Monthly',    freq: 'monthly'   as FreqFilter },
            { key: 'bimonthly', label: 'Bimonthly',  freq: 'bimonthly' as FreqFilter },
            { key: 'quarterly', label: 'Quarterly',  freq: 'quarterly' as FreqFilter },
          ].map(f => {
            if (f.key === '|') return <span key="sep" className={s.filterSep} />;
            if (f.key === 'all') {
              return (
                <button
                  key="all"
                  className={`${s.filterPill} ${activeFilter === 'all' ? s.filterPillActive : ''}`}
                  onClick={() => { setUrgency(''); setFreq(''); }}
                >
                  All
                </button>
              );
            }
            const isActive = (f.urgency && urgency === f.urgency) || (f.freq && freq === f.freq);
            return (
              <button
                key={f.key}
                className={`${s.filterPill} ${isActive ? s.filterPillActive : ''}`}
                onClick={() => {
                  if (f.urgency) setUrgencyFilter(isActive ? '' : f.urgency);
                  else if (f.freq) setFreqFilter(isActive ? '' : f.freq);
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* ── Queue list ── */}
        {isLoading ? (
          <QueueSkeleton />
        ) : items.length === 0 ? (
          <QueueEmpty />
        ) : (
          <div className={s.queueList}>
            {items.map(item => (
              <QueueRow key={item.config_id} item={item} onOpen={openClient} />
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
