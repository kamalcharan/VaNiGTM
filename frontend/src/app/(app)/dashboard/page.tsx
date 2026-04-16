'use client';

import { useMemo } from 'react';
import { useMe } from '@/hooks';
import {
  VdfPageHeader,
  VdfStatusBadge,
  VdfEmptyState,
  VdfSummaryCard,
  VdfDashPanel,
  VdfProactiveCard,
} from '@/components/vdf';
import { PulseWidget } from '@/components/pulses/PulseWidget';
import s from './dashboard-page.module.css';

// ── Dummy data ────────────────────────────────────────────────────────────────
const GOALS = {
  total: 38, onTrack: 24, needsAttention: 9, offTrack: 5,
  targetValue: 42000000, currentValue: 26500000,
};

const MEETINGS_TODAY = [
  { id: 1, name: 'Rohit Sharma',  time: '10:30 AM', icon: '📹' },
  { id: 2, name: 'Priya Mehta',   time: '2:00 PM',  icon: '🏢' },
  { id: 3, name: 'Vikram Nair',   time: '4:30 PM',  icon: '📞' },
];
const MEETINGS_UPCOMING = [
  { id: 4, name: 'Sunita Patel',   day: 'Tomorrow',   time: '11:00 AM' },
  { id: 5, name: 'Deepa Krishnan', day: 'Mon 13 Apr', time: '3:00 PM'  },
];

type Priority = 'critical' | 'high' | 'medium' | 'low';
const ACTIONS: {
  id: number; name: string; icon: string; desc: string;
  amount?: string; dueIn: string; priority: Priority;
}[] = [
  { id: 1, name: 'Rajesh Kumar',  icon: '⚡', desc: 'SIP renewal due',         amount: '₹25,000', dueIn: '3 days',  priority: 'critical' },
  { id: 2, name: 'Sunita Patel',  icon: '⚖️', desc: 'Portfolio rebalancing',   amount: undefined, dueIn: '5 days',  priority: 'high'     },
  { id: 3, name: 'Amit Shah',     icon: '🎯', desc: 'Goal review — shortfall', amount: undefined, dueIn: '7 days',  priority: 'high'     },
  { id: 4, name: 'Deepa Nair',    icon: '📋', desc: 'Annual review due',       amount: undefined, dueIn: '12 days', priority: 'medium'   },
  { id: 5, name: 'Kiran Rao',     icon: '📄', desc: 'Document collection',     amount: undefined, dueIn: '15 days', priority: 'medium'   },
  { id: 6, name: 'Manju Desai',   icon: '🎂', desc: 'Birthday next week',      amount: undefined, dueIn: '6 days',  priority: 'low'      },
];

const WITHDRAWALS = {
  soon: [
    { id: 1, name: 'Priya Mehta',  goal: 'Retirement Fund',  amount: '₹5.2L',  days: 28  },
    { id: 2, name: 'Rohit Sharma', goal: 'Child Education',  amount: '₹3.8L',  days: 45  },
  ],
  later: [
    { id: 3, name: 'Sunita Patel', goal: 'Home Purchase',    amount: '₹12.5L', days: 112 },
    { id: 4, name: 'Vikram Nair',  goal: 'Business Capital', amount: '₹8.0L',  days: 145 },
  ],
};

const TRANSACTIONS = [
  { id: 1, customer: 'Rajesh Kumar', type: 'SIP',        scheme: 'Axis Bluechip Fund',     amount: '₹25,000',   date: '10 Apr 2026' },
  { id: 2, customer: 'Priya Mehta',  type: 'Lumpsum',    scheme: 'HDFC Midcap Opp.',       amount: '₹1,00,000', date: '9 Apr 2026'  },
  { id: 3, customer: 'Amit Shah',    type: 'Redemption', scheme: 'ICICI Pru Liquid Fund',  amount: '₹50,000',   date: '8 Apr 2026'  },
  { id: 4, customer: 'Sunita Patel', type: 'SIP',        scheme: 'Parag Parikh Flexi Cap', amount: '₹10,000',   date: '7 Apr 2026'  },
  { id: 5, customer: 'Kiran Rao',    type: 'STP',        scheme: 'Mirae Asset Large Cap',  amount: '₹5,000',    date: '6 Apr 2026'  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function fmtCr(n: number) {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)} Cr`;
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)} L`;
  return `₹${n.toLocaleString('en-IN')}`;
}

