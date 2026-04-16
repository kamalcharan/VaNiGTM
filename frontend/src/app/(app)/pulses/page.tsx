'use client';

import { useState, useEffect, useMemo } from 'react';
import { VdfPageHeader } from '@/components/vdf/page-header/VdfPageHeader';
import { usePulses, type PulseItem } from '@/hooks/usePulses';
import { PulseListPanel } from '@/components/pulses/PulseListPanel';
import { CreatePulseModal } from '@/components/pulses/CreatePulseModal';
import { useToast } from '@/components/toast';
import s from './pulses-page.module.css';

type StatFilter = 'open' | 'overdue' | 'today' | 'done';

function isOverdue(p: PulseItem): boolean {
  if (!p.due_date) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return new Date(p.due_date) < today;
}

function isDueToday(p: PulseItem): boolean {
  if (!p.due_date) return false;
  return p.due_date.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

export default function PulsesPage() {
  const [statFilter, setStatFilter]     = useState<StatFilter>('open');
  const [listStatus, setListStatus]     = useState<'open' | 'done' | 'all'>('open');
  const [originFilter, setOriginFilter] = useState<'all' | 'manual' | 'system'>('all');
  const [showCreate, setShowCreate]     = useState(false);
  const { showToast } = useToast();

  const queryOrigin = originFilter === 'all' ? undefined : originFilter as 'manual' | 'system';

  const { data: openData, isLoading: openLoading } = usePulses({
    status: 'open', limit: 500,
  });
  const { data: doneData } = usePulses({ status: 'done', limit: 1 });

  const queryStatus = listStatus === 'all' ? undefined : listStatus;
  const { data: listData, isLoading: listLoading, isError, error } = usePulses({
    status: queryStatus,
    origin: queryOrigin,
    limit:  100,
  });

  useEffect(() => {
    if (isError) {
      showToast({ message: (error as Error)?.message || 'Failed to load follow-ups', type: 'error' });
    }
  }, [isError, error, showToast]);

  const openPulses: PulseItem[] = openData?.data?.pulses ?? [];
  const openTotal  = openData?.data?.total  ?? 0;
  const doneTotal  = doneData?.data?.total  ?? 0;
  const overdueCount = openPulses.filter(isOverdue).length;
  const todayCount   = openPulses.filter(isDueToday).length;

  const rawList: PulseItem[] = listData?.data?.pulses ?? [];

  const displayPulses = useMemo(() => {
    if (statFilter === 'overdue') return openPulses.filter(isOverdue);
    if (statFilter === 'today')   return openPulses.filter(isDueToday);
    return rawList;
  }, [statFilter, openPulses, rawList]);

  const isListLoading = (statFilter === 'overdue' || statFilter === 'today')
    ? openLoading
    : listLoading;

  function handleStatClick(f: StatFilter) {
    setStatFilter(f);
    setListStatus(f === 'done' ? 'done' : 'open');
  }

  const displayTotal =
    statFilter === 'overdue' ? overdueCount :
    statFilter === 'today'   ? todayCount   :
    statFilter === 'done'    ? doneTotal    : openTotal;

  const statCards = [
    { key: 'open'    as StatFilter, icon: '📋', value: openTotal,    label: 'Open',      mod: s.statCardOpen,    valMod: '' },
    { key: 'overdue' as StatFilter, icon: '⚠️', value: overdueCount, label: 'Overdue',   mod: s.statCardOverdue, valMod: overdueCount > 0 ? s.statValueDanger  : '' },
    { key: 'today'   as StatFilter, icon: '📅', value: todayCount,   label: 'Due Today', mod: s.statCardToday,   valMod: todayCount   > 0 ? s.statValueWarning : '' },
    { key: 'done'    as StatFilter, icon: '✅', value: doneTotal,    label: 'Done',      mod: s.statCardDone,    valMod: '' },
  ];

  const activeListStatus: 'open' | 'done' | 'all' =
    statFilter === 'done' ? 'done' :
    (statFilter === 'overdue' || statFilter === 'today') ? 'open' :
    listStatus;

  return (
    <div className={s.page}>
      <VdfPageHeader
        eyebrow="FOLLOW-UPS"
        title="Pulses"
        meta={
          <>
            <strong>{displayTotal}</strong>{' '}
            {statFilter === 'overdue' ? 'overdue' :
             statFilter === 'today'   ? 'due today' :
             statFilter === 'done'    ? 'done' : 'open'}
            {' '}follow-ups
          </>
        }
        actions={
          <div className={s.headerActions}>
            <div className={s.originPills}>
              {(['all', 'manual', 'system'] as const).map(o => (
                <button
                  key={o}
                  className={`${s.originPill} ${originFilter === o ? s.originPillActive : ''}`}
                  onClick={() => setOriginFilter(o)}
                >
                  {o === 'all' ? 'All' : o === 'manual' ? 'Manual' : 'System'}
                </button>
              ))}
            </div>
          </div>
        }
      />

      <div className={s.body}>

        {/* ── Stat cards ── */}
        <div className={s.statsRow}>
          {statCards.map(card => (
            <div
              key={card.key}
              className={`${s.statCard} ${card.mod} ${statFilter === card.key ? s.statCardActive : ''}`}
              onClick={() => handleStatClick(card.key)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && handleStatClick(card.key)}
            >
              <span className={s.statIcon}>{card.icon}</span>
              <span className={`${s.statValue} ${card.valMod}`}>
                {openLoading && card.key !== 'done' ? '—' : card.value}
              </span>
              <span className={s.statLabel}>{card.label}</span>
            </div>
          ))}
        </div>

        {/* ── Main layout ── */}
        <div className={s.mainLayout}>

          <div className={s.listColumn}>
            <PulseListPanel
              pulses={displayPulses}
              isLoading={isListLoading}
              activeStatus={activeListStatus}
              onStatusChange={st => {
                setListStatus(st);
                if (st === 'done') setStatFilter('done');
                else if (statFilter === 'done') setStatFilter('open');
              }}
              showSubject
              onAdd={() => setShowCreate(true)}
              emptyMessage={
                statFilter === 'overdue' ? 'No overdue follow-ups. You\'re on top of it!' :
                statFilter === 'today'   ? 'Nothing due today. Enjoy the breathing room.' :
                listStatus  === 'done'   ? 'No completed follow-ups yet.' :
                listStatus  === 'open'   ? 'No open follow-ups. Great job!' :
                'No follow-ups yet.'
              }
            />
          </div>

          {/* ── Sidebar ── */}
          <div className={s.sidebar}>

            {/* VaNi Intelligence — P2 */}
            <div className={`${s.p2Panel} ${s.p2PanelVani}`}>
              <div className={s.p2Header}>
                <span className={s.p2Title}>
                  <span className={s.p2TitleIcon}>✦</span>
                  VaNi Intelligence
                </span>
                <span className={s.p2Badge}>P2</span>
              </div>
              <p className={s.p2Body}>
                AI-powered pulse suggestions based on portfolio events, goal deviations, and client activity patterns.
              </p>
              <div className={s.p2Divider} />
              <ul className={s.p2Features}>
                {[
                  'Auto-generate follow-ups from NAV drops',
                  'SIP bounce → instant client alert',
                  'Goal drift detection → proactive nudge',
                  'Priority scoring via client engagement',
                ].map(f => (
                  <li key={f} className={s.p2Feature}>
                    <span className={s.p2FeatureDot} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Reminders — P2 */}
            <div className={s.p2Panel}>
              <div className={s.p2Header}>
                <span className={s.p2Title}>
                  <span className={s.p2TitleIcon}>🔔</span>
                  Reminders
                </span>
                <span className={s.p2Badge}>P2</span>
              </div>
              <p className={s.p2Body}>
                Schedule WhatsApp / email reminders that fire automatically on due date.
              </p>
              <div className={s.p2Divider} />
              <ul className={s.p2Features}>
                {[
                  'WhatsApp reminder on due date',
                  'Email digest every morning',
                  'Escalate to senior advisor',
                  'Snooze with one tap',
                ].map(f => (
                  <li key={f} className={s.p2Feature}>
                    <span className={s.p2FeatureDot} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Analytics — P2 */}
            <div className={s.p2Panel}>
              <div className={s.p2Header}>
                <span className={s.p2Title}>
                  <span className={s.p2TitleIcon}>📊</span>
                  Analytics
                </span>
                <span className={s.p2Badge}>P2</span>
              </div>
              <p className={s.p2Body}>
                Completion rates, average resolution time, and follow-up velocity by advisor.
              </p>
            </div>

          </div>
        </div>
      </div>

      <CreatePulseModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
      />
    </div>
  );
}
