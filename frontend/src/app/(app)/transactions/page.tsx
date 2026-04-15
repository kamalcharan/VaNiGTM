'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSkillQuery } from '@/hooks/useSkill';
import { useToast } from '@/components/toast';
import {
  VdfLoader, VdfEmptyState, VdfButton, VdfStatusBadge, VdfPageHeader,
} from '@/components/vdf';
import s from './transactions.module.css';
import d from '@/styles/data.module.css';

/* ── Types ───────────────────────────────────────────── */

interface Transaction {
  id:               number;
  txn_date:         string;
  txn_type:         string;
  txn_type_label:   string;
  flow_direction:   string;
  amount:           number;
  units:            number | null;
  nav:              number | null;
  folio_no:         string | null;
  fund_name:        string | null;
  category:         string | null;
  scheme_code:      string;
  tds:              number;
  is_potential_duplicate: boolean;
  client_id:        number;
  client_name:      string;
  client_prefix:    string;
  client_no:        string | null;
}

interface TransactionsData {
  transactions: Transaction[];
  total:        number;
}

interface SummaryData {
  total_invested:  number;
  total_redeemed:  number;
  net_flow:        number;
  total_count:     number;
  client_count:    number;
  scheme_count:    number;
  duplicate_count: number;
}

/* ── Constants ───────────────────────────────────────── */

const PAGE_SIZE = 50;

const PERIOD_OPTIONS = [
  { id: '1m',  label: '1M'  },
  { id: '3m',  label: '3M'  },
  { id: '6m',  label: '6M'  },
  { id: '1y',  label: '1Y'  },
  { id: 'all', label: 'All' },
];

const TYPE_OPTIONS = [
  { value: '',                  label: 'All types'        },
  { value: 'PURCHASE',          label: 'Purchase'         },
  { value: 'SIP',               label: 'SIP'              },
  { value: 'REDEMPTION',        label: 'Redemption'       },
  { value: 'SWITCH IN',         label: 'Switch In'        },
  { value: 'SWITCH OUT',        label: 'Switch Out'       },
  { value: 'STP IN',            label: 'STP In'           },
  { value: 'STP OUT',           label: 'STP Out'          },
  { value: 'SWP',               label: 'SWP'              },
  { value: 'DIVIDEND PAYOUT',   label: 'Dividend Payout'  },
  { value: 'DIVIDEND REINVEST', label: 'Dividend Reinvest'},
];

const TYPE_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'muted'> = {
  PURCHASE:           'success',
  SIP:                'success',
  REDEMPTION:         'danger',
  SWP:                'danger',
  'SWITCH IN':        'info',
  'STP IN':           'info',
  'SWITCH OUT':       'warning',
  'STP OUT':          'warning',
  'DIVIDEND PAYOUT':  'muted',
  'DIVIDEND REINVEST':'muted',
};

/* ── Helpers ─────────────────────────────────────────── */

