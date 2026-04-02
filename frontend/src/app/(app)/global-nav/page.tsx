'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSkillQuery } from '@/hooks';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { useAuth } from '@/context/auth-provider';
import { VdfStatCard, VdfStatusBadge, VdfInsightsCard, type Insight } from '@/components/vdf';
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

function schemeStatusInfo(sc: SchemeResult): { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'muted' } {
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

  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkCalculating, setBulkCalculating] = useState(false);

  // Stats (always loaded)
  const { data: statsResult } = useSkillQuery<StatsData>(
    'market-skill', 'get_scheme_stats', {}, { staleTime: 30000 },
  );
  const stats = statsResult?.data;

  // Search
  const { data: searchResult, isLoading: searching } = useSkillQuery<SearchData>(
    'market-skill', 'search_schemes', { query: activeQuery, limit: 50, page },
    { enabled: activeQuery.length >= 2 },
  );

  const rawSchemes = searchResult?.data?.results || [];
  const totalPages = searchResult?.data?.total_pages || 1;
  const totalMatches = searchResult?.data?.total_matches || 0;

  // Client-side status filter
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
    if (selected.size === schemes.length) setSelected(new Set());
    else setSelected(new Set(schemes.map(sc => sc.scheme_code)));
  }

  async function handleBulkDownload() {
    if (bulkDownloading || selected.size === 0) return;
    setBulkDownloading(true);
    let ok = 0, fail = 0;
    for (const code of selected) {
      try { await apiFetch<any>({ ...API.nav.downloadScheme, path: API.nav.downloadScheme.path.replace(':code', code) }); ok++; }
      catch { fail++; }
    }
    showToast({ message: `Downloaded: ${ok} success, ${fail} failed`, type: fail > 0 ? 'warning' : 'success' });
    setBulkDownloading(false);
  }

  async function handleBulkMetrics() {
    if (bulkCalculating) return;
    setBulkCalculating(true);
    try {
      const r = await apiFetch<any>(API.nav.calculateMetricsBulk);
      showToast({ message: `Metrics: ${r.total_schemes} schemes, ${r.total_records_updated} records (${(r.execution_ms / 1000).toFixed(1)}s)`, type: 'success' });
    } catch (err) { showToast({ message: (err as ApiError).message || 'Failed', type: 'error' }); }
    finally { setBulkCalculating(false); }
  }

  // VaNi insights
  const insights: Insight[] = [];
  if (!activeQuery) {
    insights.push({ icon: '\u{1F50D}', text: `Search by scheme name, AMC, category, or code.${stats?.total_schemes ? ` ${stats.total_schemes.toLocaleString()} schemes available.` : ''}` });
  } else if (schemes.length > 0) {
    insights.push({ icon: '\u2728', text: `Found ${totalMatches.toLocaleString()} schemes. Page ${page}/${totalPages}.` });
    if (selected.size > 0) insights.push({ icon: '\u2611\uFE0F', text: `${selected.size} selected for bulk operations.` });
  } else if (!searching) {
    insights.push({ icon: '\u{1F645}', text: `No results for "${activeQuery}".` });
  }
  if (stats && stats.stale_nav_7d > 0) {
    insights.push({ icon: '\u26A0\uFE0F', text: `${stats.stale_nav_7d} schemes have stale NAV data (>7 days). Consider running bulk download.` });
  }

  // VaNi proactive message
  const vaniMessage = stats && stats.without_nav_data > 0
    ? `${user?.name || 'Hey'}, ${stats.without_nav_data.toLocaleString()} schemes have no NAV data yet. Shall I download them?`
    : stats && stats.stale_nav_7d > 0
    ? `${stats.stale_nav_7d} schemes have stale data. Want me to fill the gaps?`
    : stats && stats.metrics_pending > 0
    ? `${stats.metrics_pending} schemes need metrics calculation. Run bulk metrics?`
    : null;

  return (
    <div className={s.page}>
      {/* Header */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <h1 className={d.pageTitle}>Global NAV <span style={{ color: 'var(--color-muted)', fontWeight: 400, fontSize: '1rem', marginLeft: 8 }}>Explorer</span></h1>
          <p className={d.pageSubtitle}>
            Welcome back{user?.name ? `, ${user.name}` : ''}.
            {stats ? ` ${stats.with_nav_data} of ${stats.total_schemes.toLocaleString()} schemes tracked.` : ''}
          </p>
        </div>
        <div className={s.statsCards}>
          {stats && (
            <>
              <VdfStatCard value={stats.total_schemes} label="Total Schemes" />
              <VdfStatCard value={stats.with_nav_data} label="Tracked (NAV)" accent="success" />
              <VdfStatCard value={stats.stale_nav_7d} label="Gaps / Stale" accent={stats.stale_nav_7d > 0 ? 'warning' : 'default'} />
            </>
          )}
        </div>
      </div>

      {/* Grid: sidebar + main */}
      <div className={s.grid}>
        {/* ═══ SIDEBAR ═══ */}
        <aside className={s.sidebar}>
          {/* Search */}
          <div className={s.searchPanel}>
            <div className={s.searchTitle}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              Search Schemes
            </div>
            <form onSubmit={handleSearch}>
              <input className={s.searchInput} type="text" placeholder="e.g. SBI Blue Chip..." value={query} onChange={e => setQuery(e.target.value)} />
            </form>

            {/* Status filters */}
            <div className={s.filterSection}>
              <div className={s.filterTitle}>Status Filters</div>
              <div className={s.filterOption} onClick={() => setStatusFilter(statusFilter === 'no_data' ? null : 'no_data')}>
                <div className={`${s.filterDot} ${s.filterDotDanger} ${statusFilter === 'no_data' ? s.filterDotActive : ''}`} />
                <span>No Data (Red)</span>
              </div>
              <div className={s.filterOption} onClick={() => setStatusFilter(statusFilter === 'stale' ? null : 'stale')}>
                <div className={`${s.filterDot} ${s.filterDotWarning} ${statusFilter === 'stale' ? s.filterDotActive : ''}`} />
                <span>Stale / Gaps (Orange)</span>
              </div>
              <div className={s.filterOption} onClick={() => setStatusFilter(statusFilter === 'healthy' ? null : 'healthy')}>
                <div className={`${s.filterDot} ${s.filterDotSuccess} ${statusFilter === 'healthy' ? s.filterDotActive : ''}`} />
                <span>Up to Date (Green)</span>
              </div>
            </div>
          </div>

          {/* VaNi accent gradient card */}
          {vaniMessage && (
            <div className={s.vaniCard}>
              <div className={s.vaniCardTitle}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                VaNi Assistant
              </div>
              <p className={s.vaniCardText}>"{vaniMessage}"</p>
              <button className={s.vaniCardBtn} onClick={handleBulkDownload} disabled={bulkDownloading}>
                {bulkDownloading ? 'Working...' : 'Fix All Now'}
              </button>
            </div>
          )}

          {/* Insights (if search active) */}
          {activeQuery && <VdfInsightsCard insights={insights} />}
        </aside>

        {/* ═══ MAIN ═══ */}
        <div className={s.main}>
          {/* Table card */}
          <div className={s.tableCard}>
            <div className={s.tableToolbar}>
              <div className={s.toolbarActions}>
                <button className={d.pageBtn} onClick={handleBulkDownload} disabled={bulkDownloading || selected.size === 0}
                  style={selected.size > 0 ? { background: 'var(--color-primary)', color: 'var(--color-primary-fg)', borderColor: 'var(--color-primary)' } : {}}>
                  {bulkDownloading ? 'Downloading...' : `\u2B07 Bulk Download${selected.size > 0 ? ` (${selected.size})` : ''}`}
                </button>
                <button className={d.pageBtn} onClick={handleBulkMetrics} disabled={bulkCalculating}>
                  {bulkCalculating ? 'Calculating...' : '\u{1F9EE} Bulk Metrics'}
                </button>
              </div>
              <div className={s.toolbarInfo}>
                {searching ? 'Searching...' : activeQuery ? `Showing ${schemes.length} of ${totalMatches.toLocaleString()}` : 'Search to explore schemes'}
              </div>
            </div>

            <div className={s.tableScrollArea}>
              <table className={d.table}>
                <thead>
                  <tr>
                    <th className={d.table ? '' : ''} style={{ width: 40 }}>
                      <input type="checkbox" checked={schemes.length > 0 && selected.size === schemes.length} onChange={toggleSelectAll}
                        style={{ accentColor: 'var(--color-primary)' }} />
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
                    const st = schemeStatusInfo(sc);
                    const isStale = st.variant === 'warning';
                    return (
                      <tr key={sc.scheme_code} className={isStale ? s.rowStale : ''}
                        onClick={() => router.push(`/global-nav/${sc.scheme_code}`)} style={{ cursor: 'pointer' }}>
                        <td onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={selected.has(sc.scheme_code)}
                            onChange={() => toggleSelect(sc.scheme_code)} style={{ accentColor: 'var(--color-primary)' }} />
                        </td>
                        <td style={{ fontWeight: 600 }}>{sc.scheme_name}</td>
                        <td style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>{sc.category}</td>
                        <td className={d.tdMono}>
                          {sc.nav ? `\u20B9${Number(sc.nav).toFixed(2)}` : '\u2014'}
                        </td>
                        <td><VdfStatusBadge label={st.label} variant={st.variant} size="sm" /></td>
                        <td style={{ textAlign: 'right' }}>
                          {sc.nav_records === 0 && (
                            <button className={d.pageBtn} onClick={e => { e.stopPropagation(); router.push(`/global-nav/${sc.scheme_code}`); }}
                              style={{ padding: '4px 8px', fontSize: '0.65rem' }}>
                              {'\u2B07'}
                            </button>
                          )}
                          {st.variant === 'warning' && (
                            <button onClick={e => { e.stopPropagation(); router.push(`/global-nav/${sc.scheme_code}`); }}
                              style={{ background: 'none', border: 'none', color: 'var(--color-info)', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}>
                              Fill Gaps
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {schemes.length === 0 && !searching && activeQuery && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 48, color: 'var(--color-muted)' }}>No results for "{activeQuery}"</td></tr>
                  )}
                  {!activeQuery && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 48, color: 'var(--color-muted)' }}>Search to explore schemes</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
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

          {/* Bottom accent metric cards */}
          {stats && stats.with_nav_data > 0 && (
            <div className={s.bottomCards}>
              <div className={`${s.accentCard} ${s.accentCardBlue}`}>
                <div className={s.accentCardHeader}>
                  <span className={s.accentCardTitle}>Returns (1Y Avg)</span>
                  <span className={`${s.accentCardValue} ${d.valUp}`}>+18.4%</span>
                </div>
                <div className={s.miniChart}>
                  {[40, 60, 55, 80, 95].map((h, i) => (
                    <div key={i} className={s.miniBar} style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
              <div className={`${s.accentCard} ${s.accentCardPurple}`}>
                <span className={s.accentCardTitle}>Sharpe Ratio</span>
                <div className={s.accentCardBigValue}>1.42</div>
                <div className={s.accentCardDesc}>High Risk-Adjusted Return</div>
              </div>
              <div className={`${s.accentCard} ${s.accentCardGreen}`}>
                <span className={s.accentCardTitle}>Cruise Control</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                  <div className={s.pulseDot} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Active Tracking</span>
                </div>
                <div style={{ fontSize: '0.6rem', color: 'var(--color-muted)', marginTop: 8 }}>Next sync: Today, 09:00 PM IST</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
