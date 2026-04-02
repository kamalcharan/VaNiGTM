'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSkillQuery } from '@/hooks';
import { apiFetch, getAccessToken, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { useAuth } from '@/context/auth-provider';
import { VdfStatCard, VdfStatusBadge, VdfInsightsCard, VdfProgressOverlay, type Insight, type BadgeVariant, type ProgressItem } from '@/components/vdf';
import d from '@/styles/data.module.css';
import s from './global-nav.module.css';

/* ── Types ─────────────────────────────────────────── */

interface SchemeResult {
  scheme_code: string; scheme_name: string; amc: string; category: string;
  scheme_type: string; active: boolean; closure_date: string | null;
  nav: number | null; nav_date: string | null; nav_records: number;
  earliest_nav_date: string | null; latest_nav_date: string | null;
  metrics_calculated: boolean;
}

interface SearchData {
  results: SchemeResult[]; total_matches: number; page: number;
  limit: number; total_pages: number;
}

interface StatsData {
  total_schemes: number; active_schemes: number; ended_schemes: number;
  with_nav_data: number; without_nav_data: number; stale_nav_7d: number;
  metrics_calculated: number; metrics_pending: number;
}

/* ── Helpers ───────────────────────────────────────── */

function statusOf(sc: SchemeResult): { label: string; variant: BadgeVariant } {
  if (!sc.active) return { label: 'Ended', variant: 'muted' };
  if (sc.nav_records === 0) return { label: 'No Data', variant: 'danger' };
  if (sc.nav_date) {
    const days = Math.floor((Date.now() - new Date(sc.nav_date).getTime()) / 86400000);
    if (days > 7) return { label: `${days}d Stale`, variant: 'warning' };
  }
  if (sc.metrics_calculated) return { label: 'Healthy', variant: 'success' };
  return { label: 'Has Data', variant: 'info' };
}

/* ── Component ─────────────────────────────────────── */

export default function GlobalNavPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { user } = useAuth();
  const cancelRef = useRef(false);

  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Bulk operation state
  const [bulkOp, setBulkOp] = useState<{
    active: boolean; title: string; progress: number; progressText: string;
    items: ProgressItem[]; vani: string;
  } | null>(null);

  // Data queries
  const { data: statsResult, refetch: refetchStats } = useSkillQuery<StatsData>(
    'market-skill', 'get_scheme_stats', {}, { staleTime: 60000 },
  );
  const stats = statsResult?.data;

  const { data: searchResult, isLoading: searching, refetch: refetchSearch } = useSkillQuery<SearchData>(
    'market-skill', 'search_schemes', { query: activeQuery, limit: 50, page },
    { enabled: activeQuery.length >= 2 },
  );

  const rawSchemes = searchResult?.data?.results || [];
  const totalPages = searchResult?.data?.total_pages || 1;
  const totalMatches = searchResult?.data?.total_matches || 0;

  const schemes = rawSchemes.filter(sc => {
    if (!statusFilter) return true;
    if (statusFilter === 'no_data') return sc.nav_records === 0;
    if (statusFilter === 'stale') return sc.nav_records > 0 && sc.nav_date && Math.floor((Date.now() - new Date(sc.nav_date).getTime()) / 86400000) > 7;
    if (statusFilter === 'healthy') return sc.nav_records > 0 && sc.active;
    return true;
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length >= 2) { setActiveQuery(query.trim()); setPage(1); setSelected(new Set()); }
  }

  function toggleSelect(code: string) {
    setSelected(prev => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n; });
  }

  function toggleSelectAll() {
    setSelected(selected.size === schemes.length ? new Set() : new Set(schemes.map(sc => sc.scheme_code)));
  }

  // ── Sequential bulk download with progress ──
  async function handleBulkDownload() {
    const codes = [...selected];
    if (codes.length === 0) return;
    cancelRef.current = false;

    const items: ProgressItem[] = codes.map(c => {
      const sc = rawSchemes.find(s2 => s2.scheme_code === c);
      return { label: sc?.scheme_name || c, status: 'pending' as const };
    });

    setBulkOp({ active: true, title: 'Downloading NAV Data', progress: 0, progressText: `0 of ${codes.length} schemes`, items, vani: 'Starting sequential download from MFAPI...' });

    let done = 0, totalRecords = 0;

    for (let i = 0; i < codes.length; i++) {
      if (cancelRef.current) break;

      items[i] = { ...items[i], status: 'running' };
      setBulkOp(prev => prev ? { ...prev, items: [...items], progressText: `${i + 1} of ${codes.length} schemes`, progress: (i / codes.length) * 100, vani: `Fetching ${items[i].label.slice(0, 40)}...` } : null);

      try {
        const r = await apiFetch<any>({ ...API.nav.downloadScheme, path: API.nav.downloadScheme.path.replace(':code', codes[i]) });
        const records = r.records || 0;
        totalRecords += records;
        items[i] = { ...items[i], status: 'done', detail: `${records.toLocaleString()} records` };
        done++;
      } catch {
        items[i] = { ...items[i], status: 'failed', detail: 'Error' };
      }

      setBulkOp(prev => prev ? { ...prev, items: [...items], progress: ((i + 1) / codes.length) * 100, vani: `${done} downloaded. ${totalRecords.toLocaleString()} total records so far.` } : null);
    }

    setBulkOp(prev => prev ? { ...prev, progress: 100, progressText: `${done} of ${codes.length} complete`, vani: cancelRef.current ? 'Download cancelled.' : `Done! ${totalRecords.toLocaleString()} records downloaded across ${done} schemes.` } : null);

    // Auto-close after 3 seconds
    setTimeout(() => { setBulkOp(null); refetchSearch(); refetchStats(); }, 3000);
  }

  async function handleBulkMetrics() {
    setBulkOp({ active: true, title: 'Calculating Metrics', progress: 50, progressText: 'Running PostgreSQL RPC...', items: [{ label: 'process_scheme_metrics()', status: 'running' }], vani: 'Computing returns, volatility, Sharpe ratio, CAGR for all schemes with NAV data...' });

    try {
      const r = await apiFetch<any>(API.nav.calculateMetricsBulk);
      setBulkOp({ active: true, title: 'Metrics Complete', progress: 100, progressText: `${r.total_schemes} schemes processed`, items: [{ label: `${r.total_records_updated.toLocaleString()} records updated`, status: 'done', detail: `${(r.execution_ms / 1000).toFixed(1)}s` }], vani: `All metrics calculated. ${r.total_schemes} schemes, ${r.total_records_updated.toLocaleString()} records.` });
    } catch (err) {
      setBulkOp({ active: true, title: 'Metrics Failed', progress: 0, progressText: 'Error', items: [{ label: (err as ApiError).message || 'Unknown error', status: 'failed' }], vani: 'Metrics calculation failed. Check database connectivity.' });
    }

    setTimeout(() => { setBulkOp(null); refetchSearch(); refetchStats(); }, 3000);
  }

  // Download ALL bookmarked full history
  async function handleDownloadAllFull() {
    setBulkOp({ active: true, title: 'Downloading Full History', progress: 50, progressText: 'Fetching all bookmarked schemes...', items: [{ label: 'MFAPI sequential download', status: 'running' }], vani: 'Downloading full NAV history for all bookmarked schemes. This may take a few minutes.' });
    try {
      const r = await apiFetch<any>(API.nav.downloadAll);
      setBulkOp({ active: true, title: 'Download Complete', progress: 100, progressText: `${r.downloaded} schemes downloaded`, items: [{ label: `${r.downloaded} downloaded, ${r.skipped} skipped, ${r.failed} failed`, status: r.failed > 0 ? 'failed' : 'done' }], vani: `Done! ${r.downloaded} schemes with full history.` });
    } catch (err) {
      setBulkOp({ active: true, title: 'Download Failed', progress: 0, progressText: 'Error', items: [{ label: (err as ApiError).message || 'Failed', status: 'failed' }], vani: 'Download failed.' });
    }
    setTimeout(() => { setBulkOp(null); refetchSearch(); refetchStats(); }, 3000);
  }

  // Fill ALL gaps
  async function handleFillAllGaps() {
    setBulkOp({ active: true, title: 'Filling NAV Gaps', progress: 50, progressText: 'Scanning for missing dates...', items: [{ label: 'Gap detection + MFAPI fetch', status: 'running' }], vani: 'Finding and filling missing NAV dates across all bookmarked schemes.' });
    try {
      const r = await apiFetch<any>(API.nav.downloadGapAll);
      setBulkOp({ active: true, title: 'Gaps Filled', progress: 100, progressText: `${r.schemes_with_gaps} schemes had gaps`, items: [{ label: `${r.records_filled} records filled`, status: 'done' }], vani: `Done! ${r.records_filled} missing records recovered.` });
    } catch (err) {
      setBulkOp({ active: true, title: 'Gap Fill Failed', progress: 0, progressText: 'Error', items: [{ label: (err as ApiError).message || 'Failed', status: 'failed' }], vani: 'Gap fill failed.' });
    }
    setTimeout(() => { setBulkOp(null); refetchSearch(); refetchStats(); }, 3000);
  }

  // ── VaNi — journey-aware insights ──
  const insights: Insight[] = [];
  if (!activeQuery) {
    if (!stats || stats.total_schemes === 0) {
      insights.push({ icon: '\u{1F4CB}', text: 'Import the AMFI Scheme Master first. Go to Import Data to upload.' });
    } else if (stats.with_nav_data === 0) {
      insights.push({ icon: '\u{1F50D}', text: 'Search for your client schemes and download their NAV data to start tracking.' });
    } else {
      insights.push({ icon: '\u{1F50D}', text: `${stats.total_schemes.toLocaleString()} schemes available. ${stats.with_nav_data} tracked with NAV data.` });
    }
  } else if (schemes.length > 0) {
    insights.push({ icon: '\u2728', text: `${totalMatches.toLocaleString()} schemes found. Click a scheme to view its dashboard.` });
    if (selected.size > 0) insights.push({ icon: '\u2611\uFE0F', text: `${selected.size} selected. Use Bulk Download or Bulk Metrics.` });
  } else if (!searching) {
    insights.push({ icon: '\u{1F645}', text: `No results for "${activeQuery}". Try a different search term.` });
  }
  if (stats && stats.stale_nav_7d > 0 && !activeQuery) {
    insights.push({ icon: '\u26A0\uFE0F', text: `${stats.stale_nav_7d} schemes have stale NAV (>7 days).` });
  }

  // ── VaNi proactive card ──
  const vaniAction = stats && stats.without_nav_data > stats.with_nav_data
    ? { msg: `${stats.without_nav_data.toLocaleString()} schemes need NAV data. Search and download to start.`, btn: null }
    : stats && stats.stale_nav_7d > 0
    ? { msg: `${stats.stale_nav_7d} schemes have stale data. Shall I fill the gaps?`, btn: 'Fix All Now' }
    : stats && stats.metrics_pending > 0
    ? { msg: `${stats.metrics_pending} schemes need metrics. Run bulk calculation?`, btn: 'Calculate All' }
    : null;

  /* ── Render ──────────────────────────────────────── */

  return (
    <div className={s.page}>
      {/* Bulk operation overlay */}
      {bulkOp && (
        <VdfProgressOverlay
          title={bulkOp.title}
          progress={bulkOp.progress}
          progressText={bulkOp.progressText}
          items={bulkOp.items}
          vaniMessage={bulkOp.vani}
          onCancel={bulkOp.progress < 100 ? () => { cancelRef.current = true; } : undefined}
        />
      )}

      {/* Header */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <h1 className={d.pageTitle}>Global NAV <span style={{ color: 'var(--color-muted)', fontWeight: 400, fontSize: '1rem', marginLeft: 8 }}>Explorer</span></h1>
          <p className={d.pageSubtitle}>
            {user?.name ? `Welcome back, ${user.name}. ` : ''}
            {stats ? `${stats.with_nav_data} of ${stats.total_schemes.toLocaleString()} schemes tracked.` : ''}
          </p>
        </div>
        {stats && (
          <div className={s.statsCards}>
            <VdfStatCard value={stats.total_schemes} label="Total Schemes" />
            <VdfStatCard value={stats.with_nav_data} label="Tracked" accent="success" />
            {stats.stale_nav_7d > 0 && <VdfStatCard value={stats.stale_nav_7d} label="Stale" accent="warning" />}
          </div>
        )}
      </div>

      {/* Grid */}
      <div className={s.grid}>
        {/* ═══ SIDEBAR ═══ */}
        <aside className={s.sidebar}>
          <div className={s.searchPanel}>
            <div className={s.searchTitle}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              Search Schemes
            </div>
            <form onSubmit={handleSearch}>
              <input className={s.searchInput} type="text" placeholder="e.g. SBI Blue Chip..." value={query} onChange={e => setQuery(e.target.value)} />
            </form>

            <div className={s.filterSection}>
              <div className={s.filterTitle}>Status Filters</div>
              {[
                { key: 'no_data', label: 'No Data', dot: s.filterDotDanger },
                { key: 'stale', label: 'Stale / Gaps', dot: s.filterDotWarning },
                { key: 'healthy', label: 'Up to Date', dot: s.filterDotSuccess },
              ].map(f => (
                <div key={f.key} className={s.filterOption} onClick={() => setStatusFilter(statusFilter === f.key ? null : f.key)}>
                  <div className={`${s.filterDot} ${f.dot} ${statusFilter === f.key ? s.filterDotActive : ''}`} />
                  <span>{f.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* VaNi accent gradient card */}
          {vaniAction && (
            <div className={s.vaniCard}>
              <div className={s.vaniCardTitle}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                VaNi Assistant
              </div>
              <p className={s.vaniCardText}>"{vaniAction.msg}"</p>
              {vaniAction.btn && (
                <button className={s.vaniCardBtn} onClick={vaniAction.btn === 'Fix All Now' ? handleBulkDownload : handleBulkMetrics}>
                  {vaniAction.btn}
                </button>
              )}
            </div>
          )}

          {insights.length > 0 && <VdfInsightsCard insights={insights} />}
        </aside>

        {/* ═══ MAIN ═══ */}
        <div className={s.main}>
          <div className={s.tableCard}>
            <div className={s.tableToolbar}>
              <div className={s.toolbarActions}>
                <button className={d.pageBtn} onClick={handleBulkDownload} disabled={selected.size === 0}
                  style={selected.size > 0 ? { background: 'var(--color-primary)', color: 'var(--color-primary-fg)', borderColor: 'var(--color-primary)' } : {}}>
                  {`\u2B07 Bulk Download${selected.size > 0 ? ` (${selected.size})` : ''}`}
                </button>
                <button className={d.pageBtn} onClick={handleBulkMetrics}>
                  {'\u{1F9EE} Bulk Metrics'}
                </button>
                <button className={d.pageBtn} onClick={handleDownloadAllFull}>
                  {'\u{1F4E5} Full History'}
                </button>
                <button className={d.pageBtn} onClick={handleFillAllGaps}>
                  {'\u{1F527} Fill All Gaps'}
                </button>
              </div>
              <div className={s.toolbarInfo}>
                {searching ? 'Searching...' : activeQuery ? `${schemes.length} of ${totalMatches.toLocaleString()}` : 'Search to explore'}
              </div>
            </div>

            <div className={s.tableScrollArea}>
              <table className={d.table}>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>
                      <input type="checkbox" checked={schemes.length > 0 && selected.size === schemes.length}
                        onChange={toggleSelectAll} style={{ accentColor: 'var(--color-primary)' }} />
                    </th>
                    <th>Scheme Name</th>
                    <th>Category</th>
                    <th>Last NAV</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {schemes.map(sc => {
                    const st = statusOf(sc);
                    return (
                      <tr key={sc.scheme_code} className={st.variant === 'warning' ? s.rowStale : ''}
                        onClick={() => router.push(`/global-nav/${sc.scheme_code}`)} style={{ cursor: 'pointer' }}>
                        <td onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={selected.has(sc.scheme_code)}
                            onChange={() => toggleSelect(sc.scheme_code)} style={{ accentColor: 'var(--color-primary)' }} />
                        </td>
                        <td style={{ fontWeight: 600 }}>{sc.scheme_name}</td>
                        <td style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>{sc.category}</td>
                        <td className={d.tdMono}>{sc.nav ? `\u20B9${Number(sc.nav).toFixed(2)}` : '\u2014'}</td>
                        <td><VdfStatusBadge label={st.label} variant={st.variant} size="sm" /></td>
                        <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                          {st.variant === 'danger' && (
                            <span style={{ color: 'var(--color-primary)', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
                              onClick={() => router.push(`/global-nav/${sc.scheme_code}`)}>
                              Download
                            </span>
                          )}
                          {st.variant === 'warning' && (
                            <span style={{ color: 'var(--color-warning)', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
                              onClick={() => router.push(`/global-nav/${sc.scheme_code}`)}>
                              Fill Gaps
                            </span>
                          )}
                          {st.variant === 'info' && (
                            <span style={{ color: 'var(--color-info)', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
                              onClick={() => router.push(`/global-nav/${sc.scheme_code}`)}>
                              Metrics
                            </span>
                          )}
                          {st.variant === 'success' && (
                            <span style={{ color: 'var(--color-muted)', fontSize: '0.7rem', cursor: 'pointer' }}
                              onClick={() => router.push(`/global-nav/${sc.scheme_code}`)}>
                              View
                            </span>
                          )}
                          {st.variant === 'muted' && (
                            <span style={{ color: 'var(--color-muted)', fontSize: '0.7rem', opacity: 0.5 }}>
                              Ended
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {schemes.length === 0 && !searching && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 48, color: 'var(--color-muted)' }}>
                      {activeQuery ? `No results for "${activeQuery}"` : 'Search to explore schemes'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className={d.pagination}>
                <button className={d.pageBtn} disabled={page <= 1} onClick={() => setPage(1)}>First</button>
                <button className={d.pageBtn} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
                <span className={d.pageInfo}>Page {page} / {totalPages}</span>
                <button className={d.pageBtn} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
                <button className={d.pageBtn} disabled={page >= totalPages} onClick={() => setPage(totalPages)}>Last</button>
              </div>
            )}
          </div>

          {/* Bottom cards — ONLY real data, journey-aware */}
          {stats && stats.with_nav_data > 0 && (
            <div className={s.bottomCards}>
              <div className={`${s.accentCard} ${s.accentCardGreen}`}>
                <span className={s.accentCardTitle}>Cruise Control</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                  <div className={s.pulseDot} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                    {stats.with_nav_data} Scheme{stats.with_nav_data !== 1 ? 's' : ''} Tracked
                  </span>
                </div>
                <div style={{ fontSize: '0.6rem', color: 'var(--color-muted)', marginTop: 8 }}>
                  {stats.metrics_calculated} with metrics {'\u00B7'} {stats.ended_schemes} ended
                </div>
              </div>
              {stats.stale_nav_7d > 0 && (
                <div className={`${s.accentCard} ${s.accentCardBlue}`}>
                  <span className={s.accentCardTitle}>Data Health</span>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--color-warning)', marginTop: 4 }}>
                    {stats.stale_nav_7d}
                  </div>
                  <div className={s.accentCardDesc}>schemes with stale NAV ({'>'}7 days)</div>
                </div>
              )}
              {stats.metrics_pending > 0 && (
                <div className={`${s.accentCard} ${s.accentCardPurple}`}>
                  <span className={s.accentCardTitle}>Metrics Pending</span>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--color-fg)', marginTop: 4 }}>
                    {stats.metrics_pending}
                  </div>
                  <div className={s.accentCardDesc}>schemes need calculation</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
