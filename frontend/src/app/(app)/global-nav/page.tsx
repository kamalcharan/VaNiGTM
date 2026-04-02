'use client';

import { useState, useCallback } from 'react';
import { useSkillQuery } from '@/hooks';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import s from './global-nav.module.css';

/* ── Types ─────────────────────────────────────────── */

interface SchemeResult {
  scheme_code: string;
  scheme_name: string;
  amc: string;
  category: string;
  scheme_type: string;
  active: boolean;
  closure_date: string | null;
  launch_date: string | null;
  nav: number | null;
  nav_date: string | null;
  nav_records: number;
  earliest_nav_date: string | null;
  latest_nav_date: string | null;
  metrics_calculated: boolean;
}

interface SearchData {
  results: SchemeResult[];
  total_matches: number;
  page: number;
  limit: number;
  total_pages: number;
  recipe: string;
}

interface NavHistoryData {
  scheme_code: string;
  scheme_name: string;
  data: { date: string; nav: number }[];
  period_return_pct: number | null;
  recipe: string;
}

/* ── Helpers ───────────────────────────────────────── */

function schemeStatus(sc: SchemeResult): { label: string; color: string } {
  if (!sc.active) return { label: 'Ended', color: 'muted' };
  if (sc.nav_records === 0) return { label: 'No Data', color: 'danger' };
  if (sc.nav_date) {
    const daysSince = Math.floor((Date.now() - new Date(sc.nav_date).getTime()) / 86400000);
    if (daysSince > 7) return { label: `${daysSince}d stale`, color: 'warning' };
  }
  if (sc.metrics_calculated) return { label: 'Complete', color: 'success' };
  return { label: 'Has Data', color: 'info' };
}

/* ── Main Component ────────────────────────────────── */

