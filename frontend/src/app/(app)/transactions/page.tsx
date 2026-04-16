'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSkillQuery } from '@/hooks/useSkill';
import { useToast } from '@/components/toast';
import { apiFetch } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import {
  VdfLoader, VdfEmptyState, VdfButton,
  VdfPageHeader, VdfStatCard, VdfSearchBar,
} from '@/components/vdf';
import { TransactionCard, type TransactionCardItem } from '@/components/transactions/TransactionCard';
import { TransactionDetailDrawer } from '@/components/transactions/TransactionDetailDrawer';
import s from './transactions.module.css';
import d from '@/styles/data.module.css';

/* ── Types ───────────────────────────────────────────── */

// Use the shared type from TransactionCard component
type Transaction = TransactionCardItem;

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

interface ImportSession {
  id:          number;
  import_type: string;
  status:      string;
  created_at:  string;
}

/* ── Constants ───────────────────────────────────────── */

const PAGE_SIZE = 50;

const TYPE_OPTIONS = [
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

const QUICK_DATES = [
  { label: '7 days',   value: '7d'  },
  { label: '30 days',  value: '30d' },
  { label: '3 months', value: '3m'  },
  { label: '1 year',   value: '1y'  },
  { label: 'All time', value: 'all' },
];

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

/* ── Page ────────────────────────────────────────────── */

export default function TransactionsPage() {
  const router        = useRouter();
  const { showToast } = useToast();

  /* ── Filter state ─────────────────────────────────── */
  const [search,                setSearch]                = useState('');
  const [txnType,               setTxnType]               = useState('');
  const [dateFrom,              setDateFrom]              = useState('');
  const [dateTo,                setDateTo]                = useState('');
  const [dupeOnly,              setDupeOnly]              = useState(false);
  const [portfolioFlagExcluded, setPortfolioFlagExcluded] = useState(false);
  const [extRefSearch,          setExtRefSearch]          = useState('');
  const [importSessionId,       setImportSessionId]       = useState<number | null>(null);
  const [sortBy,                setSortBy]                = useState('txn_date');
  const [sortOrder,             setSortOrder]             = useState<'asc' | 'desc'>('desc');
  const [filterOpen,            setFilterOpen]            = useState(false);
  const [page,                  setPage]                  = useState(1);
  const [selectedTxn,           setSelectedTxn]           = useState<Transaction | null>(null);

  /* ── Import sessions (for filter dropdown) ─────────── */
  const [importSessions, setImportSessions] = useState<ImportSession[]>([]);

  useEffect(() => {
    apiFetch<{ sessions?: ImportSession[] }>(API.etl.sessions)
      .then(data => {
        const sessions = (data.sessions ?? []).filter(
          (s: ImportSession) =>
            s.import_type === 'transaction' &&
            ['completed', 'completed_with_errors'].includes(s.status)
        );
        setImportSessions(sessions);
      })
      .catch(() => {}); // non-critical — silently ignore if endpoint unavailable
  }, []);

  /* ── Active filter count ───────────────────────────── */
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (txnType)                 n++;
    if (dateFrom || dateTo)      n++;
    if (dupeOnly)                n++;
    if (portfolioFlagExcluded)   n++;
    if (extRefSearch)            n++;
    if (importSessionId != null) n++;
    return n;
  }, [txnType, dateFrom, dateTo, dupeOnly, portfolioFlagExcluded, extRefSearch, importSessionId]);

  /* ── Handlers ──────────────────────────────────────── */
  const applyQuickDate = useCallback((range: string) => {
    const now = new Date();
    if (range === 'all') {
      setDateFrom(''); setDateTo(''); setPage(1); return;
    }
    const start = new Date(now);
    if (range === '7d')  start.setDate(now.getDate() - 7);
    if (range === '30d') start.setDate(now.getDate() - 30);
    if (range === '3m')  start.setMonth(now.getMonth() - 3);
    if (range === '1y')  start.setFullYear(now.getFullYear() - 1);
    setDateFrom(start.toISOString().slice(0, 10));
    setDateTo(now.toISOString().slice(0, 10));
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setTxnType('');
    setDateFrom(''); setDateTo('');
    setDupeOnly(false);
    setPortfolioFlagExcluded(false);
    setExtRefSearch('');
    setImportSessionId(null);
    setPage(1);
  }, []);

  const handleSortChange = useCallback((v: string) => {
    const [col, dir] = v.split('-');
    setSortBy(col);
    setSortOrder(dir as 'asc' | 'desc');
    setPage(1);
  }, []);

  /* ── Query params ──────────────────────────────────── */
  const txnParams = useMemo(() => ({
    txn_type:                txnType || undefined,
    date_from:               dateFrom || undefined,
    date_to:                 dateTo || undefined,
    search:                  search || undefined,
    is_duplicate_only:       dupeOnly || undefined,
    portfolio_flag_excluded: portfolioFlagExcluded || undefined,
    ext_ref_id_search:       extRefSearch || undefined,
    import_session_id:       importSessionId ?? undefined,
    sort_by:                 sortBy,
    sort_order:              sortOrder,
    limit:                   PAGE_SIZE,
    offset:                  (page - 1) * PAGE_SIZE,
  }), [txnType, dateFrom, dateTo, search, dupeOnly, portfolioFlagExcluded,
       extRefSearch, importSessionId, sortBy, sortOrder, page]);

  const sumParams = useMemo(() => ({
    date_from: dateFrom || undefined,
    date_to:   dateTo   || undefined,
  }), [dateFrom, dateTo]);

  /* ── Queries ───────────────────────────────────────── */
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

  /* ── Error toast ───────────────────────────────────── */
  useEffect(() => {
    if (isError) showToast({ message: error?.message ?? 'Failed to load transactions', type: 'error' });
  }, [isError]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Results range ─────────────────────────────────── */
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd   = Math.min(page * PAGE_SIZE, total);
  const netUp      = (summary?.net_flow ?? 0) >= 0;
  const hasFilters = !!(search || txnType || dateFrom || dateTo || dupeOnly || portfolioFlagExcluded || extRefSearch || importSessionId);

  /* ── Render ────────────────────────────────────────── */
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
      />

      <div className={s.body}>

        {isLoading && <VdfLoader overlay message="Loading transactions…" />}

        {/* ── Stats cards ── */}
        {summary && (
          <div className={s.statsGrid}>
            <VdfStatCard
              value={fmtCurrency(summary.total_invested)}
              label="Invested"
              accent="success"
            />
            <VdfStatCard
              value={fmtCurrency(summary.total_redeemed)}
              label="Redeemed"
              accent="danger"
            />
            <VdfStatCard
              value={(netUp ? '+' : '') + fmtCurrency(summary.net_flow)}
              label="Net Flow"
              accent={netUp ? 'success' : 'danger'}
            />
            <VdfStatCard
              value={total.toLocaleString('en-IN')}
              label="Transactions"
              accent="default"
            />
          </div>
        )}

        {/* ── Toolbar ── */}
        <div className={s.toolbar}>
          <VdfSearchBar
            value={search}
            onChange={v => { setSearch(v); setPage(1); }}
            placeholder="Fund, folio, client, scheme…"
            className={s.searchBar}
          />
          <button
            className={`${s.filterBtn} ${activeFilterCount > 0 ? s.filterBtnActive : ''}`}
            onClick={() => setFilterOpen(v => !v)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="13" height="13">
              <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46" />
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span className={s.filterCount}>{activeFilterCount}</span>
            )}
            <svg
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              width="11" height="11"
              style={{ transform: filterOpen ? 'rotate(180deg)' : undefined, transition: 'transform 200ms' }}
            >
              <polyline points="6,9 12,15 18,9" />
            </svg>
          </button>
        </div>

        {/* ── Collapsible filter panel ── */}
        {filterOpen && (
          <div className={s.filterPanel}>

            {/* Row 1: filter fields */}
            <div className={s.filterGrid}>

              {/* IWELL / ext_ref_id */}
              <div className={s.filterField}>
                <label className={s.filterLabel}>IWELL Code</label>
                <input
                  className={s.filterInput}
                  placeholder="Partial or exact…"
                  value={extRefSearch}
                  onChange={e => { setExtRefSearch(e.target.value); setPage(1); }}
                />
              </div>

              {/* Transaction type */}
              <div className={s.filterField}>
                <label className={s.filterLabel}>Transaction Type</label>
                <select
                  className={s.filterSelect}
                  value={txnType}
                  onChange={e => { setTxnType(e.target.value); setPage(1); }}
                >
                  {TYPE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Import session */}
              <div className={s.filterField}>
                <label className={s.filterLabel}>Import Session</label>
                <select
                  className={s.filterSelect}
                  value={importSessionId ?? ''}
                  onChange={e => {
                    setImportSessionId(e.target.value ? Number(e.target.value) : null);
                    setPage(1);
                  }}
                >
                  <option value="">All Sessions</option>
                  {importSessions.map(sess => (
                    <option key={sess.id} value={sess.id}>
                      Session #{sess.id} · {fmtDate(sess.created_at)}
                    </option>
                  ))}
                </select>
              </div>

            </div>

            {/* Row 2: date range */}
            <div className={s.filterDateSection}>
              <label className={s.filterLabel}>Date Range</label>
              <div className={s.quickDates}>
                <span className={s.quickLabel}>Quick:</span>
                {QUICK_DATES.map(q => (
                  <button key={q.value} className={s.quickDateBtn} onClick={() => applyQuickDate(q.value)}>
                    {q.label}
                  </button>
                ))}
              </div>
              <div className={s.dateRange}>
                <input
                  className={s.dateInput}
                  type="date"
                  value={dateFrom}
                  onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                  title="From date"
                />
                <span className={s.dateSep}>—</span>
                <input
                  className={s.dateInput}
                  type="date"
                  value={dateTo}
                  onChange={e => { setDateTo(e.target.value); setPage(1); }}
                  title="To date"
                />
                {(dateFrom || dateTo) && (
                  <button
                    className={s.clearDateBtn}
                    onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}
                    title="Clear date range"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Row 3: toggles + clear all */}
            <div className={s.filterToggles}>
              <button
                className={`${s.toggleBtn} ${dupeOnly ? s.toggleBtnWarning : ''}`}
                onClick={() => { setDupeOnly(v => !v); setPage(1); }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="12" height="12">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Duplicates only
              </button>
              <button
                className={`${s.toggleBtn} ${portfolioFlagExcluded ? s.toggleBtnDanger : ''}`}
                onClick={() => { setPortfolioFlagExcluded(v => !v); setPage(1); }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="12" height="12">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                </svg>
                Excluded from portfolio
              </button>
              {activeFilterCount > 0 && (
                <button className={s.clearAllBtn} onClick={clearFilters}>
                  ×&nbsp;Clear all
                </button>
              )}
            </div>

          </div>
        )}

        {/* ── Results bar + sort ── */}
        {total > 0 && (
          <div className={s.resultsBar}>
            <span className={s.resultsCount}>
              Showing{' '}
              <strong>{rangeStart.toLocaleString('en-IN')}</strong>–<strong>{rangeEnd.toLocaleString('en-IN')}</strong>
              {' '}of <strong>{total.toLocaleString('en-IN')}</strong> transactions
            </span>
            <div className={s.sortWrap}>
              <span className={s.sortLabel}>Sort by</span>
              <select
                className={s.sortSelect}
                value={`${sortBy}-${sortOrder}`}
                onChange={e => handleSortChange(e.target.value)}
              >
                <option value="txn_date-desc">Date (Newest)</option>
                <option value="txn_date-asc">Date (Oldest)</option>
                <option value="amount-desc">Amount (High → Low)</option>
                <option value="amount-asc">Amount (Low → High)</option>
                <option value="fund_name-asc">Fund (A → Z)</option>
                <option value="fund_name-desc">Fund (Z → A)</option>
                <option value="client_name-asc">Client (A → Z)</option>
              </select>
            </div>
          </div>
        )}

        {/* ── Card list or empty state ── */}
        {transactions.length === 0 ? (
          <VdfEmptyState
            title="No transactions found"
            description={
              hasFilters
                ? 'Try clearing your filters.'
                : 'Import a CAS, InvestWell, or NSE statement to load transactions.'
            }
            action={
              !hasFilters ? (
                <VdfButton variant="primary" size="sm" onClick={() => router.push('/import')}>
                  Import Statement
                </VdfButton>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className={s.cardList}>
              {transactions.map(txn => (
                <TransactionCard
                  key={txn.id}
                  txn={txn}
                  showClient
                  onView={t => setSelectedTxn(t)}
                  onClientClick={id => router.push(`/customers/${id}`)}
                />
              ))}
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

      {/* ── Transaction detail drawer ── */}
      <TransactionDetailDrawer
        txn={selectedTxn}
        onClose={() => setSelectedTxn(null)}
      />

    </div>
  );
}
