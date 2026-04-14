'use client';

import { useState, useMemo, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useSkillQuery } from '@/hooks/useSkill';
import { useToast } from '@/components/toast';
import {
  VdfLoader, VdfButton, VdfStatusBadge, VdfTabs, VdfEmptyState, VdfPageHeader, VdfChannelItem,
} from '@/components/vdf';
import { SnapshotTab } from '@/app/(app)/contacts/[id]/snapshot-tab';
import s from './customer-dashboard.module.css';
import d from '@/styles/data.module.css';

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

interface ClientChannel {
  id: number;
  channel_type: string;
  channel_value: string;
  channel_subtype: string;
  is_primary: boolean;
}

interface ClientAddress {
  id: number;
  address_type: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  country: string;
  pincode: string;
  is_primary: boolean;
}

interface ClientFamily {
  id: string;
  family_name: string | null;
  member_count: number;
}

interface Client {
  id: number;
  client_uid: string;
  name: string;
  prefix: string;
  pan: string | null;
  dob: string | null;
  anniversary_date: string | null;
  survival_status: string;
  date_of_death: string | null;
  risk_profile: string | null;
  is_active: boolean;
  onboarding_status: string;
  client_no: string | null;
  ext_ref_id: string | null;
  referred_by_name: string | null;
  contact_id: number;
  is_family_head: boolean;
  family_id: string | null;
  created_at: string;
  // Contact personal fields
  age: number | null;
  city: string | null;
  marital_status: string | null;
  dependents_count: number | null;
  // JSON sub-objects
  channels: ClientChannel[];
  addresses: ClientAddress[];
  family: ClientFamily | null;
}

interface MemberHolding {
  client_id: number;
  name: string;
  prefix: string;
  units: number;
  invested: number;
}

interface FamilyHolding {
  scheme_code: string;
  scheme_name: string;
  category: string;
  amc: string;
  units: number;
  avg_nav: number;
  nav: number;
  nav_date: string | null;
  value: number;
  invested: number;
  gain_loss: number;
  gain_pct: number;
  members: MemberHolding[];
}

