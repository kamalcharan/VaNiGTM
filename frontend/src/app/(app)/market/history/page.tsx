'use client';

/**
 * Market History — NSE Indices Management
 *
 * Download and manage OHLCV data for 55 NSE market indices via Yahoo Finance.
 * Per-index actions: Download Historical, EOD, Calculate Metrics, View Detail.
 * Bulk operations: select all, bulk download, bulk calculate.
 *
 * Data source: Yahoo Finance (OHLCV).
 * Not tenant-scoped — global reference data.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { VdfStatCard, VdfLoader, VdfEmptyState, VdfButton, VdfModal, VdfStatusBadge } from '@/components/vdf';
import f from '@/styles/forms.module.css';
import d from '@/styles/data.module.css';
import s from './market-history.module.css';

/* ── Types ──────────────────────────────────────────── */

interface MarketIndex {
  id: number;
  index_code: string;
  index_name: string;
  yahoo_symbol: string;
  category: 'broad' | 'sectoral' | 'thematic';
  description: string | null;
  priority: number;
  is_active: boolean;
  provider_enabled: boolean;
  total_records: number;
  earliest_date: string | null;
  latest_date: string | null;
  historical_data_available: boolean;
  last_download_status: 'pending' | 'running' | 'success' | 'failed';
  last_download_at: string | null;
  last_download_error: string | null;
  has_metrics?: boolean;
}

interface MarketStats {
  total_indices: number;
  active_indices: number;
  with_data: number;
  no_data: number;
  failed_last: number;
  total_records: number;
  earliest_date: string | null;
  latest_date: string | null;
  indices_with_metrics: number;
}

interface JobProgress {
  id: number;
  job_type: string;
  status: string;
  total: number;
  done: number;
  failed: number;
  current_index: string | null;
  error: string | null;
}

type FilterStatus   = 'all' | 'has_data' | 'no_data' | 'needs_metrics';
type FilterCategory = 'all' | 'broad' | 'sectoral' | 'thematic';

