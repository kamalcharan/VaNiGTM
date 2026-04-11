'use client';

import { useMemo } from 'react';
import { useMe } from '@/hooks';
import { VdfPageHeader, VdfStatCard, VdfStatusBadge } from '@/components/vdf';
import s from './dashboard-page.module.css';

// ── Dummy data ────────────────────────────────────────────────────────────────
const GOALS_SUMMARY = {
  total: 38, onTrack: 24, needsAttention: 9, offTrack: 5,
  targetValue: 42000000, currentValue: 26500000,
  lastCalculated: '2026-04-11T06:00:00Z',
};

const MEETINGS_TODAY = [
  { id: 1, name: 'Rohit Sharma', time: '10:30 AM', type: 'video' as const },
  { id: 2, name: 'Priya Mehta',  time: '2:00 PM',  type: 'office' as const },
  { id: 3, name: 'Vikram Nair',  time: '4:30 PM',  type: 'phone' as const },
];
const MEETINGS_UPCOMING = [
  { id: 4, name: 'Sunita Patel',  day: 'Tomorrow',  time: '11:00 AM' },
  { id: 5, name: 'Deepa Krishnan', day: 'Mon 13 Apr', time: '3:00 PM'  },
];

type Priority = 'critical' | 'high' | 'medium' | 'low';
const PENDING_ACTIONS: {
  id: number; name: string; action: string; desc: string;
  amount?: string; dueIn: string; priority: Priority;
}[] = [
  { id: 1, name: 'Rajesh Kumar',  action: '⚡', desc: 'SIP renewal due',          amount: '₹25,000', dueIn: '3 days',  priority: 'critical' },
  { id: 2, name: 'Sunita Patel',  action: '⚖️', desc: 'Portfolio rebalancing',    amount: undefined, dueIn: '5 days',  priority: 'high'     },
  { id: 3, name: 'Amit Shah',     action: '🎯', desc: 'Goal review — shortfall',  amount: undefined, dueIn: '7 days',  priority: 'high'     },
  { id: 4, name: 'Deepa Nair',    action: '📋', desc: 'Annual review due',        amount: undefined, dueIn: '12 days', priority: 'medium'   },
  { id: 5, name: 'Kiran Rao',     action: '📄', desc: 'Document collection pending', amount: undefined, dueIn: '15 days', priority: 'medium' },
  { id: 6, name: 'Manju Desai',   action: '🎂', desc: 'Birthday next week',       amount: undefined, dueIn: '6 days',  priority: 'low'      },
];

const WITHDRAWALS = {
  next3Months: [
    { id: 1, name: 'Priya Mehta',   goal: 'Retirement Fund',  amount: '₹5.2L',  days: 28 },
    { id: 2, name: 'Rohit Sharma',  goal: 'Child Education',  amount: '₹3.8L',  days: 45 },
  ],
  next6Months: [
    { id: 3, name: 'Sunita Patel',  goal: 'Home Purchase',    amount: '₹12.5L', days: 112 },
    { id: 4, name: 'Vikram Nair',   goal: 'Business Capital', amount: '₹8.0L',  days: 145 },
  ],
};