function fmtCurrency(n: number): string {
  if (Math.abs(n) >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)}Cr`;
  if (Math.abs(n) >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(2)}L`;
  return `₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: '2-digit',
  });
}

function periodToDateFrom(period: string): string | undefined {
  const now = new Date();
  switch (period) {
    case '1m': { const d = new Date(now); d.setMonth(d.getMonth() - 1);      return d.toISOString().slice(0, 10); }
    case '3m': { const d = new Date(now); d.setMonth(d.getMonth() - 3);      return d.toISOString().slice(0, 10); }
    case '6m': { const d = new Date(now); d.setMonth(d.getMonth() - 6);      return d.toISOString().slice(0, 10); }
    case '1y': { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); }
    default:   return undefined;
  }
}

/* ── Page ────────────────────────────────────────────── */

export default function TransactionsPage() {
  const router        = useRouter();
  const { showToast } = useToast();

  /* ── Filter state ────────────────────────────────── */
  const [period,    setPeriod]    = useState('1y');
  const [txnType,   setTxnType]   = useState('');
  const [search,    setSearch]    = useState('');
  const [dateFrom,  setDateFrom]  = useState('');
  const [dateTo,    setDateTo]    = useState('');
  const [dupeOnly,  setDupeOnly]  = useState(false);
  const [page,      setPage]      = useState(1);

  /* Effective date_from: manual override > period — memoised so the value is
     referentially stable and doesn't cause a new query key on every render */
  const activeDateFrom = useMemo(
    () => dateFrom || periodToDateFrom(period),
    [dateFrom, period],
  );
  const activeDateTo = dateTo || undefined;

  /* ── Queries ─────────────────────────────────────── */
  const txnParams = useMemo(() => ({
    txn_type:          txnType   || undefined,
    date_from:         activeDateFrom,
    date_to:           activeDateTo,
    search:            search    || undefined,
    is_duplicate_only: dupeOnly  || undefined,
    limit:             PAGE_SIZE,
    offset:            (page - 1) * PAGE_SIZE,
  }), [txnType, activeDateFrom, activeDateTo, search, dupeOnly, page]);

  const sumParams = useMemo(() => ({
    date_from: activeDateFrom,
    date_to:   activeDateTo,
  }), [activeDateFrom, activeDateTo]);

  const { data, isLoading, isError, error } = useSkillQuery<TransactionsData>(
    'transaction-skill', 'get_transactions', txnParams, { retry: false }
  );

  const { data: sumData } = useSkillQuery<SummaryData>(
    'transaction-skill', 'get_transaction_summary', sumParams, { retry: false }
  );

  const transactions = data?.data?.transactions ?? [];
  const total        = data?.data?.total        ?? 0;
  const totalPages   = Math.ceil(total / PAGE_SIZE);
  const summary      = sumData?.data;

  /* ── Handlers ────────────────────────────────────── */
  const handlePeriod = useCallback((p: string) => {
    setPeriod(p);
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }, []);

  const handleTypeChange = useCallback((v: string) => {
    setTxnType(v); setPage(1);
  }, []);

  const handleSearch = useCallback((v: string) => {
    setSearch(v); setPage(1);
  }, []);

  /* ── Error toast (useEffect — never call setState during render) ── */
  useEffect(() => {
    if (isError) showToast({ message: error?.message ?? 'Failed to load transactions', type: 'error' });
  }, [isError]); // eslint-disable-line react-hooks/exhaustive-deps

  const netUp = (summary?.net_flow ?? 0) >= 0;

  return (
    <div className={s.page}>

      {/* ── Header ── */}
      <VdfPageHeader
        eyebrow="TRANSACTIONS"
        title="Transactions"
        meta={
          summary ? (
            <>
              <strong>{summary.total_count.toLocaleString('en-IN')}</strong> transactions
              &nbsp;·&nbsp;
              <strong>{summary.client_count}</strong> clients
              &nbsp;·&nbsp;
              <strong>{summary.scheme_count}</strong> schemes
              {summary.duplicate_count > 0 && (
                <span className={s.dupeBadge}>⚠ {summary.duplicate_count} duplicates</span>
              )}
            </>
          ) : undefined
        }
        actions={
          <div className={s.periodPills}>
            {PERIOD_OPTIONS.map(p => (
              <button
                key={p.id}
                className={`${s.periodPill} ${period === p.id && !dateFrom ? s.periodPillActive : ''}`}
                onClick={() => handlePeriod(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      <div className={s.body}>

        {/* ── Loading overlay ── */}
        {isLoading && <VdfLoader overlay message="Loading transactions…" />}

        {/* ── Summary strip ── */}
        {summary && (
          <div className={s.summaryStrip}>
            <div className={s.summaryCard}>
              <span className={s.summaryLabel}>Invested</span>
              <span className={`${s.summaryValue} ${s.valInvested}`}>{fmtCurrency(summary.total_invested)}</span>
            </div>
            <div className={s.summarySep} />
            <div className={s.summaryCard}>
              <span className={s.summaryLabel}>Redeemed</span>
              <span className={`${s.summaryValue} ${s.valRedeemed}`}>{fmtCurrency(summary.total_redeemed)}</span>
            </div>
            <div className={s.summarySep} />
            <div className={s.summaryCard}>
              <span className={s.summaryLabel}>Net Flow</span>
              <span className={`${s.summaryValue} ${netUp ? s.valUp : s.valDown}`}>
                {netUp ? '+' : ''}{fmtCurrency(summary.net_flow)}
              </span>
            </div>
            <div className={s.summarySep} />
            <div className={s.summaryCard}>
              <span className={s.summaryLabel}>Transactions</span>
              <span className={s.summaryValue}>{total.toLocaleString('en-IN')}</span>
            </div>
          </div>
        )}

        {/* ── Filter toolbar ── */}
        <div className={s.toolbar}>
          {/* Search */}
          <div className={s.searchWrap}>
            <svg className={s.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              className={s.searchInput}
              placeholder="Fund name, folio, client…"
              value={search}
              onChange={e => handleSearch(e.target.value)}
            />
            {search && (
              <button className={s.searchClear} onClick={() => handleSearch('')}>×</button>
            )}
          </div>

          {/* Type */}
          <select
            className={s.filterSelect}
            value={txnType}
            onChange={e => handleTypeChange(e.target.value)}
          >
            {TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* Date range */}
          <div className={s.dateRange}>
            <input
              className={s.dateInput}
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPeriod(''); setPage(1); }}
              title="From date"
            />
            <span className={s.dateSep}>—</span>
            <input
              className={s.dateInput}
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPeriod(''); setPage(1); }}
              title="To date"
            />
          </div>

          {/* Duplicate flag */}
          <button
            className={`${s.dupeToggle} ${dupeOnly ? s.dupeToggleOn : ''}`}
            onClick={() => { setDupeOnly(v => !v); setPage(1); }}
            title="Show potential duplicates only"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="13" height="13">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Duplicates
          </button>
        </div>

        {/* ── Table ── */}
        {transactions.length === 0 ? (
          <VdfEmptyState
            title="No transactions found"
            description={
              search || txnType || dateFrom || dateTo || dupeOnly
                ? 'Try clearing your filters.'
                : 'Import a CAS, InvestWell, or NSE statement to load transactions.'
            }
            action={
              <VdfButton variant="primary" size="sm" onClick={() => router.push('/import')}>
                Import Statement
              </VdfButton>
            }
          />
        ) : (
          <>
            <div className={d.tableWrap}>
              <table className={d.table}>
                <thead>
                  <tr>
                    <th className={`${d.thSticky}`} style={{ width: 40 }}>#</th>
                    <th style={{ width: 100 }}>Date</th>
                    <th>Client</th>
                    <th>Fund</th>
                    <th style={{ width: 110 }}>Folio</th>
                    <th style={{ width: 130 }}>Type</th>
                    <th style={{ textAlign: 'right', width: 110 }}>Amount</th>
                    <th style={{ textAlign: 'right', width: 90 }}>Units / NAV</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((txn, i) => (
                    <tr
                      key={txn.id}
                      className={txn.is_potential_duplicate ? s.rowDupe : undefined}
                    >
                      {/* Row number */}
                      <td className={`${d.tdSticky} ${s.rowNum}`}>
                        {(page - 1) * PAGE_SIZE + i + 1}
                        {txn.is_potential_duplicate && (
                          <span className={s.dupeFlag} title="Potential duplicate">⚠</span>
                        )}
                      </td>

                      {/* Date */}
                      <td className={`${d.tdMono} ${s.dateCell}`}>
                        {fmtDate(txn.txn_date)}
                      </td>

                      {/* Client */}
                      <td>
                        <button
                          className={s.clientLink}
                          onClick={() => router.push(`/customers/${txn.client_id}`)}
                        >
                          {txn.client_prefix} {txn.client_name}
                        </button>
                        {txn.client_no && (
                          <div className={s.clientNo}>{txn.client_no}</div>
                        )}
                      </td>

                      {/* Fund */}
                      <td>
                        <div className={s.fundName}>{txn.fund_name ?? txn.scheme_code}</div>
                        {txn.category && (
                          <div className={s.fundCat}>{txn.category}</div>
                        )}
                      </td>

                      {/* Folio */}
                      <td className={`${d.tdMono} ${s.folio}`}>
                        {txn.folio_no ?? '—'}
                      </td>

                      {/* Type badge */}
                      <td>
                        <VdfStatusBadge
                          label={txn.txn_type_label}
                          variant={TYPE_VARIANT[txn.txn_type] ?? 'muted'}
                          size="sm"
                        />
                      </td>

                      {/* Amount */}
                      <td style={{ textAlign: 'right' }}>
                        <span className={`${s.amount} ${txn.flow_direction === 'OUT' ? s.amountOut : s.amountIn}`}>
                          {txn.flow_direction === 'OUT' ? '−' : '+'}{fmtCurrency(txn.amount)}
                        </span>
                        {txn.tds > 0 && (
                          <div className={s.tds}>TDS ₹{txn.tds.toFixed(2)}</div>
                        )}
                      </td>

                      {/* Units / NAV */}
                      <td style={{ textAlign: 'right' }}>
                        {txn.units != null ? (
                          <>
                            <div className={`${d.tdMono} ${s.units}`}>
                              {txn.units.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                            </div>
                            {txn.nav != null && (
                              <div className={s.nav}>@{txn.nav.toFixed(4)}</div>
                            )}
                          </>
                        ) : (
                          <span className={s.na}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className={d.pagination}>
                <button className={d.pageBtn} onClick={() => setPage(p => p - 1)} disabled={page === 1}>← Prev</button>
                <span className={d.pageInfo}>
                  Page {page} of {totalPages} · {total.toLocaleString('en-IN')} transactions
                </span>
                <button className={d.pageBtn} onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>Next →</button>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