interface FamilyPortfolioSummary {
  total_value: number;
  total_invested: number;
  overall_gain_pct: number;
  scheme_count: number;
  member_count: number;
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

/* ── Family Portfolio Tab ────────────────────────────── */

function FamilyPortfolioTab({ familyId }: { familyId: string }) {
  const { data, isLoading, isError } = useSkillQuery<{
    family_id: string;
    holdings: FamilyHolding[];
    summary: FamilyPortfolioSummary;
  }>('portfolio-skill', 'get_family_portfolio', { family_id: familyId });

  const { data: allocData } = useSkillQuery<{
    allocation: AllocationItem[];
    total_value: number;
  }>('portfolio-skill', 'get_allocation', { family_id: familyId, is_family: true });

  if (isLoading) return <div className={s.tabLoadWrap}><VdfLoader message="Loading family portfolio…" /></div>;
  if (isError) return (
    <div className={s.tabContent}>
      <VdfEmptyState title="Could not load family portfolio" description="There was an error fetching family holdings data." />
    </div>
  );

  const holdings  = data?.data?.holdings ?? [];
  const summary   = data?.data?.summary;
  const allocation = allocData?.data?.allocation ?? [];

  if (holdings.length === 0) {
    return (
      <div className={s.tabContent}>
        <VdfEmptyState
          title="No family holdings on record"
          description="Import statements for family members to see the consolidated family portfolio."
        />
      </div>
    );
  }

  return (
    <div className={s.portfolioWrap}>
      {/* Family summary strip */}
      {summary && (
        <div className={s.familySummaryStrip}>
          <div className={s.familySumItem}>
            <span className={s.familySumLabel}>Members</span>
            <span className={s.familySumValue}>{summary.member_count}</span>
          </div>
          <div className={s.familySumSep} />
          <div className={s.familySumItem}>
            <span className={s.familySumLabel}>Family Value</span>
            <span className={s.familySumValue}>{fmtCurrency(summary.total_value)}</span>
          </div>
          <div className={s.familySumSep} />
          <div className={s.familySumItem}>
            <span className={s.familySumLabel}>Invested</span>
            <span className={s.familySumValue}>{fmtCurrency(summary.total_invested)}</span>
          </div>
          <div className={s.familySumSep} />
          <div className={s.familySumItem}>
            <span className={s.familySumLabel}>Gain</span>
            <span className={`${s.familySumValue} ${summary.overall_gain_pct >= 0 ? s.statUp : s.statDown}`}>
              {fmtPct(summary.overall_gain_pct)}
            </span>
          </div>
          <div className={s.familySumSep} />
          <div className={s.familySumItem}>
            <span className={s.familySumLabel}>Schemes</span>
            <span className={s.familySumValue}>{summary.scheme_count}</span>
          </div>
        </div>
      )}

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
              <th className={s.th}>Held by</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => {
              const isUp = h.gain_loss >= 0;
              return (
                <tr key={h.scheme_code} className={`${s.tr} ${isUp ? s.trUp : s.trDown}`}>
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
                  <td className={s.td}>
                    <div className={s.memberAvatars}>
                      {h.members.map(m => (
                        <span
                          key={m.client_id}
                          className={s.memberAvatar}
                          style={{ background: avatarGradient(m.name) }}
                          title={`${m.prefix} ${m.name} — ${fmtUnits(m.units)} units`}
                        >
                          {initials(m.name)}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Transactions Tab ────────────────────────────────── */

const TXN_TYPE_OPTIONS = [
  { value: '',                  label: 'All types'         },
  { value: 'PURCHASE',          label: 'Purchase'          },
  { value: 'SIP',               label: 'SIP'               },
  { value: 'REDEMPTION',        label: 'Redemption'        },
  { value: 'SWITCH IN',         label: 'Switch In'         },
  { value: 'SWITCH OUT',        label: 'Switch Out'        },
  { value: 'STP IN',            label: 'STP In'            },
  { value: 'STP OUT',           label: 'STP Out'           },
  { value: 'SWP',               label: 'SWP'               },
  { value: 'DIVIDEND PAYOUT',   label: 'Dividend Payout'   },
  { value: 'DIVIDEND REINVEST', label: 'Dividend Reinvest' },
];

const TXN_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'muted'> = {
  PURCHASE: 'success', SIP: 'success',
  REDEMPTION: 'danger', SWP: 'danger',
  'SWITCH IN': 'info', 'STP IN': 'info',
  'SWITCH OUT': 'warning', 'STP OUT': 'warning',
  'DIVIDEND PAYOUT': 'muted', 'DIVIDEND REINVEST': 'muted',
};

const TXN_PAGE_SIZE = 50;

interface TxnTransaction {
  id:             number;
  txn_date:       string;
  txn_type:       string;
  txn_type_label: string;
  flow_direction: string;
  amount:         number;
  units:          number | null;
  nav:            number | null;
  folio_no:       string | null;
  fund_name:      string | null;
  category:       string | null;
  scheme_code:    string;
  tds:            number;
  is_potential_duplicate: boolean;
}

function fmtTxnDate(ds: string): string {
  return new Date(ds).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
}
function fmtTxnAmt(n: number): string {
  if (Math.abs(n) >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)}Cr`;
  if (Math.abs(n) >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(2)}L`;
  return `₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function TransactionsTab({ clientId }: { clientId: number }) {
  const { showToast } = useToast();
  const router = useRouter();

  const [search,   setSearch]   = useState('');
  const [txnType,  setTxnType]  = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [page,     setPage]     = useState(1);

  const params = useMemo(() => ({
    client_id: clientId,
    txn_type:  txnType   || undefined,
    date_from: dateFrom  || undefined,
    date_to:   dateTo    || undefined,
    search:    search    || undefined,
    limit:     TXN_PAGE_SIZE,
    offset:    (page - 1) * TXN_PAGE_SIZE,
  }), [clientId, txnType, dateFrom, dateTo, search, page]);

  const { data, isLoading, isError, error } = useSkillQuery<{ transactions: TxnTransaction[]; total: number }>(
    'transaction-skill', 'get_transactions', params
  );

  if (isError) showToast({ message: error?.message ?? 'Failed to load transactions', type: 'error' });

  const transactions = data?.data?.transactions ?? [];
  const total        = data?.data?.total        ?? 0;
  const totalPages   = Math.ceil(total / TXN_PAGE_SIZE);

  const handleSearch = useCallback((v: string) => { setSearch(v); setPage(1); }, []);

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
            placeholder="Fund name or folio…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>
        <select className={s.filterSelect} value={txnType} onChange={e => { setTxnType(e.target.value); setPage(1); }}>
          {TXN_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className={s.filterDateRange}>
          <input className={s.filterDateInput} type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} />
          <span className={s.filterDateSep}>—</span>
          <input className={s.filterDateInput} type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} />
        </div>
        <VdfButton variant="outline" size="sm" onClick={() => router.push('/import')}>
          Import
        </VdfButton>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className={s.txnLoadingRow}>
          <span className={s.txnLoadingText}>Loading transactions…</span>
        </div>
      )}

      {/* Table */}
      {!isLoading && transactions.length === 0 && (
        <VdfEmptyState
          title="No transactions found"
          description={
            search || txnType || dateFrom || dateTo
              ? 'Try clearing your filters.'
              : 'Import a CAS, InvestWell, or NSE statement to load this client\'s transaction history.'
          }
          action={
            <VdfButton variant="primary" size="sm" onClick={() => router.push('/import')}>
              Import Statement
            </VdfButton>
          }
        />
      )}

      {!isLoading && transactions.length > 0 && (
        <>
          <div className={d.tableWrap}>
            <table className={d.table}>
              <thead>
                <tr>
                  <th style={{ width: 90 }}>Date</th>
                  <th>Fund</th>
                  <th style={{ width: 100 }}>Folio</th>
                  <th style={{ width: 130 }}>Type</th>
                  <th style={{ textAlign: 'right', width: 110 }}>Amount</th>
                  <th style={{ textAlign: 'right', width: 90 }}>Units / NAV</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(txn => (
                  <tr key={txn.id} className={txn.is_potential_duplicate ? s.txnRowDupe : undefined}>
                    <td className={`${d.tdMono} ${s.txnDateCell}`}>{fmtTxnDate(txn.txn_date)}</td>
                    <td>
                      <div className={s.txnFundName}>{txn.fund_name ?? txn.scheme_code}</div>
                      {txn.category && <div className={s.txnFundCat}>{txn.category}</div>}
                    </td>
                    <td className={`${d.tdMono} ${s.txnFolio}`}>{txn.folio_no ?? '—'}</td>
                    <td>
                      <VdfStatusBadge
                        label={txn.txn_type_label}
                        variant={TXN_VARIANT[txn.txn_type] ?? 'muted'}
                        size="sm"
                      />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className={`${s.txnAmount} ${txn.flow_direction === 'OUT' ? s.txnAmountOut : s.txnAmountIn}`}>
                        {txn.flow_direction === 'OUT' ? '−' : '+'}{fmtTxnAmt(txn.amount)}
                      </span>
                      {txn.tds > 0 && <div className={s.txnTds}>TDS ₹{txn.tds.toFixed(2)}</div>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {txn.units != null ? (
                        <>
                          <div className={`${d.tdMono} ${s.txnUnits}`}>
                            {txn.units.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                          </div>
                          {txn.nav != null && <div className={s.txnNav}>@{txn.nav.toFixed(4)}</div>}
                        </>
                      ) : <span className={s.txnNa}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className={d.pagination}>
              <button className={d.pageBtn} onClick={() => setPage(p => p - 1)} disabled={page === 1}>← Prev</button>
              <span className={d.pageInfo}>Page {page} of {totalPages} · {total.toLocaleString('en-IN')} transactions</span>
              <button className={d.pageBtn} onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>Next →</button>
            </div>
          )}
        </>
      )}
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

/* ── CRM Data Tab ────────────────────────────────────── */

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function CrmDataTab({ client }: { client: Client }) {
  const channels  = client.channels  ?? [];
  const addresses = client.addresses ?? [];

  return (
    <div className={s.crmWrap}>

      {/* ── LEFT: Contact card ─────────────────────────── */}
      <div className={s.crmLeft}>

        {/* Identity */}
        <div className={s.crmCard}>
          <div className={s.crmContactHead}>
            <div className={s.crmAvatar} style={{ background: avatarGradient(client.name) }}>
              {initials(client.name)}
            </div>
            <div className={s.crmAvatarName}>{client.prefix} {client.name}</div>
            {client.client_no && (
              <div className={s.crmAvatarSub}>{client.client_no}</div>
            )}
          </div>

          {/* Personal details */}
          <div className={s.crmCardBody}>
            {client.age != null && (
              <div className={s.crmRow}>
                <span className={s.crmLabel}>Age</span>
                <span className={s.crmValue}>{client.age} yrs</span>
              </div>
            )}
            {client.city && (
              <div className={s.crmRow}>
                <span className={s.crmLabel}>City</span>
                <span className={s.crmValue}>{client.city}</span>
              </div>
            )}
            {client.marital_status && (
              <div className={s.crmRow}>
                <span className={s.crmLabel}>Life Situation</span>
                <span className={s.crmValue}>
                  {client.marital_status.charAt(0).toUpperCase() + client.marital_status.slice(1)}
                </span>
              </div>
            )}
            {client.dependents_count != null && (
              <div className={s.crmRow}>
                <span className={s.crmLabel}>Dependents</span>
                <span className={s.crmValue}>{client.dependents_count === 4 ? '4+' : client.dependents_count}</span>
              </div>
            )}
            <div className={s.crmRow}>
              <span className={s.crmLabel}>Added</span>
              <span className={s.crmValue}>{fmtDate(client.created_at)}</span>
            </div>
          </div>
        </div>

        {/* Channels */}
        {channels.length > 0 && (
          <div className={s.crmCard}>
            <div className={s.crmCardHead}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="13" height="13">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.63a19.79 19.79 0 01-3.07-8.67A2 2 0 012 .84h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
              </svg>
              <span className={s.crmCardTitle}>Channels</span>
            </div>
            <div className={s.crmChannels}>
              {channels.map(ch => (
                <VdfChannelItem
                  key={ch.id}
                  channelType={ch.channel_type}
                  channelValue={ch.channel_value}
                  isPrimary={ch.is_primary}
                  subtype={ch.channel_subtype}
                />
              ))}
            </div>
          </div>
        )}

        {/* Family */}
        {client.family && (
          <div className={s.crmCard}>
            <div className={s.crmCardHead}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="13" height="13">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
              </svg>
              <span className={s.crmCardTitle}>Family</span>
            </div>
            <div className={s.crmCardBody}>
              {client.family.family_name && (
                <div className={s.crmRow}>
                  <span className={s.crmLabel}>Family Name</span>
                  <span className={s.crmValue}>{client.family.family_name}</span>
                </div>
              )}
              <div className={s.crmRow}>
                <span className={s.crmLabel}>Role</span>
                <span className={s.crmValue}>
                  {client.is_family_head
                    ? <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>Family Head</span>
                    : 'Member'}
                </span>
              </div>
              <div className={s.crmRow}>
                <span className={s.crmLabel}>Members</span>
                <span className={s.crmValue}>{client.family.member_count}</span>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ── RIGHT: Client record ───────────────────────── */}
      <div className={s.crmRight}>

        {/* KYC & Identity + Client Record side by side */}
        <div className={s.crmRightTop}>

          {/* KYC card */}
          <div className={s.crmCard}>
            <div className={s.crmCardHead}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="13" height="13">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
              <span className={s.crmCardTitle}>KYC &amp; Identity</span>
            </div>
            <div className={s.crmCardBody}>
              <div className={s.crmRow}>
                <span className={s.crmLabel}>PAN</span>
                <span className={`${s.crmValue} ${s.crmValueMono}`}>
                  {client.pan
                    ? <>{client.pan.slice(0, 5)}<span style={{ opacity: 0.4 }}>•••</span>{client.pan.slice(-2)}</>
                    : <span className={s.crmValueMuted}>Not set</span>}
                </span>
              </div>
              <div className={s.crmRow}>
                <span className={s.crmLabel}>Date of Birth</span>
                <span className={s.crmValue}>{fmtDate(client.dob)}</span>
              </div>
              <div className={s.crmRow}>
                <span className={s.crmLabel}>Anniversary</span>
                <span className={s.crmValue}>{fmtDate(client.anniversary_date)}</span>
              </div>
              <div className={s.crmRow}>
                <span className={s.crmLabel}>Survival</span>
                <span className={s.crmValue}>
                  {client.survival_status === 'deceased'
                    ? <span style={{ color: 'var(--color-danger)' }}>Deceased{client.date_of_death ? ` · ${fmtDate(client.date_of_death)}` : ''}</span>
                    : 'Alive'}
                </span>
              </div>
              <div className={s.crmRow}>
                <span className={s.crmLabel}>Risk Profile</span>
                <span className={s.crmValue}>
                  {client.risk_profile
                    ? <span style={{ color: RISK_COLORS[client.risk_profile] ?? 'var(--color-fg)', fontWeight: 600 }}>
                        {client.risk_profile.charAt(0).toUpperCase() + client.risk_profile.slice(1)}
                      </span>
                    : <span className={s.crmValueMuted}>Not set</span>}
                </span>
              </div>
            </div>
          </div>

          {/* Client record card */}
          <div className={s.crmCard}>
            <div className={s.crmCardHead}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="13" height="13">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span className={s.crmCardTitle}>Client Record</span>
            </div>
            <div className={s.crmCardBody}>
              <div className={s.crmRow}>
                <span className={s.crmLabel}>Client No.</span>
                <span className={`${s.crmValue} ${s.crmValueMono}`}>
                  {client.client_no ?? <span className={s.crmValueMuted}>—</span>}
                </span>
              </div>
              <div className={s.crmRow}>
                <span className={s.crmLabel}>Ext Ref ID</span>
                <span className={`${s.crmValue} ${s.crmValueMono}`}>
                  {client.ext_ref_id ?? <span className={s.crmValueMuted}>—</span>}
                </span>
              </div>
              <div className={s.crmRow}>
                <span className={s.crmLabel}>Referred By</span>
                <span className={s.crmValue}>
                  {client.referred_by_name ?? <span className={s.crmValueMuted}>—</span>}
                </span>
              </div>
              <div className={s.crmRow}>
                <span className={s.crmLabel}>Onboarding</span>
                <span className={s.crmValue}>
                  <VdfStatusBadge
                    label={client.onboarding_status.replace('_', ' ')}
                    variant={
                      client.onboarding_status === 'completed' ? 'success' :
                      client.onboarding_status === 'in_progress' ? 'warning' :
                      client.onboarding_status === 'cancelled' ? 'danger' : 'muted'
                    }
                    size="sm"
                  />
                </span>
              </div>
              <div className={s.crmRow}>
                <span className={s.crmLabel}>Client Since</span>
                <span className={s.crmValue}>{fmtDate(client.created_at)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Addresses */}
        {addresses.length > 0 && (
          <div className={s.crmCard}>
            <div className={s.crmCardHead}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="13" height="13">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
              </svg>
              <span className={s.crmCardTitle}>Addresses</span>
            </div>
            <div className={s.crmCardBody}>
              {addresses.map(addr => (
                <div key={addr.id} className={s.crmAddress}>
                  <div className={s.crmAddressType}>
                    {addr.address_type.toUpperCase()}
                    {addr.is_primary && <span className={s.crmAddressPrimaryDot} />}
                  </div>
                  <div>
                    {addr.line1}
                    {addr.line2 && <>, {addr.line2}</>}
                  </div>
                  <div style={{ color: 'var(--color-muted)', fontSize: '0.78rem', marginTop: 2 }}>
                    {[addr.city, addr.state, addr.pincode].filter(Boolean).join(', ')}
                    {addr.country && addr.country !== 'India' && ` · ${addr.country}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty addresses placeholder */}
        {addresses.length === 0 && (
          <div className={s.crmCard}>
            <div className={s.crmCardHead}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="13" height="13">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
              </svg>
              <span className={s.crmCardTitle}>Addresses</span>
            </div>
            <div className={s.crmCardBody}>
              <p className={s.crmEmptyHint}>No addresses on record. Add one during conversion or edit the client.</p>
            </div>
          </div>
        )}

      </div>
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
  const initialTab = ['portfolio', 'transactions', 'snapshot', 'crm', 'goals'].includes(tabParam ?? '')
    ? tabParam!
    : 'portfolio';
  const [activeTab,    setActiveTab]    = useState(initialTab);
  const [portfolioView, setPortfolioView] = useState<'individual' | 'family'>('individual');

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
    { id: 'portfolio',    label: 'Portfolio' },
    { id: 'transactions', label: 'Transactions' },
    { id: 'snapshot',     label: 'Financial Snapshot' },
    { id: 'crm',          label: 'CRM Data' },
    { id: 'goals',        label: 'Goals' },
  ];

  const gain   = summary ? summary.current_value - summary.total_invested : null;
  const gainUp = gain != null && gain >= 0;

  return (
    <div className={s.page}>
      {/* ── Compact profile header — stats folded into meta row ── */}
      <VdfPageHeader
        className={s.heroHeader}
        eyebrow={client.client_no ?? 'CUSTOMER DASHBOARD'}
        title={clientDisplayName}
        meta={
          <div className={s.heroMeta}>
            {/* Nav breadcrumb */}
            <button className={s.backBtn} onClick={() => router.push('/clients')}>← Clients</button>
            {client.risk_profile && (
              <>
                <span className={s.metaSep}>·</span>
                <span className={s.riskPill} style={{ color: RISK_COLORS[client.risk_profile] }}>
                  <span className={s.riskDot} style={{ background: RISK_COLORS[client.risk_profile] }} />
                  {client.risk_profile.charAt(0).toUpperCase() + client.risk_profile.slice(1)}
                </span>
              </>
            )}
            {client.is_active === false && <><span className={s.metaSep}>·</span><span className={s.inactiveTag}>Inactive</span></>}

            {/* Inline portfolio stats */}
            {summary && (
              <>
                <span className={s.metaSep} aria-hidden>|</span>
                <span className={s.inlineStat}>
                  <span className={s.inlineStatLabel}>Value</span>
                  <span className={s.inlineStatValue}>{fmtCurrency(summary.current_value)}</span>
                </span>
                <span className={s.metaSep}>·</span>
                <span className={s.inlineStat}>
                  <span className={s.inlineStatLabel}>Invested</span>
                  <span className={s.inlineStatValue}>{fmtCurrency(summary.total_invested)}</span>
                </span>
                <span className={s.metaSep}>·</span>
                <span className={s.inlineStat}>
                  <span className={s.inlineStatLabel}>Gain</span>
                  <span className={`${s.inlineStatValue} ${gainUp ? s.statUp : s.statDown}`}>
                    {fmtCurrency(gain!)} <span className={s.inlineStatSub}>{fmtPct(summary.overall_return_pct)}</span>
                  </span>
                </span>
                <span className={s.metaSep}>·</span>
                <span className={s.inlineStat}>
                  <span className={s.inlineStatLabel}>XIRR</span>
                  <span className={`${s.inlineStatValue} ${(summary.xirr_pct ?? 0) >= 0 ? s.statUp : s.statDown}`}>
                    {fmtPct(summary.xirr_pct)}
                  </span>
                </span>
                {summary.sip_count > 0 && (
                  <>
                    <span className={s.metaSep}>·</span>
                    <span className={s.inlineStat}>
                      <span className={s.inlineStatLabel}>{summary.sip_count} SIP{summary.sip_count !== 1 ? 's' : ''}</span>
                      <span className={s.inlineStatValue}>{fmtCurrency(summary.sip_total_monthly)}/mo</span>
                    </span>
                  </>
                )}
              </>
            )}
            {summaryLoading && <span className={s.metaLoading}>Loading portfolio…</span>}
          </div>
        }
        actions={<>
          {client.is_family_head && client.family_id && (
            <div className={s.portfolioViewToggle}>
              <button
                className={`${s.portfolioViewBtn} ${portfolioView === 'individual' ? s.portfolioViewBtnActive : ''}`}
                onClick={() => setPortfolioView('individual')}
              >Individual</button>
              <button
                className={`${s.portfolioViewBtn} ${portfolioView === 'family' ? s.portfolioViewBtnActive : ''}`}
                onClick={() => setPortfolioView('family')}
              >Family</button>
            </div>
          )}
          <div className={s.avatarSmall} style={avatarStyle}>{initials(client.name)}</div>
          <VdfButton variant="ghost" size="sm" onClick={() => router.push('/import')}>Import Data</VdfButton>
        </>}
      />

      {/* ── Inactive warning ── */}
      {client.is_active === false && (
        <div className={s.inactiveBanner}>
          <span className={s.inactiveDot} />
          This client is inactive — portfolio is read-only.
        </div>
      )}

      {/* ── Tabs ── */}
      <div className={s.tabsBar}>
        <VdfTabs tabs={TABS} activeId={activeTab} onChange={setActiveTab} variant="underline" />
      </div>

      {/* ── Tab content ── */}
      <div className={s.tabPanel}>
        {activeTab === 'portfolio' && (
          portfolioView === 'family' && client.is_family_head && client.family_id
            ? <FamilyPortfolioTab familyId={client.family_id} />
            : <PortfolioTab clientId={clientId} />
        )}
        {activeTab === 'transactions' && <TransactionsTab clientId={clientId} />}
        {activeTab === 'snapshot'     && (
          <SnapshotTab
            contactId={client.contact_id}
            isClient={true}
            contactName={clientDisplayName}
          />
        )}
        {activeTab === 'crm'          && <CrmDataTab client={client} />}
        {activeTab === 'goals'        && <GoalsTab        clientId={clientId} />}
      </div>
    </div>
  );
}
