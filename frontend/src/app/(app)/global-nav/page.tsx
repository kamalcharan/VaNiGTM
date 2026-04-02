'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSkillQuery } from '@/hooks';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { VdfLineChart } from '@/components/vdf';
import s from './global-nav.module.css';

/* ── Types ─────────────────────────────────────────── */

interface SchemeResult {
  scheme_code: string; scheme_name: string; amc: string; category: string;
  scheme_type: string; active: boolean; closure_date: string | null;
  launch_date: string | null; nav: number | null; nav_date: string | null;
  nav_records: number; earliest_nav_date: string | null;
  latest_nav_date: string | null; metrics_calculated: boolean;
}

interface SearchData {
  results: SchemeResult[]; total_matches: number; page: number; limit: number; total_pages: number; recipe: string;
}

interface StatsData {
  total_schemes: number; active_schemes: number; ended_schemes: number;
  with_nav_data: number; without_nav_data: number; stale_nav_7d: number;
  metrics_calculated: number; metrics_pending: number; recipe: string;
}

interface NavHistoryData {
  scheme_code: string; scheme_name: string;
  data: { date: string; nav: number }[];
  period_return_pct: number | null; recipe: string;
}

/* ── Helpers ───────────────────────────────────────── */

function schemeStatus(sc: SchemeResult): { label: string; color: string } {
  if (!sc.active) return { label: 'Ended', color: 'muted' };
  if (sc.nav_records === 0) return { label: 'No Data', color: 'danger' };
  if (sc.nav_date) {
    const days = Math.floor((Date.now() - new Date(sc.nav_date).getTime()) / 86400000);
    if (days > 7) return { label: `${days}d stale`, color: 'warning' };
  }
  if (sc.metrics_calculated) return { label: 'Complete', color: 'success' };
  return { label: 'Has Data', color: 'info' };
}

/* ── Main ──────────────────────────────────────────── */