const RECENT_TRANSACTIONS = [
  { id: 1, customer: 'Rajesh Kumar', type: 'SIP',       scheme: 'Axis Bluechip Fund',        amount: '₹25,000',  date: '10 Apr 2026' },
  { id: 2, customer: 'Priya Mehta',  type: 'Lumpsum',   scheme: 'HDFC Midcap Opp.',          amount: '₹1,00,000', date: '9 Apr 2026'  },
  { id: 3, customer: 'Amit Shah',    type: 'Redemption',scheme: 'ICICI Pru Liquid Fund',     amount: '₹50,000',  date: '8 Apr 2026'  },
  { id: 4, customer: 'Sunita Patel', type: 'SIP',       scheme: 'Parag Parikh Flexi Cap',    amount: '₹10,000',  date: '7 Apr 2026'  },
  { id: 5, customer: 'Kiran Rao',    type: 'STP',       scheme: 'Mirae Asset Large Cap',     amount: '₹5,000',   date: '6 Apr 2026'  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function fmtCr(n: number) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)} Cr`;
  if (n >= 100000)   return `₹${(n / 100000).toFixed(1)} L`;
  return `₹${n.toLocaleString('en-IN')}`;
}

const MEETING_ICON: Record<'video' | 'office' | 'phone', string> = {
  video:  '📹',
  office: '🏢',
  phone:  '📞',
};

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
    new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    []
  );

  const goalsProgress = Math.round((GOALS_SUMMARY.currentValue / GOALS_SUMMARY.targetValue) * 100);
  const criticalCount = PENDING_ACTIONS.filter(a => a.priority === 'critical').length;

  return (
    <div className={s.page}>
      <VdfPageHeader
        eyebrow="DASHBOARD"
        title={`${greeting()}`}
        titleEm={user?.name ?? tenant?.name ?? ''}
        meta={<span className={s.headerMeta}>{today}</span>}
        actions={
          <div className={s.headerActions}>
            <span className={s.dummyBadge}>DEMO DATA</span>
            <button className={s.refreshBtn} type="button" title="Refresh">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" />
              </svg>
              <span>Refresh</span>
            </button>
          </div>
        }
      />

      <div className={s.body}>

        {/* ── 1. Summary Cards ── */}
        <div className={s.summaryGrid}>
          <div className={`${s.summaryCard} ${s.accentPrimary}`}>
            <div className={s.summaryMeta}>TOTAL AUM</div>
            <div className={s.summaryValue}>{fmtCr(124000000)}</div>
            <div className={s.summaryChange}>
              <span className={s.changeUp}>▲ 2.3%</span>
              <span className={s.changeSub}>MTD</span>
            </div>
          </div>
          <div className={`${s.summaryCard} ${s.accentSuccess}`}>
            <div className={s.summaryMeta}>ACTIVE CLIENTS</div>
            <div className={s.summaryValue}>147</div>
            <div className={s.summaryChange}>
              <span className={s.changeSub}>of 163 total</span>
            </div>
          </div>
          <div className={`${s.summaryCard} ${s.accentWarning}`}>
            <div className={s.summaryMeta}>PENDING ACTIONS</div>
            <div className={s.summaryValue}>8</div>
            <div className={s.summaryChange}>
              <span className={s.changeCritical}>{criticalCount} critical</span>
            </div>
          </div>
          <div className={`${s.summaryCard} ${s.accentInfo}`}>
            <div className={s.summaryMeta}>DOWNLOADS (YESTERDAY)</div>
            <div className={s.summaryValue}>41</div>
            <div className={s.summaryChange}>
              <span className={s.changeSub}>41 ok · 0 failed</span>
            </div>
          </div>
        </div>

        {/* ── 2. Main 3-col grid ── */}
        <div className={s.mainGrid}>

          {/* Goals Overview */}
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>Goals Overview</span>
              <a href="/goals" className={s.viewAll}>View all →</a>
            </div>
            <div className={s.goalsStats}>
              <div className={s.goalsStat}>
                <span className={s.goalsStatNum}>{GOALS_SUMMARY.total}</span>
                <span className={s.goalsStatLabel}>Total</span>
              </div>
              <div className={`${s.goalsStat} ${s.gsSuccess}`}>
                <span className={s.goalsStatNum}>{GOALS_SUMMARY.onTrack}</span>
                <span className={s.goalsStatLabel}>On Track</span>
              </div>
              <div className={`${s.goalsStat} ${s.gsWarning}`}>
                <span className={s.goalsStatNum}>{GOALS_SUMMARY.needsAttention}</span>
                <span className={s.goalsStatLabel}>Attention</span>
              </div>
              <div className={`${s.goalsStat} ${s.gsDanger}`}>
                <span className={s.goalsStatNum}>{GOALS_SUMMARY.offTrack}</span>
                <span className={s.goalsStatLabel}>Off Track</span>
              </div>
            </div>
            <div className={s.goalsProgress}>
              <div className={s.goalsProgressBar}>
                <div className={s.goalsProgressFill} style={{ width: `${goalsProgress}%` }} />
              </div>
              <div className={s.goalsProgressMeta}>
                <span>{fmtCr(GOALS_SUMMARY.currentValue)} current</span>
                <span className={s.goalsTarget}>{fmtCr(GOALS_SUMMARY.targetValue)} target</span>
              </div>
            </div>
            <div className={s.panelFooter}>
              <span className={s.panelFooterText}>Last calculated 6:00 AM today</span>
            </div>
          </div>

          {/* Today's Meetings */}
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>Today&apos;s Meetings</span>
              <a href="/meetings" className={s.viewAll}>View all →</a>
            </div>
            <div className={s.meetingsList}>
              {MEETINGS_TODAY.map(m => (
                <div key={m.id} className={s.meetingRow}>
                  <span className={s.meetingIcon}>{MEETING_ICON[m.type]}</span>
                  <span className={s.meetingName}>{m.name}</span>
                  <span className={s.meetingTime}>{m.time}</span>
                </div>
              ))}
            </div>
            <div className={s.panelDivider}>
              <span className={s.panelDividerLabel}>Upcoming this week</span>
            </div>
            <div className={s.meetingsList}>
              {MEETINGS_UPCOMING.map(m => (
                <div key={m.id} className={`${s.meetingRow} ${s.meetingUpcoming}`}>
                  <span className={s.meetingIcon}>📅</span>
                  <span className={s.meetingName}>{m.name}</span>
                  <div className={s.meetingUpcomingRight}>
                    <span className={s.meetingDay}>{m.day}</span>
                    <span className={s.meetingTime}>{m.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Required — spans 2 rows */}
          <div className={`${s.panel} ${s.panelActions}`}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>Action Required</span>
              <a href="/cruise-control" className={s.viewAll}>View all →</a>
            </div>
            <div className={s.actionsList}>
              {PENDING_ACTIONS.map(a => (
                <div key={a.id} className={`${s.actionRow} ${s[`apr_${a.priority}`]}`}>
                  <div className={s.actionLeft}>
                    <span className={s.actionEmoji}>{a.action}</span>
                    <div className={s.actionInfo}>
                      <span className={s.actionName}>{a.name}</span>
                      <span className={s.actionDesc}>{a.desc}</span>
                    </div>
                  </div>
                  <div className={s.actionRight}>
                    {a.amount && <span className={s.actionAmount}>{a.amount}</span>}
                    <span className={s.actionDue}>{a.dueIn}</span>
                    <VdfStatusBadge label={a.priority} variant={PRIORITY_VARIANT[a.priority]} size="sm" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Planned Withdrawals */}
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>Planned Withdrawals</span>
              <a href="/goals?filter=withdrawal" className={s.viewAll}>View all →</a>
            </div>
            <div className={s.withdrawalSection}>
              <div className={s.withdrawalLabel}>
                <span className={s.wLabelDot} style={{ background: 'var(--color-danger)' }} />
                Next 3 months
              </div>
              {WITHDRAWALS.next3Months.map(w => (
                <div key={w.id} className={s.withdrawalRow}>
                  <div className={s.wInfo}>
                    <span className={s.wName}>{w.name}</span>
                    <span className={s.wGoal}>{w.goal}</span>
                  </div>
                  <div className={s.wRight}>
                    <span className={s.wAmount}>{w.amount}</span>
                    <span className={s.wDays}>{w.days}d</span>
                  </div>
                </div>
              ))}
            </div>
            <div className={s.withdrawalSection}>
              <div className={s.withdrawalLabel}>
                <span className={s.wLabelDot} style={{ background: 'var(--color-warning)' }} />
                3–6 months
              </div>
              {WITHDRAWALS.next6Months.map(w => (
                <div key={w.id} className={s.withdrawalRow}>
                  <div className={s.wInfo}>
                    <span className={s.wName}>{w.name}</span>
                    <span className={s.wGoal}>{w.goal}</span>
                  </div>
                  <div className={s.wRight}>
                    <span className={s.wAmount}>{w.amount}</span>
                    <span className={s.wDays}>{w.days}d</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Portfolio Reports */}
          <div className={`${s.panel} ${s.panelComingSoon}`}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>Portfolio Reports</span>
            </div>
            <div className={s.comingSoonBody}>
              <div className={s.comingSoonIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <span className={s.comingSoonTitle}>Coming soon</span>
              <span className={s.comingSoonDesc}>Quarterly &amp; half-yearly reports for all clients</span>
            </div>
          </div>

        </div>{/* /mainGrid */}

        {/* ── 3. Recent Transactions (full width) ── */}
        <div className={s.panel}>
          <div className={s.panelHeader}>
            <span className={s.panelTitle}>Recent Transactions</span>
            <a href="/transactions" className={s.viewAll}>View all →</a>
          </div>
          <div className={s.txnTableWrap}>
            <table className={s.txnTable}>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Type</th>
                  <th>Scheme</th>
                  <th className={s.txnRight}>Amount</th>
                  <th className={s.txnRight}>Date</th>
                </tr>
              </thead>
              <tbody>
                {RECENT_TRANSACTIONS.map(t => (
                  <tr key={t.id}>
                    <td className={s.txnName}>{t.customer}</td>
                    <td>
                      <span className={t.type === 'Redemption' ? s.txnTypeRed : s.txnTypeGreen}>
                        {t.type}
                      </span>
                    </td>
                    <td className={s.txnScheme}>{t.scheme}</td>
                    <td className={`${s.txnRight} ${t.type === 'Redemption' ? s.txnAmtRed : s.txnAmtGreen}`}>
                      {t.amount}
                    </td>
                    <td className={`${s.txnRight} ${s.txnDate}`}>{t.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>{/* /body */}
    </div>
  );
}