/* ── Date formatting ─────────────────────────────────── */

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtRecords(n: number): string {
  if (n === 0) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/* ── Status helpers ──────────────────────────────────── */

function indexStatus(idx: MarketIndex): 'success' | 'warning' | 'danger' | 'muted' {
  if (!idx.historical_data_available) return 'muted';
  if (idx.last_download_status === 'failed') return 'danger';
  if (!idx.has_metrics) return 'warning';
  return 'success';
}

function statusLabel(idx: MarketIndex): string {
  if (!idx.historical_data_available) return 'No Data';
  if (idx.last_download_status === 'failed') return 'Download Failed';
  if (!idx.has_metrics) return 'Needs Metrics';
  return 'Ready';
}

/* ═══════════════════════════════════════════════════════
   PAGE COMPONENT
   ═══════════════════════════════════════════════════════ */

export default function MarketHistoryPage() {
  const router = useRouter();
  const { showToast } = useToast();

  /* ── Data state ─────────────────────────────────────── */
  const [indices, setIndices] = useState<MarketIndex[]>([]);
  const [stats, setStats] = useState<MarketStats | null>(null);
  const [loading, setLoading] = useState(true);

  /* ── Filter state ───────────────────────────────────── */
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');

  /* ── Selection state ────────────────────────────────── */
  const [selected, setSelected] = useState<Set<number>>(new Set());

  /* ── Modal/progress state ───────────────────────────── */
  const [showDateModal, setShowDateModal] = useState(false);
  const [dateTarget, setDateTarget] = useState<MarketIndex | null>(null);
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState(new Date().toISOString().split('T')[0]);
  const [activeJob, setActiveJob] = useState<{ jobId: number; label: string; type: 'download' | 'metrics' } | null>(null);
  const [jobProgress, setJobProgress] = useState<JobProgress | null>(null);

  /* ── Spinner state per-button ───────────────────────── */
  const [spinningId, setSpinningId] = useState<string | null>(null);

  /* ── Polling ref ─────────────────────────────────────── */
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Load data ──────────────────────────────────────── */

  const load = useCallback(async () => {
    try {
      const [indicesRes, statsRes] = await Promise.all([
        apiFetch<{ indices: MarketIndex[] }>(API.market.detailedStatus),
        apiFetch<MarketStats>(API.market.statistics),
      ]);
      setIndices(indicesRes.indices);
      setStats(statsRes);
    } catch (err: any) {
      showToast({ message: err.message || 'Failed to load market data', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  /* ── Job polling ─────────────────────────────────────── */

  const startPolling = useCallback((jobId: number, label: string, type: 'download' | 'metrics') => {
    setActiveJob({ jobId, label, type });
    let polls = 0;
    const MAX = 60; // 5 min at 5s intervals

    pollRef.current = setInterval(async () => {
      polls++;
      try {
        const job = await apiFetch<JobProgress>(
          API.market.jobStatus,
          { pathParams: { jobId: String(jobId) } },
        );
        setJobProgress(job);

        if (job.status === 'success' || job.status === 'failed' || polls >= MAX) {
          clearInterval(pollRef.current!);
          setActiveJob(null);
          setJobProgress(null);
          await load();
          if (job.status === 'success') {
            showToast({ message: `${label} completed`, type: 'success' });
          } else if (job.status === 'failed') {
            showToast({ message: `${label} failed${job.error ? ': ' + job.error : ''}`, type: 'error' });
          }
        }
      } catch {
        clearInterval(pollRef.current!);
        setActiveJob(null);
      }
    }, 5000);
  }, [load, showToast]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  /* ── Actions ─────────────────────────────────────────── */

  const handleViewDetail = useCallback((idx: MarketIndex) => {
    router.push(`/market/indices/${idx.id}`);
  }, [router]);

  const handleOpenDatePicker = useCallback((idx: MarketIndex) => {
    setDateTarget(idx);
    // Smart auto-fill: start from day after latest_date
    if (idx.latest_date) {
      const next = new Date(idx.latest_date);
      next.setDate(next.getDate() + 1);
      setDateStart(next.toISOString().split('T')[0]);
    } else {
      // Default: 1 year ago
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      setDateStart(oneYearAgo.toISOString().split('T')[0]);
    }
    setDateEnd(new Date().toISOString().split('T')[0]);
    setShowDateModal(true);
  }, []);

  const handleDownloadHistorical = useCallback(async () => {
    if (!dateTarget) return;
    setShowDateModal(false);
    setSpinningId(`download-${dateTarget.id}`);
    try {
      const resp = await apiFetch<{ job_id: number }>(API.market.downloadHistorical, {
        body: { index_id: dateTarget.id, start_date: dateStart, end_date: dateEnd },
      });
      startPolling(resp.job_id, `Download ${dateTarget.index_name}`, 'download');
    } catch (err: any) {
      showToast({ message: err.message || 'Download failed', type: 'error' });
    } finally {
      setSpinningId(null);
    }
  }, [dateTarget, dateStart, dateEnd, startPolling, showToast]);

  const handleEod = useCallback(async (idx: MarketIndex) => {
    setSpinningId(`eod-${idx.id}`);
    try {
      const resp = await apiFetch<{ job_id: number }>(API.market.downloadEod, { body: { index_id: idx.id } });
      startPolling(resp.job_id, `EOD ${idx.index_name}`, 'download');
    } catch (err: any) {
      showToast({ message: err.message || 'EOD download failed', type: 'error' });
    } finally {
      setSpinningId(null);
    }
  }, [startPolling, showToast]);

  const handleCalculate = useCallback(async (idx: MarketIndex) => {
    setSpinningId(`calc-${idx.id}`);
    try {
      await apiFetch(
        API.marketAnalysis.calculate,
        { pathParams: { indexId: String(idx.id) }, body: { force: false } },
      );
      showToast({ message: `Metrics calculated for ${idx.index_name}`, type: 'success' });
      await load();
    } catch (err: any) {
      showToast({ message: err.message || 'Calculation failed', type: 'error' });
    } finally {
      setSpinningId(null);
    }
  }, [load, showToast]);

  const handleEodAll = useCallback(async () => {
    setSpinningId('eod-all');
    try {
      const resp = await apiFetch<{ job_id: number; total: number }>(API.market.downloadEodAll, { body: {} });
      showToast({ message: `EOD download started for ${resp.total} indices`, type: 'info' });
      startPolling(resp.job_id, 'EOD All', 'download');
    } catch (err: any) {
      showToast({ message: err.message || 'EOD-all failed', type: 'error' });
    } finally {
      setSpinningId(null);
    }
  }, [startPolling, showToast]);

  const handleBulkCalculate = useCallback(async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setSpinningId('bulk-calc');
    try {
      const resp = await apiFetch<{ summary: { total: number; successful: number; failed: number } }>(
        API.marketAnalysis.bulkCalculate, { body: { index_ids: ids } },
      );
      showToast({
        message: `Bulk calculate: ${resp.summary.successful} OK, ${resp.summary.failed} failed`,
        type: resp.summary.failed > 0 ? 'warning' : 'success',
      });
      setSelected(new Set());
      await load();
    } catch (err: any) {
      showToast({ message: err.message || 'Bulk calculate failed', type: 'error' });
    } finally {
      setSpinningId(null);
    }
  }, [selected, load, showToast]);

  /* ── Filtering ───────────────────────────────────────── */

  const filtered = indices.filter(idx => {
    if (filterCategory !== 'all' && idx.category !== filterCategory) return false;
    if (filterStatus === 'has_data' && !idx.historical_data_available) return false;
    if (filterStatus === 'no_data' && idx.historical_data_available) return false;
    if (filterStatus === 'needs_metrics' && (!idx.historical_data_available || idx.has_metrics)) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!idx.index_name.toLowerCase().includes(q) &&
          !idx.index_code.toLowerCase().includes(q) &&
          !idx.yahoo_symbol.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const enabledIndices = filtered.filter(idx => idx.provider_enabled);
  const allSelected = enabledIndices.length > 0 && enabledIndices.every(idx => selected.has(idx.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(enabledIndices.map(idx => idx.id)));
    }
  };

  const toggleSelect = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  /* ── Render ──────────────────────────────────────────── */

  if (loading) return <VdfLoader message="Loading market indices..." />;

  return (
    <div className={s.page}>

      {/* Header */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <h1>Market Data History</h1>
          <p>Download and manage NSE market indices OHLCV data from Yahoo Finance</p>
        </div>
        <button
          className={s.headerBtn}
          disabled={spinningId === 'eod-all'}
          onClick={handleEodAll}
        >
          {spinningId === 'eod-all' ? <span className={s.btnSpinner} /> : null}
          EOD All
        </button>
      </div>

      {/* Stats strip */}
      {stats && (
        <div className={s.statsStrip}>
          <VdfStatCard label="Total Indices" value={stats.total_indices} accentColor="var(--color-primary)" />
          <VdfStatCard label="With Data"     value={stats.with_data}      accentColor="var(--color-success)" />
          <VdfStatCard label="No Data"       value={stats.no_data}        accentColor="var(--color-muted)" />
          <VdfStatCard label="With Metrics"  value={stats.indices_with_metrics} accentColor="var(--color-accent)" />
          <VdfStatCard label="Failed"        value={stats.failed_last}    accentColor="var(--color-danger)" />
          <VdfStatCard label="Total Records" value={stats.total_records ? `${(stats.total_records / 1000).toFixed(0)}k` : '0'} accentColor="var(--color-info)" />
        </div>
      )}

      {/* Filter bar */}
      <div className={s.filterBar}>
        <div className={s.searchWrap}>
          <input
            className={f.input}
            placeholder="Search index name, code, symbol..."
            value={search}
            onChange={e => { setSearch(e.target.value); setSelected(new Set()); }}
          />
        </div>

        {/* Status pills */}
        <div className={s.filterPills}>
          {(['all', 'has_data', 'no_data', 'needs_metrics'] as FilterStatus[]).map(st => (
            <button
              key={st}
              className={filterStatus === st ? s.filterPillActive : s.filterPill}
              onClick={() => { setFilterStatus(st); setSelected(new Set()); }}
            >
              {st === 'all' ? 'All' : st === 'has_data' ? 'Has Data' : st === 'no_data' ? 'No Data' : 'Needs Metrics'}
            </button>
          ))}
        </div>

        {/* Category pills */}
        <div className={s.categoryPills}>
          {(['all', 'broad', 'sectoral', 'thematic'] as FilterCategory[]).map(cat => (
            <button
              key={cat}
              className={filterCategory === cat ? s.filterPillActive : s.filterPill}
              onClick={() => { setFilterCategory(cat); setSelected(new Set()); }}
            >
              {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk actions bar */}
      {filtered.length > 0 && (
        <div className={s.bulkBar}>
          <div className={s.bulkBarLeft}>
            <button className={s.selectAllBtn} onClick={toggleSelectAll}>
              <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{allSelected ? '☑' : '☐'}</span>
              Select All
            </button>
            {selected.size > 0 && (
              <span className={s.selectedBadge}>{selected.size} selected</span>
            )}
          </div>
          {selected.size > 0 && (
            <div className={s.bulkBarRight}>
              <button
                className={s.bulkBtn}
                disabled={spinningId === 'bulk-calc'}
                onClick={handleBulkCalculate}
              >
                {spinningId === 'bulk-calc' ? <span className={s.btnSpinner} /> : null}
                Calculate Metrics
              </button>
            </div>
          )}
        </div>
      )}

      {/* Index list */}
      <div className={s.listHeader}>
        <h3>Market Indices ({filtered.length})</h3>
        {loading && <span style={{ fontSize: '0.78rem', color: 'var(--color-muted)' }}>Refreshing...</span>}
      </div>

      {filtered.length === 0 ? (
        <VdfEmptyState
          icon="📊"
          title={search ? 'No indices found' : 'No indices match filters'}
          description={search ? `No results for "${search}"` : 'Try adjusting your filters'}
          action={
            (search || filterStatus !== 'all' || filterCategory !== 'all')
              ? { label: 'Clear Filters', onClick: () => { setSearch(''); setFilterStatus('all'); setFilterCategory('all'); } }
              : undefined
          }
        />
      ) : (
        <div className={s.indexList}>
          {filtered.map(idx => (
            <div
              key={idx.id}
              className={`${s.indexCard} ${selected.has(idx.id) ? s.selected : ''}`}
            >
              {/* Checkbox */}
              <span
                className={`${s.cardCheckbox} ${selected.has(idx.id) ? s.checked : ''}`}
                onClick={() => idx.provider_enabled && toggleSelect(idx.id)}
                style={{ cursor: idx.provider_enabled ? 'pointer' : 'not-allowed', opacity: idx.provider_enabled ? 1 : 0.3 }}
              >
                {selected.has(idx.id) ? '☑' : '☐'}
              </span>

              {/* Left: name + meta */}
              <div className={s.cardLeft}>
                <div className={s.cardTitle}>{idx.index_name}</div>
                <div className={s.cardMeta}>
                  <span className={s.cardCode}>{idx.index_code}</span>
                  <span className={s.cardSymbol}>{idx.yahoo_symbol}</span>
                  <VdfStatusBadge status={indexStatus(idx)} label={statusLabel(idx)} />
                </div>
              </div>

              {/* Stats */}
              <div className={s.cardStats}>
                <div className={s.statItem}>
                  <div className={s.statLabel}>Records</div>
                  <div className={s.statValue}>{fmtRecords(idx.total_records)}</div>
                </div>
                <div className={s.statItem}>
                  <div className={s.statLabel}>From</div>
                  <div className={s.statValue} style={{ fontSize: '0.78rem' }}>{fmtDate(idx.earliest_date)}</div>
                </div>
                <div className={s.statItem}>
                  <div className={s.statLabel}>Latest</div>
                  <div className={s.statValue} style={{ fontSize: '0.78rem' }}>{fmtDate(idx.latest_date)}</div>
                </div>
              </div>

              {/* Actions */}
              <div className={s.cardActions}>
                <button className={s.actionBtn} onClick={() => handleViewDetail(idx)}>
                  Detail
                </button>
                <button
                  className={s.actionBtn}
                  disabled={!idx.provider_enabled || spinningId === `eod-${idx.id}`}
                  onClick={() => handleEod(idx)}
                >
                  {spinningId === `eod-${idx.id}` ? <span className={s.btnSpinner} /> : null}
                  EOD
                </button>
                <button
                  className={s.actionBtn}
                  disabled={!idx.provider_enabled || spinningId === `download-${idx.id}`}
                  onClick={() => handleOpenDatePicker(idx)}
                >
                  {spinningId === `download-${idx.id}` ? <span className={s.btnSpinner} /> : null}
                  Historical
                </button>
                <button
                  className={s.actionBtn}
                  disabled={!idx.historical_data_available || spinningId === `calc-${idx.id}`}
                  onClick={() => handleCalculate(idx)}
                >
                  {spinningId === `calc-${idx.id}` ? <span className={s.btnSpinner} /> : null}
                  Metrics
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className={s.footer}>
        <strong>About Market Data</strong> — Data sourced from Yahoo Finance (OHLCV).
        Historical downloads available for up to 20 years. EOD runs daily at 8:00 PM IST.
        Metrics include returns, volatility, Sharpe ratio, max drawdown and CAGR.
      </div>

      {/* Date picker modal */}
      <VdfModal
        isOpen={showDateModal}
        onClose={() => setShowDateModal(false)}
        title={`Download: ${dateTarget?.index_name ?? ''}`}
        footer={
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <VdfButton variant="ghost" size="sm" onClick={() => setShowDateModal(false)}>Cancel</VdfButton>
            <VdfButton variant="primary" size="sm" onClick={handleDownloadHistorical}>Download</VdfButton>
          </div>
        }
      >
        <div className={s.datePickerBody}>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-muted)' }}>
            Symbol: <code style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--color-accent)' }}>{dateTarget?.yahoo_symbol}</code>
            {dateTarget?.latest_date && (
              <> &mdash; latest data: <strong>{fmtDate(dateTarget.latest_date)}</strong></>
            )}
          </p>
          <div className={s.dateRow}>
            <div>
              <label className={f.label}>Start Date</label>
              <input
                type="date"
                className={f.input}
                value={dateStart}
                max={dateEnd}
                onChange={e => setDateStart(e.target.value)}
              />
            </div>
            <div>
              <label className={f.label}>End Date</label>
              <input
                type="date"
                className={f.input}
                value={dateEnd}
                max={new Date().toISOString().split('T')[0]}
                onChange={e => setDateEnd(e.target.value)}
              />
            </div>
          </div>
        </div>
      </VdfModal>

      {/* Progress overlay */}
      {activeJob && (
        <div className={s.progressOverlay}>
          <div className={s.progressCard}>
            <div className={`${s.spinner} ${activeJob.type === 'metrics' ? s.spinnerGreen : ''}`} />
            <p className={s.progressTitle}>
              {activeJob.type === 'download' ? 'Downloading...' : 'Calculating Metrics...'}
            </p>
            <p className={s.progressMsg}>
              {jobProgress
                ? `${jobProgress.current_index ?? activeJob.label} — ${jobProgress.done}/${jobProgress.total} done`
                : activeJob.label}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