export default function GlobalNavPage() {
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selectedScheme, setSelectedScheme] = useState<SchemeResult | null>(null);
  const [downloadingScheme, setDownloadingScheme] = useState<string | null>(null);
  const [bookmarkingScheme, setBookmarkingScheme] = useState<string | null>(null);
  const [dlDateFrom, setDlDateFrom] = useState('');
  const [dlDateTo, setDlDateTo] = useState('');

  // Skill query: search schemes with pagination
  const { data: searchResult, isLoading: searching } = useSkillQuery<SearchData>(
    'market-skill',
    'search_schemes',
    { query: activeQuery, limit: 50, page },
    { enabled: activeQuery.length >= 2 },
  );

  // Skill query: NAV history for selected scheme
  const { data: navHistory, isLoading: loadingNav } = useSkillQuery<NavHistoryData>(
    'market-skill',
    'get_nav_history',
    {
      scheme_code: selectedScheme?.scheme_code || '',
      from_date: new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0],
      to_date: new Date().toISOString().split('T')[0],
    },
    { enabled: !!selectedScheme },
  );

  const schemes = searchResult?.data?.results || [];
  const totalMatches = searchResult?.data?.total_matches || 0;
  const totalPages = searchResult?.data?.total_pages || 1;
  const navData = navHistory?.data?.data || [];

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchQuery.trim().length >= 2) {
      setActiveQuery(searchQuery.trim());
      setSelectedScheme(null);
      setPage(1);
    }
  }

  // Download with date range
  async function handleDownload(schemeCode: string) {
    if (downloadingScheme) return;
    setDownloadingScheme(schemeCode);
    try {
      const body: any = {};
      if (dlDateFrom) body.date_from = dlDateFrom;
      if (dlDateTo) body.date_to = dlDateTo;

      const result = await apiFetch<any>({
        ...API.nav.downloadScheme,
        path: API.nav.downloadScheme.path.replace(':code', schemeCode),
      }, { body });
      showToast({
        message: `${schemeCode}: ${result.records} NAV records downloaded`,
        type: 'success',
      });
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Download failed', type: 'error' });
    } finally {
      setDownloadingScheme(null);
    }
  }

  async function handleBookmark(scheme: SchemeResult) {
    if (bookmarkingScheme) return;
    setBookmarkingScheme(scheme.scheme_code);
    try {
      const result = await apiFetch<any>(API.nav.addBookmark, {
        body: { scheme_code: scheme.scheme_code },
      });
      showToast({
        message: `${scheme.scheme_name.slice(0, 40)} bookmarked${result.is_ended ? ' (ended \u2014 daily download disabled)' : ''}`,
        type: 'success',
      });
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Bookmark failed', type: 'error' });
    } finally {
      setBookmarkingScheme(null);
    }
  }

  // Date range presets
  function setPreset(months: number) {
    const to = new Date();
    const from = new Date();
    from.setMonth(from.getMonth() - months);
    setDlDateFrom(from.toISOString().split('T')[0]);
    setDlDateTo(to.toISOString().split('T')[0]);
  }

  // VaNi insights
  function getInsights(): { icon: string; text: string }[] {
    const insights: { icon: string; text: string }[] = [];

    if (!activeQuery) {
      insights.push({ icon: '\u{1F50D}', text: 'Search by scheme name, AMC, category, or code. Minimum 2 characters.' });
      return insights;
    }

    if (schemes.length > 0) {
      const withNav = schemes.filter(sc => sc.nav_records > 0).length;
      const ended = schemes.filter(sc => !sc.active).length;
      insights.push({ icon: '\u2728', text: `Found ${totalMatches.toLocaleString()} schemes matching "${activeQuery}". Page ${page} of ${totalPages}.` });
      if (withNav > 0) insights.push({ icon: '\u{1F4B9}', text: `${withNav} have NAV data on this page.` });
      if (ended > 0) insights.push({ icon: '\u{1F6D1}', text: `${ended} ended scheme${ended > 1 ? 's' : ''} \u2014 no daily downloads.` });
    } else if (!searching) {
      insights.push({ icon: '\u{1F645}', text: `No schemes found for "${activeQuery}". Try a broader search.` });
    }

    if (selectedScheme) {
      const st = schemeStatus(selectedScheme);
      if (selectedScheme.nav_records > 0) {
        insights.push({ icon: '\u{1F4C8}', text: `${selectedScheme.scheme_name.slice(0, 50)}: ${selectedScheme.nav_records} NAV records (${selectedScheme.earliest_nav_date} \u2192 ${selectedScheme.latest_nav_date})` });
      }
      if (!selectedScheme.metrics_calculated && selectedScheme.nav_records > 0) {
        insights.push({ icon: '\u{1F9EE}', text: 'Metrics not calculated yet. Returns, volatility, Sharpe ratio available after calculation.' });
      }
    }

    return insights;
  }

  /* ── Render ──────────────────────────────────────── */

  return (
    <div className={s.page}>
      <div className={s.header}>
        <h1 className={s.title}>Global NAV</h1>
        <p className={s.subtitle}>Search, explore, and download NAV data for all mutual fund schemes</p>
      </div>

      {/* Search */}
      <form className={s.searchBar} onSubmit={handleSearch}>
        <input className={s.searchInput} type="text" placeholder="Search by scheme name, AMC, category, or code..."
          value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} autoFocus />
        <button className={s.searchBtn} type="submit" disabled={searchQuery.trim().length < 2 || searching}>
          {searching ? 'Searching...' : '\u{1F50D} Search'}
        </button>
      </form>

      {/* VaNi */}
      <div className={s.insightsCard}>
        <div className={s.insightsHeader}><span>{'\u2728'}</span><span>VaNi</span></div>
        {getInsights().map((ins, i) => (
          <div key={i} className={s.insightRow}><span className={s.insightIcon}>{ins.icon}</span><span>{ins.text}</span></div>
        ))}
      </div>

      <div className={s.layout}>
        {/* ═══ LEFT: Scheme List ═══ */}
        <div className={s.listPanel}>
          {searching ? (
            <div className={s.listEmpty}>Searching schemes...</div>
          ) : schemes.length === 0 && activeQuery ? (
            <div className={s.listEmpty}>No results</div>
          ) : schemes.length === 0 ? (
            <div className={s.listEmpty}>
              <div className={s.emptyIcon}>{'\u{1F4CA}'}</div>
              <div>Search to explore schemes</div>
            </div>
          ) : (
            <>
              <div className={s.schemeList}>
                {schemes.map((sc) => {
                  const st = schemeStatus(sc);
                  const isSelected = selectedScheme?.scheme_code === sc.scheme_code;
                  return (
                    <div key={sc.scheme_code} className={`${s.schemeCard} ${isSelected ? s.schemeCardActive : ''} ${!sc.active ? s.schemeEnded : ''}`}
                      onClick={() => setSelectedScheme(sc)}>
                      <div className={s.schemeTop}>
                        <div className={s.schemeName}>{sc.scheme_name}</div>
                        <span className={`${s.statusBadge} ${s[`sb_${st.color}`]}`}>{st.label}</span>
                      </div>
                      <div className={s.schemeMeta}>
                        <span className={s.schemeCode}>{sc.scheme_code}</span>
                        <span className={s.schemeAmc}>{sc.amc.slice(0, 25)}</span>
                      </div>
                      <div className={s.schemeBottom}>
                        {sc.nav ? (
                          <span className={s.navValue}>{'\u20B9'}{Number(sc.nav).toFixed(2)}</span>
                        ) : (
                          <span className={s.noNav}>No NAV</span>
                        )}
                        {sc.nav_records > 0 && (
                          <span className={s.navCount}>{sc.nav_records.toLocaleString()} records</span>
                        )}
                        <span className={s.schemeCat}>{sc.category.slice(0, 20)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className={s.pagination}>
                  <button className={s.pageBtn} disabled={page <= 1} onClick={() => setPage(1)}>First</button>
                  <button className={s.pageBtn} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
                  <span className={s.pageInfo}>Page {page} / {totalPages}</span>
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
            <div className={s.detailEmpty}>
              <div className={s.emptyIcon}>{'\u{1F4C8}'}</div>
              <h3>Select a Scheme</h3>
              <p>Click a scheme to view NAV data, download history, and calculate metrics.</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className={s.detailHeader}>
                <div style={{ flex: 1 }}>
                  <h2 className={s.detailName}>{selectedScheme.scheme_name}</h2>
                  <div className={s.detailMeta}>
                    <span className={s.detailCode}>{selectedScheme.scheme_code}</span>
                    <span className={s.detailAmc}>{selectedScheme.amc}</span>
                    <span className={s.detailCat}>{selectedScheme.category}</span>
                    <span className={`${s.statusBadge} ${s[`sb_${schemeStatus(selectedScheme).color}`]}`}>{schemeStatus(selectedScheme).label}</span>
                  </div>
                </div>
                {selectedScheme.nav && (
                  <div className={s.detailNav}>
                    <span className={s.detailNavValue}>{'\u20B9'}{Number(selectedScheme.nav).toFixed(2)}</span>
                    <span className={s.detailNavDate}>{selectedScheme.nav_date}</span>
                  </div>
                )}
              </div>

              {/* NAV Stats */}
              {selectedScheme.nav_records > 0 && (
                <div className={s.navStats}>
                  <div className={s.navStat}><span className={s.navStatNum}>{selectedScheme.nav_records.toLocaleString()}</span><span className={s.navStatLabel}>Records</span></div>
                  <div className={s.navStat}><span className={s.navStatNum}>{selectedScheme.earliest_nav_date}</span><span className={s.navStatLabel}>Earliest</span></div>
                  <div className={s.navStat}><span className={s.navStatNum}>{selectedScheme.latest_nav_date}</span><span className={s.navStatLabel}>Latest</span></div>
                  <div className={s.navStat}><span className={s.navStatNum}>{selectedScheme.metrics_calculated ? '\u2713' : '\u2717'}</span><span className={s.navStatLabel}>Metrics</span></div>
                </div>
              )}

              {/* Download with date range */}
              <div className={s.downloadSection}>
                <div className={s.downloadHeader}>
                  <span className={s.downloadTitle}>Download Historical NAV</span>
                  <div className={s.presets}>
                    {[{l:'1M',m:1},{l:'3M',m:3},{l:'6M',m:6},{l:'1Y',m:12},{l:'3Y',m:36},{l:'All',m:0}].map(p => (
                      <button key={p.l} className={s.presetBtn} onClick={() => p.m > 0 ? setPreset(p.m) : (setDlDateFrom(''), setDlDateTo(''))} type="button">{p.l}</button>
                    ))}
                  </div>
                </div>
                <div className={s.downloadRow}>
                  <input type="date" className={s.dateInput} value={dlDateFrom} onChange={e => setDlDateFrom(e.target.value)} placeholder="From" />
                  <span className={s.dateSep}>{'\u2192'}</span>
                  <input type="date" className={s.dateInput} value={dlDateTo} onChange={e => setDlDateTo(e.target.value)} placeholder="To" />
                  <button className={s.dlBtnLg} onClick={() => handleDownload(selectedScheme.scheme_code)} disabled={downloadingScheme === selectedScheme.scheme_code}>
                    {downloadingScheme === selectedScheme.scheme_code ? 'Downloading...' : '\u2B07 Download'}
                  </button>
                  <button className={s.bmBtnLg} onClick={() => handleBookmark(selectedScheme)} disabled={bookmarkingScheme === selectedScheme.scheme_code}>
                    {bookmarkingScheme === selectedScheme.scheme_code ? '...' : '\u{1F516} Bookmark'}
                  </button>
                </div>
              </div>

              {/* NAV History Table */}
              <div className={s.navSection}>
                <div className={s.navSectionHeader}>
                  <span className={s.navSectionTitle}>NAV History (1Y)</span>
                  <span className={s.navSectionCount}>{loadingNav ? 'Loading...' : `${navData.length} records`}</span>
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
                  <div className={s.navEmpty}>
                    <p>No NAV data. Download historical data using the controls above.</p>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