const PRIORITY_VARIANT: Record<Priority, 'danger' | 'warning' | 'info' | 'muted'> = {
  critical: 'danger',
  high:     'warning',
  medium:   'info',
  low:      'muted',
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { data: me } = useMe();
  const user = me?.user;
  const tenant = me?.tenant;

  const today = useMemo(() =>
    new Date().toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }), []);

  const goalsProgress = Math.round((GOALS.currentValue / GOALS.targetValue) * 100);
  const criticalCount = ACTIONS.filter(a => a.priority === 'critical').length;

  return (
    <div className={s.page}>
      <VdfPageHeader
        eyebrow="DASHBOARD"
        title={greeting()}
        titleEm={user?.name ?? tenant?.name ?? ''}
        meta={<span className={s.headerDate}>{today}</span>}
        actions={
          <div className={s.headerActions}>
            <span className={s.dummyBadge}>DEMO DATA</span>
            <button className={s.refreshBtn} type="button" title="Refresh">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                strokeLinecap="round" strokeLinejoin="round" width="13" height="13" aria-hidden>
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" />
              </svg>
              Refresh
            </button>
          </div>
        }
      />

      <div className={s.body}>

        {/* ── 1. Summary cards ── */}
        <div className={s.summaryGrid}>
          <VdfSummaryCard
            eyebrow="Total AUM"
            value={fmtCr(124_000_000)}
            sub="▲ 2.3% MTD"
            accent="primary"
            subTone="up"
          />
          <VdfSummaryCard
            eyebrow="Active Clients"
            value="147"
            sub="of 163 total"
            accent="success"
          />
          <VdfSummaryCard
            eyebrow="Pending Actions"
            value="8"
            sub={`${criticalCount} critical`}
            accent="warning"
            subTone="down"
          />
          <VdfSummaryCard
            eyebrow="Downloads (yesterday)"
            value="41"
            sub="41 ok · 0 failed"
            accent="info"
            subTone="up"
          />
        </div>

        {/* ── VaNi banner ── */}
        <VdfProactiveCard
          label="VaNi"
          message="3 SIP renewals due this week totalling ₹60,000. Rajesh Kumar's renewal is critical — expires in 3 days."
          ctaLabel="Review actions →"
          onCta={() => {}}
        />

        {/* ── 2. Main 3-col grid ── */}
        <div className={s.mainGrid}>

          {/* Goals Overview */}
          <VdfDashPanel title="Goals Overview" href="/goals" footer="Last calculated 6:00 AM today">
            <div className={s.goalsGrid}>
              <div className={s.goalsStat}>
                <span className={s.goalsNum}>{GOALS.total}</span>
                <span className={s.goalsLabel}>Total</span>
              </div>
              <div className={`${s.goalsStat} ${s.gsSuccess}`}>
                <span className={s.goalsNum}>{GOALS.onTrack}</span>
                <span className={s.goalsLabel}>On Track</span>
              </div>
              <div className={`${s.goalsStat} ${s.gsWarning}`}>
                <span className={s.goalsNum}>{GOALS.needsAttention}</span>
                <span className={s.goalsLabel}>Attention</span>
              </div>
              <div className={`${s.goalsStat} ${s.gsDanger}`}>
                <span className={s.goalsNum}>{GOALS.offTrack}</span>
                <span className={s.goalsLabel}>Off Track</span>
              </div>
            </div>
            <div className={s.progressWrap}>
              <div className={s.progressTrack}>
                <div className={s.progressFill} style={{ width: `${goalsProgress}%` }} />
              </div>
              <div className={s.progressMeta}>
                <span>{fmtCr(GOALS.currentValue)} current</span>
                <span className={s.progressTarget}>{fmtCr(GOALS.targetValue)} target</span>
              </div>
            </div>
          </VdfDashPanel>

          {/* Today's Meetings */}
          <VdfDashPanel title="Today's Meetings" href="/meetings">
            {MEETINGS_TODAY.length === 0 ? (
              <VdfEmptyState icon="📅" title="No meetings today" description="Your schedule is clear." />
            ) : (
              <div className={s.meetingList}>
                {MEETINGS_TODAY.map(m => (
                  <div key={m.id} className={s.meetingRow}>
                    <span className={s.meetingIcon}>{m.icon}</span>
                    <span className={s.meetingName}>{m.name}</span>
                    <span className={s.meetingTime}>{m.time}</span>
                  </div>
                ))}
              </div>
            )}
            <div className={s.divider}>
              <div className={s.dividerLine} />
              <span className={s.dividerLabel}>Upcoming this week</span>
              <div className={s.dividerLine} />
            </div>
            <div className={s.meetingList}>
              {MEETINGS_UPCOMING.map(m => (
                <div key={m.id} className={`${s.meetingRow} ${s.meetingDim}`}>
                  <span className={s.meetingIcon}>📅</span>
                  <span className={s.meetingName}>{m.name}</span>
                  <div className={s.meetingMeta}>
                    <span className={s.meetingDay}>{m.day}</span>
                    <span className={s.meetingTime}>{m.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </VdfDashPanel>

          {/* Action Required — spans 2 rows */}
          <VdfDashPanel title="Action Required" href="/cruise-control" className={s.actionsPanel}>
            {ACTIONS.length === 0 ? (
              <VdfEmptyState icon="🔔" title="All clear" description="No actions pending." />
            ) : (
              <div className={s.actionsList}>
                {ACTIONS.map(a => (
                  <div key={a.id} className={`${s.actionRow} ${s[`pr_${a.priority}`]}`}>
                    <span className={s.actionIcon}>{a.icon}</span>
                    <div className={s.actionBody}>
                      <span className={s.actionName}>{a.name}</span>
                      <span className={s.actionDesc}>{a.desc}</span>
                    </div>
                    <div className={s.actionMeta}>
                      {a.amount && <span className={s.actionAmount}>{a.amount}</span>}
                      <span className={s.actionDue}>{a.dueIn}</span>
                      <VdfStatusBadge label={a.priority} variant={PRIORITY_VARIANT[a.priority]} size="sm" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </VdfDashPanel>

          {/* Planned Withdrawals */}
          <VdfDashPanel title="Planned Withdrawals" href="/goals?filter=withdrawal">
            {/* Next 3 months */}
            <div className={s.withdrawSection}>
              <div className={s.withdrawLabel}>
                <span className={s.withdrawDot} style={{ background: 'var(--color-danger)' }} />
                Next 3 months
              </div>
              {WITHDRAWALS.soon.map(w => (
                <div key={w.id} className={s.withdrawRow}>
                  <div className={s.withdrawInfo}>
                    <span className={s.withdrawName}>{w.name}</span>
                    <span className={s.withdrawGoal}>{w.goal}</span>
                  </div>
                  <div className={s.withdrawFigures}>
                    <span className={s.withdrawAmount}>{w.amount}</span>
                    <span className={s.withdrawDays}>{w.days}d</span>
                  </div>
                </div>
              ))}
            </div>
            {/* 3–6 months */}
            <div className={s.withdrawSection}>
              <div className={s.withdrawLabel}>
                <span className={s.withdrawDot} style={{ background: 'var(--color-warning)' }} />
                3–6 months
              </div>
              {WITHDRAWALS.later.map(w => (
                <div key={w.id} className={s.withdrawRow}>
                  <div className={s.withdrawInfo}>
                    <span className={s.withdrawName}>{w.name}</span>
                    <span className={s.withdrawGoal}>{w.goal}</span>
                  </div>
                  <div className={s.withdrawFigures}>
                    <span className={s.withdrawAmount}>{w.amount}</span>
                    <span className={s.withdrawDays}>{w.days}d</span>
                  </div>
                </div>
              ))}
            </div>
          </VdfDashPanel>

          {/* Follow-ups (Pulses) */}
          <PulseWidget />

          {/* Portfolio Reports — coming soon */}
          <VdfDashPanel title="Portfolio Reports">
            <VdfEmptyState
              icon="📊"
              title="Coming soon"
              description="Quarterly & half-yearly reports for all clients"
            />
          </VdfDashPanel>

        </div>{/* /mainGrid */}

        {/* ── 3. Recent Transactions (full width) ── */}
        <VdfDashPanel title="Recent Transactions" href="/transactions">
          {TRANSACTIONS.length === 0 ? (
            <VdfEmptyState icon="🕐" title="No transactions yet" description="Import data to see transaction history." />
          ) : (
            <div className={s.txnWrap}>
              <table className={s.txnTable}>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Type</th>
                    <th>Scheme</th>
                    <th className={s.txnR}>Amount</th>
                    <th className={s.txnR}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {TRANSACTIONS.map(t => {
                    const isRed = t.type === 'Redemption';
                    return (
                      <tr key={t.id}>
                        <td className={s.txnName}>{t.customer}</td>
                        <td>
                          <span className={isRed ? s.txnTypeRed : s.txnTypeGreen}>{t.type}</span>
                        </td>
                        <td className={s.txnScheme}>{t.scheme}</td>
                        <td className={`${s.txnR} ${isRed ? s.txnAmtRed : s.txnAmtGreen}`}>{t.amount}</td>
                        <td className={`${s.txnR} ${s.txnDate}`}>{t.date}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </VdfDashPanel>

      </div>{/* /body */}
    </div>
  );
}
