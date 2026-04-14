'use client';

import { useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useSkillQuery } from '@/hooks/useSkill';
import { useToast } from '@/components/toast';
import {
  VdfLoader, VdfButton, VdfStatusBadge, VdfTabs, VdfEmptyState, VdfPageHeader,
} from '@/components/vdf';
import s from './customer-dashboard.module.css';

/* ── Types ───────────────────────────────────────────── */

interface Holding {
  scheme_name: string;
  scheme_code: string;
  category: string;
  amc: string;
  units: number;
  nav: number;
  value: number;
  invested: number;
  gain_loss: number;
  gain_pct: number;
}

interface PortfolioSummary {
  total_invested: number;
  current_value: number;
  overall_return_pct: number;
  xirr_pct: number;
  top_performers: { scheme_name: string; gain_pct: number }[];
  bottom_performers: { scheme_name: string; gain_pct: number }[];
  sip_count: number;
  sip_total_monthly: number;
}

interface AllocationItem {
  category: string;
  value: number;
  percentage: number;
  scheme_count: number;
}

interface Client {
  id: number;
  name: string;
  prefix: string;
  pan: string | null;
  risk_profile: string | null;
  is_active: boolean;
  onboarding_status: string;
  client_no: string | null;
  contact_id: number;
}

/* ── Helpers ─────────────────────────────────────────── */

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, var(--color-primary), color-mix(in srgb, var(--color-primary) 60%, #000))',
  'linear-gradient(135deg, var(--color-accent), color-mix(in srgb, var(--color-accent) 60%, #000))',
  'linear-gradient(135deg, var(--color-info), color-mix(in srgb, var(--color-info) 60%, #000))',
  'linear-gradient(135deg, var(--color-warning), color-mix(in srgb, var(--color-warning) 60%, #000))',
  'linear-gradient(135deg, var(--color-success), color-mix(in srgb, var(--color-success) 60%, #000))',
];

function avatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function fmtCurrency(n: number | undefined | null): string {
  if (n == null) return '—';
  if (Math.abs(n) >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)}Cr`;
  if (Math.abs(n) >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)}L`;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function fmtPct(n: number | undefined | null): string {
  if (n == null) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function fmtUnits(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

const RISK_COLORS: Record<string, string> = {
  conservative: 'var(--color-info)',
  moderate:     'var(--color-warning)',
  aggressive:   'var(--color-danger)',
};

const CATEGORY_COLORS: Record<string, string> = {
  'Equity':            'var(--color-danger)',
  'Debt':              'var(--color-info)',
  'Hybrid':            'var(--color-warning)',
  'Gold':              'var(--color-accent)',
  'Index':             'var(--color-success)',
  'International':     'var(--color-primary)',
  'Liquid':            'var(--color-muted)',
};

function categoryColor(cat: string): string {
  for (const [key, val] of Object.entries(CATEGORY_COLORS)) {
    if (cat?.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return 'var(--color-muted)';
}

/* ── Summary stat strip ──────────────────────────────── */

function StatStrip({ summary }: { summary: PortfolioSummary }) {
  const gain = summary.current_value - summary.total_invested;
  const isUp  = gain >= 0;

  return (
    <div className={s.statStrip}>
      <div className={s.statItem}>
        <span className={s.statLabel}>Current Value</span>
        <span className={`${s.statValue} ${s.statPrimary}`}>{fmtCurrency(summary.current_value)}</span>
      </div>
      <div className={s.statDivider} />
      <div className={s.statItem}>
        <span className={s.statLabel}>Invested</span>
        <span className={s.statValue}>{fmtCurrency(summary.total_invested)}</span>
      </div>
      <div className={s.statDivider} />
      <div className={s.statItem}>
        <span className={s.statLabel}>Gain / Loss</span>
        <span className={`${s.statValue} ${isUp ? s.statUp : s.statDown}`}>
          {fmtCurrency(gain)}
          <span className={s.statSub}>{fmtPct(summary.overall_return_pct)}</span>
        </span>
      </div>
      <div className={s.statDivider} />
      <div className={s.statItem}>
        <span className={s.statLabel}>XIRR</span>
        <span className={`${s.statValue} ${(summary.xirr_pct ?? 0) >= 0 ? s.statUp : s.statDown}`}>
          {fmtPct(summary.xirr_pct)}
        </span>
      </div>
      {summary.sip_count > 0 && (
        <>
          <div className={s.statDivider} />
          <div className={s.statItem}>
            <span className={s.statLabel}>Active SIPs</span>
            <span className={s.statValue}>
              {summary.sip_count}
              <span className={s.statSub}>{fmtCurrency(summary.sip_total_monthly)}/mo</span>
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Portfolio / Holdings Tab ────────────────────────── */

function PortfolioTab({ clientId }: { clientId: number }) {
  const { data, isLoading, isError } = useSkillQuery<{
    holdings: Holding[];
    summary: { total_value: number; total_invested: number; overall_gain_pct: number; scheme_count: number };
  }>('portfolio-skill', 'get_holdings', { client_id: clientId });

  const { data: allocData } = useSkillQuery<{
    allocation: AllocationItem[];
    total_value: number;
  }>('portfolio-skill', 'get_allocation', { client_id: clientId });

  if (isLoading) return <div className={s.tabLoadWrap}><VdfLoader message="Loading portfolio…" /></div>;
  if (isError) return (
    <div className={s.tabContent}>
      <VdfEmptyState title="Could not load portfolio" description="There was an error fetching holdings data." />
    </div>
  );

  const holdings = data?.data?.holdings ?? [];
  const allocation = allocData?.data?.allocation ?? [];

  if (holdings.length === 0) {
    return (
      <div className={s.tabContent}>
        <VdfEmptyState
          title="No holdings on record"
          description="Import a CAS or InvestWell statement to load this client's mutual fund holdings."
          action={<VdfButton variant="primary" size="sm" onClick={() => window.location.href = '/import'}>Import Data</VdfButton>}
        />
      </div>
    );
  }

  return (
    <div className={s.portfolioWrap}>
      {/* Allocation strip */}
      {allocation.length > 0 && (
        <div className={s.allocStrip}>
          {allocation.map(a => (
            <div key={a.category} className={s.allocItem}>
              <div
                className={s.allocBar}
                style={{ width: `${a.percentage}%`, background: categoryColor(a.category) }}
                title={`${a.category}: ${a.percentage.toFixed(1)}%`}
              />
              <span className={s.allocLabel} style={{ color: categoryColor(a.category) }}>
                {a.category}
              </span>
              <span className={s.allocPct}>{a.percentage.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Holdings table */}
      <div className={s.holdingsTable}>
        <table className={s.table}>
          <thead>
            <tr>
              <th className={s.th}>Fund</th>
              <th className={`${s.th} ${s.thRight}`}>Units</th>
              <th className={`${s.th} ${s.thRight}`}>NAV</th>
              <th className={`${s.th} ${s.thRight}`}>Invested</th>
              <th className={`${s.th} ${s.thRight}`}>Current</th>
              <th className={`${s.th} ${s.thRight}`}>Gain / Loss</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => {
              const isUp = h.gain_loss >= 0;
              return (
                <tr
                  key={h.scheme_code}
                  className={`${s.tr} ${isUp ? s.trUp : s.trDown}`}
                >
                  <td className={s.td}>
                    <div className={s.fundName}>{h.scheme_name}</div>
                    <div className={s.fundMeta}>
                      <span className={s.fundAmc}>{h.amc}</span>
                      <span
                        className={s.catBadge}
                        style={{ color: categoryColor(h.category), borderColor: categoryColor(h.category) }}
                      >
                        {h.category}
                      </span>
                    </div>
                  </td>
                  <td className={`${s.td} ${s.tdRight} ${s.monoVal}`}>{fmtUnits(h.units)}</td>
                  <td className={`${s.td} ${s.tdRight} ${s.monoVal}`}>₹{h.nav.toFixed(4)}</td>
                  <td className={`${s.td} ${s.tdRight}`}>{fmtCurrency(h.invested)}</td>
                  <td className={`${s.td} ${s.tdRight} ${s.valStrong}`}>{fmtCurrency(h.value)}</td>
                  <td className={`${s.td} ${s.tdRight}`}>
                    <div className={`${s.gainCell} ${isUp ? s.gainUp : s.gainDown}`}>
                      <span>{fmtCurrency(h.gain_loss)}</span>
                      <span className={s.gainPct}>{fmtPct(h.gain_pct)}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Performers */}
    </div>
  );
}

/* ── Transactions Tab ────────────────────────────────── */

function TransactionsTab({ clientId }: { clientId: number }) {
  // TODO Phase 4: Wire to transaction-skill.get_client_transactions
  // For now, show structured empty state with filter chrome in place

  const [search,   setSearch]   = useState('');
  const [txnType,  setTxnType]  = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  return (
    <div className={s.txnWrap}>
      {/* Filter bar */}
      <div className={s.filterBar}>
        <div className={s.filterSearch}>
          <svg className={s.filterSearchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            className={s.filterInput}
            placeholder="Search by fund or folio…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className={s.filterSelect} value={txnType} onChange={e => setTxnType(e.target.value)}>
          <option value="">All types</option>
          <option value="SIP">SIP</option>
          <option value="PURCHASE">Purchase</option>
          <option value="REDEMPTION">Redemption</option>
          <option value="SWITCH IN">Switch In</option>
          <option value="SWITCH OUT">Switch Out</option>
          <option value="STP IN">STP In</option>
          <option value="STP OUT">STP Out</option>
          <option value="DIVIDEND PAYOUT">Dividend Payout</option>
          <option value="DIVIDEND REINVEST">Dividend Reinvest</option>
        </select>
        <div className={s.filterDateRange}>
          <input className={s.filterDateInput} type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="From" />
          <span className={s.filterDateSep}>—</span>
          <input className={s.filterDateInput} type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="To" />
        </div>
        <VdfButton variant="outline" size="sm">
          + Manual Entry
        </VdfButton>
      </div>

      {/* Transaction table — empty state until transaction-skill is wired */}
      <VdfEmptyState
        title="No transactions found"
        description="Import a CAS, InvestWell, or NSE statement to load this client's transaction history. You can also add transactions manually."
        action={
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <VdfButton variant="primary" size="sm" onClick={() => window.location.href = '/import'}>
              Import Statement
            </VdfButton>
            <VdfButton variant="outline" size="sm">
              + Add Manual Entry
            </VdfButton>
          </div>
        }
      />
    </div>
  );
}

/* ── Goals Tab ───────────────────────────────────────── */

function GoalsTab({ clientId }: { clientId: number }) {
  // TODO: Wire to planning-skill.goals_by_client
  return (
    <div className={s.tabContent}>
      <VdfEmptyState
        title="No goals set"
        description="Create financial goals for this client — retirement, education, home purchase — and track progress against their portfolio."
        action={<VdfButton variant="primary" size="sm">+ Create Goal</VdfButton>}
      />
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────── */

export default function CustomerDashboardPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const clientId = Number(id);

  const tabParam   = searchParams?.get('tab') ?? null;
  const initialTab = ['portfolio', 'transactions', 'goals'].includes(tabParam ?? '')
    ? tabParam!
    : 'portfolio';
  const [activeTab, setActiveTab] = useState(initialTab);

  // Client profile (name, risk etc.)
  const { data: clientData, isLoading: clientLoading, isError: clientError } =
    useSkillQuery<{ client: Client | null }>('client-skill', 'get_client', { client_id: clientId });

  // Portfolio summary for stat strip
  const { data: summaryData, isLoading: summaryLoading } =
    useSkillQuery<{ data: PortfolioSummary }>('portfolio-skill', 'get_portfolio_summary', { client_id: clientId });

  if (clientLoading) return <VdfLoader overlay message="Loading client…" />;
  if (clientError || !clientData?.data?.client) {
    return (
      <div className={s.page}>
        <div className={s.errorBanner}>Client not found or you don't have access.</div>
      </div>
    );
  }

  const client  = clientData.data.client;
  const summary = (summaryData as any)?.data ?? null;

  const clientDisplayName = `${client.prefix ? client.prefix + ' ' : ''}${client.name}`;
  const avatarStyle = { background: avatarGradient(client.name) };

  const TABS = [
    { id: 'portfolio',     label: 'Portfolio' },
    { id: 'transactions',  label: 'Transactions' },
    { id: 'goals',         label: 'Goals' },
  ];

  return (
    <div className={s.page}>
      {/* ── Page header ── */}
      <VdfPageHeader
        eyebrow="CUSTOMER DASHBOARD"
        title={clientDisplayName}
        meta={<>
          <button
            className={s.backBtn}
            onClick={() => router.push('/clients')}
          >
            ← Clients
          </button>
          {' · '}
          <button
            className={s.backBtn}
            onClick={() => router.push(`/clients/${clientId}`)}
          >
            CRM Profile
          </button>
          {client.risk_profile && (
            <span className={s.riskPill} style={{ color: RISK_COLORS[client.risk_profile] ?? 'var(--color-muted)' }}>
              {' · '}
              <span
                className={s.riskDot}
                style={{ background: RISK_COLORS[client.risk_profile] ?? 'var(--color-muted)' }}
              />
              {client.risk_profile.charAt(0).toUpperCase() + client.risk_profile.slice(1)}
            </span>
          )}
          {client.is_active === false && (
            <span className={s.inactiveTag}>{' · '}Inactive</span>
          )}
        </>}
        actions={<>
          <div className={s.avatarSmall} style={avatarStyle}>
            {initials(client.name)}
          </div>
          <VdfButton variant="outline" size="sm" onClick={() => router.push(`/clients/${clientId}`)}>
            View CRM Profile
          </VdfButton>
          <VdfButton variant="ghost" size="sm" onClick={() => router.push('/import')}>
            Import Data
          </VdfButton>
        </>}
      />

      {/* ── Inactive warning ── */}
      {client.is_active === false && (
        <div className={s.inactiveBanner}>
          <span className={s.inactiveDot} />
          This client is inactive — portfolio is read-only.
        </div>
      )}

      {/* ── Portfolio stat strip ── */}
      {summaryLoading ? (
        <div className={s.statStripSkeleton}>
          {[1, 2, 3, 4].map(i => <div key={i} className={s.statSkeletonItem} />)}
        </div>
      ) : summary ? (
        <StatStrip summary={summary} />
      ) : (
        <div className={s.noDataBanner}>
          No portfolio data yet — import a statement to get started.
        </div>
      )}

      {/* ── Tabs ── */}
      <div className={s.tabsBar}>
        <VdfTabs tabs={TABS} activeId={activeTab} onChange={setActiveTab} variant="underline" />
      </div>

      {/* ── Tab content ── */}
      <div className={s.tabPanel}>
        {activeTab === 'portfolio'    && <PortfolioTab    clientId={clientId} />}
        {activeTab === 'transactions' && <TransactionsTab clientId={clientId} />}
        {activeTab === 'goals'        && <GoalsTab        clientId={clientId} />}
      </div>
    </div>
  );
}
