'use client';

import { useState, useCallback } from 'react';
import { useSkillQuery, useSkillMutation } from '@/hooks';
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
  nav: number | null;
  nav_date: string | null;
}

interface SearchData {
  results: SchemeResult[];
  total_matches: number;
  recipe: string;
}

interface NavHistoryData {
  scheme_code: string;
  scheme_name: string;
  data: { date: string; nav: number }[];
  period_return_pct: number | null;
  recipe: string;
}

/* ── Main Component ────────────────────────────────── */

export default function GlobalNavPage() {
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [selectedScheme, setSelectedScheme] = useState<SchemeResult | null>(null);
  const [downloadingScheme, setDownloadingScheme] = useState<string | null>(null);
  const [bookmarkingScheme, setBookmarkingScheme] = useState<string | null>(null);

  // Skill query: search schemes
  const { data: searchResult, isLoading: searching } = useSkillQuery<SearchData>(
    'market-skill',
    'search_schemes',
    { query: activeQuery, limit: 100 },
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
  const navData = navHistory?.data?.data || [];

  // Handle search
  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchQuery.trim().length >= 2) {
      setActiveQuery(searchQuery.trim());
      setSelectedScheme(null);
    }
  }

  // Download historical NAV for a scheme
  async function handleDownload(schemeCode: string) {
    if (downloadingScheme) return;
    setDownloadingScheme(schemeCode);
    try {
      const result = await apiFetch<any>({
        ...API.nav.downloadScheme,
        path: API.nav.downloadScheme.path.replace(':code', schemeCode),
      });
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

  // Bookmark a scheme
  async function handleBookmark(scheme: SchemeResult) {
    if (bookmarkingScheme) return;
    setBookmarkingScheme(scheme.scheme_code);
    try {
      const result = await apiFetch<any>(API.nav.addBookmark, {
        body: { scheme_code: scheme.scheme_code },
      });
      showToast({
        message: `${scheme.scheme_name.slice(0, 40)} bookmarked${result.is_ended ? ' (ended scheme \u2014 daily download disabled)' : ''}`,
        type: 'success',
      });
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Bookmark failed', type: 'error' });
    } finally {
      setBookmarkingScheme(null);
    }
  }

  // VaNi insights
  function getInsights(): { icon: string; text: string }[] {
    const insights: { icon: string; text: string }[] = [];

    if (!activeQuery) {
      insights.push({ icon: '\u{1F50D}', text: 'Search by scheme name, AMC, or category. Minimum 2 characters.' });
      insights.push({ icon: '\u{1F4CA}', text: `16,000+ schemes available from AMFI Scheme Master.` });
      return insights;
    }

    if (schemes.length > 0) {
      const withNav = schemes.filter(sc => sc.nav !== null).length;
      const withoutNav = schemes.length - withNav;
      insights.push({ icon: '\u2728', text: `Found ${totalMatches.toLocaleString()} scheme${totalMatches !== 1 ? 's' : ''} matching "${activeQuery}". Showing ${schemes.length}.` });
      if (withNav > 0) insights.push({ icon: '\u{1F4B9}', text: `${withNav} scheme${withNav !== 1 ? 's' : ''} have NAV data available.` });
      if (withoutNav > 0) insights.push({ icon: '\u2B07\uFE0F', text: `${withoutNav} scheme${withoutNav !== 1 ? 's' : ''} need NAV download. Click the download button to fetch historical data from MFAPI.` });
    } else if (!searching) {
      insights.push({ icon: '\u{1F645}', text: `No schemes found for "${activeQuery}". Try a broader search.` });
    }

    if (selectedScheme && navData.length > 0) {
      const latest = navData[navData.length - 1];
      const oldest = navData[0];
      insights.push({ icon: '\u{1F4C8}', text: `${selectedScheme.scheme_name.slice(0, 50)}: ${navData.length} NAV records from ${oldest.date} to ${latest.date}. Latest: \u20B9${latest.nav.toFixed(2)}` });
    }

    return insights;
  }

  /* ── Render ──────────────────────────────────────── */

  return (
    <div className={s.page}>
      {/* Header */}
      <div className={s.header}>
        <h1 className={s.title}>Global NAV</h1>
        <p className={s.subtitle}>Search, explore, and download NAV data for 16,000+ mutual fund schemes</p>
      </div>

      {/* Search bar */}
      <form className={s.searchBar} onSubmit={handleSearch}>
        <input
          className={s.searchInput}
          type="text"
          placeholder="Search by scheme name, AMC, or category..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus
        />
        <button className={s.searchBtn} type="submit" disabled={searchQuery.trim().length < 2 || searching}>
          {searching ? 'Searching...' : '\u{1F50D} Search'}
        </button>
      </form>

      {/* VaNi insights */}
      <div className={s.insightsCard}>
        <div className={s.insightsHeader}>
          <span>{'\u2728'}</span>
          <span>VaNi</span>
        </div>
        {getInsights().map((ins, i) => (
          <div key={i} className={s.insightRow}>
            <span className={s.insightIcon}>{ins.icon}</span>
            <span>{ins.text}</span>
          </div>
        ))}
      </div>

      <div className={s.layout}>
        {/* ═══ LEFT: Scheme List ═══ */}
        <div className={s.listPanel}>
          {searching ? (
            <div className={s.listEmpty}>Searching schemes...</div>
          ) : schemes.length === 0 && activeQuery ? (
            <div className={s.listEmpty}>No results for "{activeQuery}"</div>
          ) : schemes.length === 0 ? (
            <div className={s.listEmpty}>
              <div className={s.emptyIcon}>{'\u{1F4CA}'}</div>
              <div>Search to explore schemes</div>
            </div>
          ) : (
            <div className={s.schemeList}>
              {schemes.map((sc) => (
                <div
                  key={sc.scheme_code}
                  className={`${s.schemeCard} ${selectedScheme?.scheme_code === sc.scheme_code ? s.schemeCardActive : ''}`}
                  onClick={() => setSelectedScheme(sc)}
                >
                  <div className={s.schemeTop}>
                    <div className={s.schemeName}>{sc.scheme_name}</div>
                    <div className={s.schemeCode}>{sc.scheme_code}</div>
                  </div>
                  <div className={s.schemeBottom}>
                    <span className={s.schemeAmc}>{sc.amc.slice(0, 30)}</span>
                    <span className={s.schemeCat}>{sc.category}</span>
                  </div>
                  <div className={s.schemeNav}>
                    {sc.nav ? (
                      <>
                        <span className={s.navValue}>{'\u20B9'}{Number(sc.nav).toFixed(2)}</span>
                        <span className={s.navDate}>{sc.nav_date}</span>
                      </>
                    ) : (
                      <span className={s.noNav}>No NAV data</span>
                    )}
                  </div>
                  <div className={s.schemeActions}>
                    <button
                      className={s.dlBtn}
                      onClick={(e) => { e.stopPropagation(); handleDownload(sc.scheme_code); }}
                      disabled={downloadingScheme === sc.scheme_code}
                      title="Download historical NAV from MFAPI"
                    >
                      {downloadingScheme === sc.scheme_code ? '...' : '\u2B07 NAV'}
                    </button>
                    <button
                      className={s.bmBtn}
                      onClick={(e) => { e.stopPropagation(); handleBookmark(sc); }}
                      disabled={bookmarkingScheme === sc.scheme_code}
                      title="Bookmark for daily tracking"
                    >
                      {bookmarkingScheme === sc.scheme_code ? '...' : '\u{1F516} Track'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ═══ RIGHT: Scheme Detail ═══ */}
        <div className={s.detailPanel}>
          {!selectedScheme ? (
            <div className={s.detailEmpty}>
              <div className={s.emptyIcon}>{'\u{1F4C8}'}</div>
              <h3>Select a Scheme</h3>
              <p>Click a scheme from the search results to view NAV data and metrics.</p>
            </div>
          ) : (
            <>
              {/* Scheme header */}
              <div className={s.detailHeader}>
                <div>
                  <h2 className={s.detailName}>{selectedScheme.scheme_name}</h2>
                  <div className={s.detailMeta}>
                    <span className={s.detailCode}>{selectedScheme.scheme_code}</span>
                    <span className={s.detailAmc}>{selectedScheme.amc}</span>
                    <span className={s.detailCat}>{selectedScheme.category}</span>
                  </div>
                </div>
                {selectedScheme.nav && (
                  <div className={s.detailNav}>
                    <span className={s.detailNavValue}>{'\u20B9'}{Number(selectedScheme.nav).toFixed(2)}</span>
                    <span className={s.detailNavDate}>{selectedScheme.nav_date}</span>
                  </div>
                )}
              </div>

              {/* NAV History */}
              <div className={s.navSection}>
                <div className={s.navSectionHeader}>
                  <span className={s.navSectionTitle}>NAV History (1 Year)</span>
                  <span className={s.navSectionCount}>
                    {loadingNav ? 'Loading...' : `${navData.length} records`}
                  </span>
                </div>

                {navData.length > 0 ? (
                  <div className={s.navTableWrap}>
                    <table className={s.navTable}>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>NAV</th>
                        </tr>
                      </thead>
                      <tbody>
                        {navData.slice(-50).reverse().map((d) => (
                          <tr key={d.date}>
                            <td>{d.date}</td>
                            <td className={s.tdMono}>{'\u20B9'}{d.nav.toFixed(4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {navData.length > 50 && (
                      <div className={s.navMore}>Showing latest 50 of {navData.length} records</div>
                    )}
                  </div>
                ) : !loadingNav ? (
                  <div className={s.navEmpty}>
                    <p>No NAV data available for this scheme.</p>
                    <button
                      className={s.dlBtnLg}
                      onClick={() => handleDownload(selectedScheme.scheme_code)}
                      disabled={downloadingScheme === selectedScheme.scheme_code}
                    >
                      {downloadingScheme === selectedScheme.scheme_code
                        ? 'Downloading from MFAPI...'
                        : '\u2B07 Download Historical NAV'}
                    </button>
                  </div>
                ) : null}
              </div>

              {/* Actions */}
              <div className={s.detailActions}>
                <button
                  className={s.bmBtnLg}
                  onClick={() => handleBookmark(selectedScheme)}
                  disabled={bookmarkingScheme === selectedScheme.scheme_code}
                >
                  {bookmarkingScheme === selectedScheme.scheme_code ? 'Bookmarking...' : '\u{1F516} Bookmark for Daily Tracking'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