export default function GlobalNavPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selectedScheme, setSelectedScheme] = useState<SchemeResult | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [bookmarking, setBookmarking] = useState<string | null>(null);
  const [calculating, setCalculating] = useState<string | null>(null);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkCalculating, setBulkCalculating] = useState(false);
  const [dlDateFrom, setDlDateFrom] = useState('');
  const [dlDateTo, setDlDateTo] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Stats
  const { data: statsResult, refetch: refetchStats } = useSkillQuery<StatsData>(
    'market-skill', 'get_scheme_stats', {}, { staleTime: 30000 },
  );
  const stats = statsResult?.data;

  // Search
  const { data: searchResult, isLoading: searching, refetch: refetchSearch } = useSkillQuery<SearchData>(
    'market-skill', 'search_schemes', { query: activeQuery, limit: 50, page },
    { enabled: activeQuery.length >= 2 },
  );
  const rawSchemes = searchResult?.data?.results || [];
  const totalPages = searchResult?.data?.total_pages || 1;
  const totalMatches = searchResult?.data?.total_matches || 0;

  // Client-side filters (applied after search)
  const schemes = rawSchemes.filter((sc) => {
    if (categoryFilter !== 'all' && sc.category !== categoryFilter) return false;
    if (statusFilter === 'with_data' && sc.nav_records === 0) return false;
    if (statusFilter === 'no_data' && sc.nav_records > 0) return false;
    if (statusFilter === 'ended' && sc.active) return false;
    return true;
  });

  // Unique categories from current results
  const categories = [...new Set(rawSchemes.map(sc => sc.category))].sort();

  // NAV history for selected
  const { data: navHistory, isLoading: loadingNav } = useSkillQuery<NavHistoryData>(
    'market-skill', 'get_nav_history',
    { scheme_code: selectedScheme?.scheme_code || '', from_date: new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0], to_date: new Date().toISOString().split('T')[0] },
    { enabled: !!selectedScheme },
  );
  const navData = navHistory?.data?.data || [];

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchQuery.trim().length >= 2) { setActiveQuery(searchQuery.trim()); setSelectedScheme(null); setPage(1); setSelected(new Set()); }
  }

  // Toggle selection
  function toggleSelect(code: string) {
    setSelected(prev => { const next = new Set(prev); next.has(code) ? next.delete(code) : next.add(code); return next; });
  }

  // Download
  async function handleDownload(code: string) {
    if (downloading) return; setDownloading(code);
    try {
      const body: any = {}; if (dlDateFrom) body.date_from = dlDateFrom; if (dlDateTo) body.date_to = dlDateTo;
      const r = await apiFetch<any>({ ...API.nav.downloadScheme, path: API.nav.downloadScheme.path.replace(':code', code) }, { body });
      showToast({ message: `${code}: ${r.records} NAV records downloaded`, type: 'success' });
      refetchSearch(); refetchStats();
    } catch (err) { showToast({ message: (err as ApiError).message || 'Download failed', type: 'error' }); }
    finally { setDownloading(null); }
  }

  // Bulk download
  async function handleBulkDownload() {
    if (bulkDownloading || selected.size === 0) return; setBulkDownloading(true);
    let ok = 0, fail = 0;
    for (const code of selected) {
      try {
        await apiFetch<any>({ ...API.nav.downloadScheme, path: API.nav.downloadScheme.path.replace(':code', code) });
        ok++;
      } catch { fail++; }
    }
    showToast({ message: `Bulk download: ${ok} succeeded, ${fail} failed`, type: fail > 0 ? 'warning' : 'success' });
    setBulkDownloading(false); refetchSearch(); refetchStats();
  }

  // Calculate metrics
  async function handleCalculate(code: string) {
    if (calculating) return; setCalculating(code);
    try {
      const r = await apiFetch<any>({ ...API.nav.calculateMetrics, path: API.nav.calculateMetrics.path.replace(':code', code) });
      showToast({ message: r.status === 'already_fresh' ? `${code}: metrics already up to date` : `${code}: ${r.records_updated} records updated (${r.execution_ms}ms)`, type: 'success' });
      refetchSearch();
    } catch (err) { showToast({ message: (err as ApiError).message || 'Calculation failed', type: 'error' }); }
    finally { setCalculating(null); }
  }

  // Bulk calculate
  async function handleBulkCalculate() {
    if (bulkCalculating) return; setBulkCalculating(true);
    try {
      const r = await apiFetch<any>(API.nav.calculateMetricsBulk);
      showToast({ message: `Bulk metrics: ${r.total_schemes} schemes, ${r.total_records_updated} records (${(r.execution_ms / 1000).toFixed(1)}s)`, type: 'success' });
      refetchSearch(); refetchStats();
    } catch (err) { showToast({ message: (err as ApiError).message || 'Bulk calculation failed', type: 'error' }); }
    finally { setBulkCalculating(false); }
  }

  // Bookmark
  async function handleBookmark(sc: SchemeResult) {
    if (bookmarking) return; setBookmarking(sc.scheme_code);
    try {
      const r = await apiFetch<any>(API.nav.addBookmark, { body: { scheme_code: sc.scheme_code } });
      showToast({ message: `${sc.scheme_name.slice(0, 40)} bookmarked${r.is_ended ? ' (ended)' : ''}`, type: 'success' });
    } catch (err) { showToast({ message: (err as ApiError).message || 'Bookmark failed', type: 'error' }); }
    finally { setBookmarking(null); }
  }

  // Remove bookmark
  async function handleUnbookmark(code: string) {
    try {
      await apiFetch<any>({ ...API.nav.removeBookmark, path: API.nav.removeBookmark.path.replace(':schemeCode', code) });
      showToast({ message: 'Bookmark removed', type: 'success' });
    } catch (err) { showToast({ message: (err as ApiError).message || 'Failed', type: 'error' }); }
  }

  function setPreset(m: number) {
    const to = new Date(); const from = new Date(); from.setMonth(from.getMonth() - m);
    setDlDateFrom(from.toISOString().split('T')[0]); setDlDateTo(to.toISOString().split('T')[0]);
  }

  // Export CSV
  function handleExportCSV() {
    if (!selectedScheme || navData.length === 0) return;
    const header = 'Date,NAV\n';
    const rows = navData.map(d => `${d.date},${d.nav}`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NAV_${selectedScheme.scheme_code}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Latest NAV record metrics for detail panel
  const latestNavWithMetrics = navData.length > 0 ? navData[navData.length - 1] : null;

  /* ── Render ──────────────────────────────────────── */

  return (
    <div className={s.page}>
      <div className={s.header}>
        <h1 className={s.title}>Global NAV</h1>
        <p className={s.subtitle}>Search, explore, download NAV data and calculate metrics</p>
      </div>

      {/* Stats Row */}
      {stats?.total_schemes != null && (
        <div className={s.statsRow}>
          <div className={s.statCard}><span className={s.statNum}>{(stats.total_schemes ?? 0).toLocaleString()}</span><span className={s.statLabel}>Total Schemes</span></div>
          <div className={`${s.statCard} ${s.stSuccess}`}><span className={s.statNum}>{(stats.with_nav_data ?? 0).toLocaleString()}</span><span className={s.statLabel}>With NAV</span></div>
          <div className={`${s.statCard} ${(stats.without_nav_data ?? 0) > 0 ? s.stDanger : ''}`}><span className={s.statNum}>{(stats.without_nav_data ?? 0).toLocaleString()}</span><span className={s.statLabel}>Without NAV</span></div>
          <div className={`${s.statCard} ${(stats.stale_nav_7d ?? 0) > 0 ? s.stWarning : ''}`}><span className={s.statNum}>{(stats.stale_nav_7d ?? 0).toLocaleString()}</span><span className={s.statLabel}>Stale ({'>'}7d)</span></div>
          <div className={s.statCard}><span className={s.statNum}>{(stats.metrics_calculated ?? 0).toLocaleString()}</span><span className={s.statLabel}>Metrics Done</span></div>
          <div className={s.statCard}><span className={s.statNum}>{(stats.ended_schemes ?? 0).toLocaleString()}</span><span className={s.statLabel}>Ended</span></div>
        </div>
      )}

      {/* Search + Bulk Actions */}
      <div className={s.controlBar}>
        <form className={s.searchForm} onSubmit={handleSearch}>
          <input className={s.searchInput} type="text" placeholder="Search scheme name, AMC, category, or code..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          <button className={s.searchBtn} type="submit" disabled={searchQuery.trim().length < 2 || searching}>{searching ? '...' : '\u{1F50D}'}</button>
        </form>
        <div className={s.bulkActions}>
          {selected.size > 0 && (
            <button className={s.bulkBtn} onClick={handleBulkDownload} disabled={bulkDownloading}>
              {bulkDownloading ? '...' : `\u2B07 Download ${selected.size}`}
            </button>
          )}
          <button className={s.bulkBtn} onClick={handleBulkCalculate} disabled={bulkCalculating} title="Calculate metrics for all schemes with NAV data">
            {bulkCalculating ? 'Calculating...' : '\u{1F9EE} Bulk Metrics'}
          </button>
        </div>
      </div>

      {/* Filters */}
      {rawSchemes.length > 0 && (
        <div className={s.filterRow}>
          <div className={s.filterGroup}>
            <span className={s.filterLabel}>Status:</span>
            {['all', 'with_data', 'no_data', 'ended'].map(f => (
              <button key={f} className={`${s.filterPill} ${statusFilter === f ? s.filterPillActive : ''}`}
                onClick={() => setStatusFilter(f)}>
                {f === 'all' ? 'All' : f === 'with_data' ? 'With NAV' : f === 'no_data' ? 'No Data' : 'Ended'}
              </button>
            ))}
          </div>
          {categories.length > 1 && (
            <div className={s.filterGroup}>
              <span className={s.filterLabel}>Category:</span>
              <button className={`${s.filterPill} ${categoryFilter === 'all' ? s.filterPillActive : ''}`}
                onClick={() => setCategoryFilter('all')}>All</button>
              {categories.slice(0, 8).map(c => (
                <button key={c} className={`${s.filterPill} ${categoryFilter === c ? s.filterPillActive : ''}`}
                  onClick={() => setCategoryFilter(c)}>
                  {c.length > 20 ? c.slice(0, 20) + '...' : c}
                </button>
              ))}
              {categories.length > 8 && <span className={s.filterMore}>+{categories.length - 8}</span>}
            </div>
          )}
        </div>
      )}

      {/* VaNi */}
      <div className={s.insightsCard}>
        <div className={s.insightsHeader}><span>{'\u2728'}</span><span>VaNi</span></div>
        {!activeQuery && <div className={s.insightRow}><span className={s.insightIcon}>{'\u{1F50D}'}</span><span>Search by scheme name, AMC, category, or code. {stats?.total_schemes ? `${stats.total_schemes.toLocaleString()} schemes available.` : ''}</span></div>}
        {activeQuery && schemes.length > 0 && <div className={s.insightRow}><span className={s.insightIcon}>{'\u2728'}</span><span>Found {totalMatches.toLocaleString()} schemes. Page {page}/{totalPages}. {selected.size > 0 ? `${selected.size} selected for bulk operations.` : 'Click checkbox to select for bulk download.'}</span></div>}
        {activeQuery && schemes.length === 0 && !searching && <div className={s.insightRow}><span className={s.insightIcon}>{'\u{1F645}'}</span><span>No results for "{activeQuery}".</span></div>}
      </div>

      <div className={s.layout}>
        {/* ═══ LEFT: Scheme List ═══ */}
        <div className={s.listPanel}>
          {searching ? <div className={s.listEmpty}>Searching...</div>
          : schemes.length === 0 && !activeQuery ? <div className={s.listEmpty}><div className={s.emptyIcon}>{'\u{1F4CA}'}</div>Search to explore</div>
          : schemes.length === 0 ? <div className={s.listEmpty}>No results</div>
          : (
            <>
              <div className={s.schemeList}>
                {schemes.map((sc) => {
                  const st = schemeStatus(sc);
                  const isSelected = selectedScheme?.scheme_code === sc.scheme_code;
                  const isChecked = selected.has(sc.scheme_code);
                  return (
                    <div key={sc.scheme_code} className={`${s.schemeCard} ${isSelected ? s.schemeCardActive : ''} ${!sc.active ? s.schemeEnded : ''}`}>
                      <div className={s.schemeRow}>
                        <input type="checkbox" className={s.schemeCheck} checked={isChecked} onChange={() => toggleSelect(sc.scheme_code)} onClick={e => e.stopPropagation()} />
                        <div className={s.schemeInfo} onClick={() => router.push(`/global-nav/${sc.scheme_code}`)}>
                          <div className={s.schemeTop}>
                            <span className={s.schemeName}>{sc.scheme_name}</span>
                            <span className={`${s.statusBadge} ${s[`sb_${st.color}`]}`}>{st.label}</span>
                          </div>
                          <div className={s.schemeMeta}>
                            <span className={s.schemeCode}>{sc.scheme_code}</span>
                            <span className={s.schemeAmc}>{sc.amc.slice(0, 22)}</span>
                            {sc.nav_records > 0 && <span className={s.navCount}>{sc.nav_records.toLocaleString()} rec</span>}
                          </div>
                          <div className={s.schemeBottom}>
                            {sc.nav ? <span className={s.navValue}>{'\u20B9'}{Number(sc.nav).toFixed(2)}</span> : <span className={s.noNav}>No NAV</span>}
                            <span className={s.schemeCat}>{sc.category.slice(0, 22)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {totalPages > 1 && (
                <div className={s.pagination}>
                  <button className={s.pageBtn} disabled={page <= 1} onClick={() => setPage(1)}>First</button>
                  <button className={s.pageBtn} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
                  <span className={s.pageInfo}>{page}/{totalPages}</span>
                  <button className={s.pageBtn} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
                  <button className={s.pageBtn} disabled={page >= totalPages} onClick={() => setPage(totalPages)}>Last</button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ═══ RIGHT: Detail Panel ═══ */}
        <div className={s.detailPanel}>
          {!selectedScheme ? (
            <div className={s.detailEmpty}><div className={s.emptyIcon}>{'\u{1F4C8}'}</div><h3>Select a Scheme</h3><p>Click a scheme to view NAV data, metrics, and actions.</p></div>
          ) : (
            <>
              {/* Header */}
              <div className={s.detailHeader}>
                <div style={{ flex: 1 }}>
                  <h2 className={s.detailName}>{selectedScheme.scheme_name}</h2>
                  <div className={s.detailMeta}>
                    <span className={s.detailCode}>{selectedScheme.scheme_code}</span>
                    <span className={s.detailAmc}>{selectedScheme.amc}</span>
                    <span className={`${s.statusBadge} ${s[`sb_${schemeStatus(selectedScheme).color}`]}`}>{schemeStatus(selectedScheme).label}</span>
                  </div>
                </div>
                {selectedScheme.nav && (
                  <div className={s.detailNav}><span className={s.detailNavValue}>{'\u20B9'}{Number(selectedScheme.nav).toFixed(2)}</span><span className={s.detailNavDate}>{selectedScheme.nav_date}</span></div>
                )}
              </div>

              {/* NAV Stats */}
              {selectedScheme.nav_records > 0 && (
                <div className={s.navStats}>
                  <div className={s.navStat}><span className={s.navStatNum}>{selectedScheme.nav_records.toLocaleString()}</span><span className={s.navStatLabel}>Records</span></div>
                  <div className={s.navStat}><span className={s.navStatNum}>{selectedScheme.earliest_nav_date || '\u2014'}</span><span className={s.navStatLabel}>Earliest</span></div>
                  <div className={s.navStat}><span className={s.navStatNum}>{selectedScheme.latest_nav_date || '\u2014'}</span><span className={s.navStatLabel}>Latest</span></div>
                  <div className={s.navStat}><span className={s.navStatNum}>{selectedScheme.metrics_calculated ? '\u2713' : '\u2717'}</span><span className={s.navStatLabel}>Metrics</span></div>
                </div>
              )}

              {/* Actions bar */}
              <div className={s.actionsBar}>
                <div className={s.downloadSection}>
                  <div className={s.presets}>
                    {[{l:'1M',m:1},{l:'3M',m:3},{l:'6M',m:6},{l:'1Y',m:12},{l:'3Y',m:36},{l:'All',m:0}].map(p => (
                      <button key={p.l} className={s.presetBtn} onClick={() => p.m > 0 ? setPreset(p.m) : (setDlDateFrom(''), setDlDateTo(''))} type="button">{p.l}</button>
                    ))}
                  </div>
                  <div className={s.actionRow}>
                    <input type="date" className={s.dateInput} value={dlDateFrom} onChange={e => setDlDateFrom(e.target.value)} />
                    <span className={s.dateSep}>{'\u2192'}</span>
                    <input type="date" className={s.dateInput} value={dlDateTo} onChange={e => setDlDateTo(e.target.value)} />
                    <button className={s.actionBtn} onClick={() => handleDownload(selectedScheme.scheme_code)} disabled={downloading === selectedScheme.scheme_code}>
                      {downloading === selectedScheme.scheme_code ? '...' : '\u2B07 Download'}
                    </button>
                    <button className={s.actionBtnAlt} onClick={() => handleCalculate(selectedScheme.scheme_code)} disabled={calculating === selectedScheme.scheme_code}>
                      {calculating === selectedScheme.scheme_code ? '...' : '\u{1F9EE} Metrics'}
                    </button>
                    <button className={s.actionBtnGreen} onClick={() => handleBookmark(selectedScheme)} disabled={bookmarking === selectedScheme.scheme_code}>
                      {bookmarking === selectedScheme.scheme_code ? '...' : '\u{1F516} Bookmark'}
                    </button>
                  </div>
                </div>
              </div>

              {/* NAV Chart */}
              {navData.length >= 2 && (
                <div className={s.chartSection}>
                  <VdfLineChart
                    data={navData.map(d => ({ date: d.date, value: d.nav }))}
                    height={180}
                  />
                </div>
              )}

              {/* NAV Table */}
              <div className={s.navSection}>
                <div className={s.navSectionHeader}>
                  <span className={s.navSectionTitle}>NAV History</span>
                  <div className={s.navSectionRight}>
                    <span className={s.navSectionCount}>{loadingNav ? 'Loading...' : `${navData.length} records`}</span>
                    {navData.length > 0 && (
                      <button className={s.exportBtn} onClick={handleExportCSV} title="Export as CSV">
                        {'\u{1F4E5}'} CSV
                      </button>
                    )}
                  </div>
                </div>
                {navData.length > 0 ? (
                  <div className={s.navTableWrap}>
                    <table className={s.navTable}>
                      <thead><tr><th>Date</th><th>NAV</th></tr></thead>
                      <tbody>
                        {navData.slice(-100).reverse().map((d) => (
                          <tr key={d.date}><td>{d.date}</td><td className={s.tdMono}>{'\u20B9'}{d.nav.toFixed(4)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                    {navData.length > 100 && <div className={s.navMore}>Showing latest 100 of {navData.length}</div>}
                  </div>
                ) : !loadingNav ? (
                  <div className={s.navEmpty}><p>No NAV data. Download using the controls above.</p></div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
