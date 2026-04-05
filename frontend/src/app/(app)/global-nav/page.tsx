'use client';

/**
 * Global NAV Explorer — Two tabs:
 *
 *  Tab 1 "Tracking"  — bookmarked schemes, card view, bulk ops
 *  Tab 2 "Discover"  — search all 16K schemes, add bookmarks
 *
 * Mobile-first throughout. No tables — card layout only.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { useSkillQuery } from '@/hooks';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { useAuth } from '@/context/auth-provider';
import {
  VdfTrackingCard, type TrackingBookmark, type TrackingCardAction,
  VdfProgressOverlay, type ProgressItem,
  VdfLoader,
  VdfStatusBadge,
} from '@/components/vdf';
import s from './global-nav.module.css';

/* ── Types ─────────────────────────────────────────── */

interface BookmarksResponse {
  bookmarks: TrackingBookmark[];
}

interface SearchResult {
  scheme_code: string; scheme_name: string; amc: string;
  category: string; scheme_type: string; active: boolean;
  nav: number | null; nav_date: string | null; nav_records: number;
  launch_date: string | null; is_bookmarked: boolean;
}

interface SearchData {
  results: SearchResult[];
  total_matches: number; page: number; limit: number; total_pages: number;
}

interface StatsData {
  total_schemes: number; active_schemes: number; with_nav_data: number;
  without_nav_data: number; stale_nav_7d: number; metrics_calculated: number;
  metrics_pending: number;
}

type Tab = 'tracking' | 'discover';

/* ── Component ─────────────────────────────────────── */

export default function GlobalNavPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { user } = useAuth();
  const cancelRef = useRef(false);

  const [tab, setTab] = useState<Tab>('tracking');

  /* ── Tracking tab state ── */
  const [bookmarks, setBookmarks] = useState<TrackingBookmark[]>([]);
  const [bookmarksLoading, setBookmarksLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [trackSearch, setTrackSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'no_data' | 'has_data' | 'no_metrics'>('all');
  const [opLoading, setOpLoading] = useState<Record<string, boolean>>({});

  /* ── Discover tab state ── */
  const [discoverQuery, setDiscoverQuery] = useState('');
  const [discoverActive, setDiscoverActive] = useState('');
  const [discoverPage, setDiscoverPage] = useState(1);
  const [bookmarking, setBookmarking] = useState<string | null>(null);

  /* ── Bulk overlay ── */
  const [bulkOp, setBulkOp] = useState<{
    title: string; progress: number; progressText: string;
    items: ProgressItem[]; vani: string;
  } | null>(null);

  /* ── Load bookmarks ── */
  const loadBookmarks = useCallback(async () => {
    setBookmarksLoading(true);
    try {
      const data = await apiFetch<BookmarksResponse>(API.nav.bookmarks);
      setBookmarks(data.bookmarks || []);
    } catch { /* silent — user will see empty state */ }
    finally { setBookmarksLoading(false); }
  }, []);

  useEffect(() => { loadBookmarks(); }, [loadBookmarks]);

  /* ── Stats ── */
  const { data: statsResult } = useSkillQuery<StatsData>(
    'market-skill', 'get_scheme_stats', {}, { staleTime: 60000 },
  );
  const stats = statsResult?.data;

  /* ── Discover search ── */
  const { data: searchResult, isLoading: searching } = useSkillQuery<SearchData>(
    'market-skill', 'search_schemes',
    { query: discoverActive, limit: 30, page: discoverPage },
    { enabled: discoverActive.length >= 2 },
  );
  const discoverSchemes = searchResult?.data?.results || [];
  const discoverTotal = searchResult?.data?.total_matches || 0;
  const discoverPages = searchResult?.data?.total_pages || 1;

  /* ── Filter bookmarks client-side ── */
  const filtered = bookmarks.filter(b => {
    const q = trackSearch.toLowerCase();
    if (q && !b.scheme_name.toLowerCase().includes(q) &&
        !b.amc.toLowerCase().includes(q) &&
        !b.scheme_code.includes(q)) return false;
    if (filterStatus === 'no_data') return b.nav_records === 0;
    if (filterStatus === 'has_data') return b.nav_records > 0;
    if (filterStatus === 'no_metrics') return !b.metrics_calculated_at;
    return true;
  });

  /* ── Stat filter counts ── */
  const counts = {
    total: bookmarks.length,
    no_data: bookmarks.filter(b => b.nav_records === 0).length,
    has_data: bookmarks.filter(b => b.nav_records > 0).length,
    no_metrics: bookmarks.filter(b => !b.metrics_calculated_at).length,
  };

  /* ── Selection helpers ── */
  function toggleSelect(code: string) {
    setSelected(prev => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n; });
  }
  function toggleAll() {
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(b => b.scheme_code)));
  }

  /* ── Per-card actions ── */
  function cardActions(b: TrackingBookmark): TrackingCardAction[] {
    const busy = !!opLoading[b.scheme_code];
    return [
      {
        label: 'Dashboard', shortLabel: 'View',
        onClick: () => router.push(`/global-nav/${b.scheme_code}`),
        variant: 'primary',
      },
      {
        label: b.nav_records > 0 ? 'Update NAV' : 'Download NAV',
        shortLabel: b.nav_records > 0 ? 'Update' : 'Download',
        onClick: () => downloadOne(b.scheme_code),
        variant: 'success',
        disabled: busy, loading: busy && opLoading[b.scheme_code + '_dl'],
      },
      ...(b.nav_records > 0 ? [{
        label: 'Calculate Metrics', shortLabel: 'Metrics',
        onClick: () => calcOne(b.scheme_code),
        variant: 'muted' as const,
        disabled: busy, loading: busy && opLoading[b.scheme_code + '_calc'],
      }] : []),
      {
        label: 'Remove', shortLabel: '✕',
        onClick: () => removeBookmark(b.scheme_code),
        variant: 'danger',
        disabled: busy,
      },
    ];
  }

  async function downloadOne(code: string) {
    setOpLoading(p => ({ ...p, [code]: true, [code + '_dl']: true }));
    try {
      const r = await apiFetch<any>({ ...API.nav.downloadScheme, path: API.nav.downloadScheme.path.replace(':code', code) });
      showToast({ message: `${r.records || 0} records downloaded`, type: 'success' });
      loadBookmarks();
    } catch (err) { showToast({ message: (err as ApiError).message || 'Failed', type: 'error' }); }
    finally { setOpLoading(p => { const n = { ...p }; delete n[code]; delete n[code + '_dl']; return n; }); }
  }

  async function calcOne(code: string) {
    setOpLoading(p => ({ ...p, [code]: true, [code + '_calc']: true }));
    try {
      const r = await apiFetch<any>({ ...API.nav.calculateMetrics, path: API.nav.calculateMetrics.path.replace(':code', code) });
      showToast({ message: r.status === 'already_fresh' ? 'Metrics up to date' : `${r.records_updated || 0} records updated`, type: 'success' });
      loadBookmarks();
    } catch (err) { showToast({ message: (err as ApiError).message || 'Failed', type: 'error' }); }
    finally { setOpLoading(p => { const n = { ...p }; delete n[code]; delete n[code + '_calc']; return n; }); }
  }

  async function removeBookmark(code: string) {
    setOpLoading(p => ({ ...p, [code]: true }));
    try {
      await apiFetch<any>({ ...API.nav.removeBookmark, path: API.nav.removeBookmark.path.replace(':schemeCode', code) });
      showToast({ message: 'Removed from tracking', type: 'success' });
      setBookmarks(prev => prev.filter(b => b.scheme_code !== code));
      setSelected(prev => { const n = new Set(prev); n.delete(code); return n; });
    } catch (err) { showToast({ message: (err as ApiError).message || 'Failed', type: 'error' }); }
    finally { setOpLoading(p => { const n = { ...p }; delete n[code]; return n; }); }
  }

  /* ── Bulk download (selected) ── */
  async function handleBulkDownload() {
    const codes = [...selected];
    if (codes.length === 0) return;
    cancelRef.current = false;

    const items: ProgressItem[] = codes.map(c => ({
      label: bookmarks.find(b => b.scheme_code === c)?.scheme_name || c,
      status: 'pending' as const,
    }));

    setBulkOp({ title: 'Downloading NAV', progress: 0, progressText: `0 of ${codes.length}`, items, vani: 'Starting sequential download...' });

    let done = 0;
    for (let i = 0; i < codes.length; i++) {
      if (cancelRef.current) break;
      items[i] = { ...items[i], status: 'running' };
      setBulkOp(p => p ? { ...p, items: [...items], progress: (i / codes.length) * 100, progressText: `${i + 1} of ${codes.length}`, vani: `Fetching ${items[i].label.slice(0, 40)}...` } : null);
      try {
        const r = await apiFetch<any>({ ...API.nav.downloadScheme, path: API.nav.downloadScheme.path.replace(':code', codes[i]) });
        items[i] = { ...items[i], status: 'done', detail: `${(r.records || 0).toLocaleString()} records` };
        done++;
      } catch { items[i] = { ...items[i], status: 'failed', detail: 'Error' }; }
      setBulkOp(p => p ? { ...p, items: [...items], progress: ((i + 1) / codes.length) * 100, vani: `${done} complete so far.` } : null);
    }

    setBulkOp(p => p ? { ...p, progress: 100, progressText: `${done} of ${codes.length} complete`, vani: cancelRef.current ? 'Cancelled.' : `Done! ${done} schemes updated.` } : null);
    setTimeout(() => { setBulkOp(null); loadBookmarks(); }, 2500);
  }

  /* ── Bulk metrics ── */
  async function handleBulkMetrics() {
    setBulkOp({ title: 'Calculating Metrics', progress: 50, progressText: 'Running PostgreSQL RPC...', items: [{ label: 'calculate_all_scheme_metrics()', status: 'running' }], vani: 'Computing returns, volatility, Sharpe, CAGR for all tracked schemes...' });
    try {
      const r = await apiFetch<any>(API.nav.calculateMetricsBulk);
      setBulkOp({ title: 'Metrics Complete', progress: 100, progressText: `${r.total_schemes} schemes`, items: [{ label: `${(r.total_records_updated || 0).toLocaleString()} records updated`, status: 'done', detail: `${((r.execution_ms || 0) / 1000).toFixed(1)}s` }], vani: `All metrics calculated across ${r.total_schemes} schemes.` });
    } catch (err) {
      setBulkOp({ title: 'Failed', progress: 0, progressText: 'Error', items: [{ label: (err as ApiError).message || 'Unknown error', status: 'failed' }], vani: 'Metrics calculation failed.' });
    }
    setTimeout(() => { setBulkOp(null); loadBookmarks(); }, 2500);
  }

  /* ── Add bookmark (Discover tab) ── */
  async function addBookmark(scheme: SearchResult) {
    if (scheme.is_bookmarked || bookmarking === scheme.scheme_code) return;
    setBookmarking(scheme.scheme_code);
    try {
      await apiFetch<any>(API.nav.addBookmark, {
        body: { scheme_code: scheme.scheme_code, scheme_name: scheme.scheme_name, amc: scheme.amc },
      });
      showToast({ message: `${scheme.scheme_name} added to tracking`, type: 'success' });
      // Mark as bookmarked in local state
      discoverSchemes.forEach(s2 => { if (s2.scheme_code === scheme.scheme_code) s2.is_bookmarked = true; });
      loadBookmarks();
    } catch (err) { showToast({ message: (err as ApiError).message || 'Failed to add', type: 'error' }); }
    finally { setBookmarking(null); }
  }

  /* ── Render ────────────────────────────────────────── */
  return (
    <div className={s.page}>
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

      {/* ── Page header ── */}
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>Global NAV</h1>
          <p className={s.pageSubtitle}>
            {user?.name ? `${user.name} · ` : ''}
            {counts.total > 0
              ? `${counts.total} schemes tracked · ${counts.has_data} with data`
              : 'Track mutual fund NAV data for your clients'}
          </p>
        </div>
        {stats && (
          <div className={s.headerStats}>
            <div className={s.headerStat}>
              <span className={s.headerStatVal}>{stats.total_schemes.toLocaleString()}</span>
              <span className={s.headerStatLabel}>Total Schemes</span>
            </div>
            <div className={`${s.headerStat} ${s.headerStatSuccess}`}>
              <span className={s.headerStatVal}>{stats.with_nav_data}</span>
              <span className={s.headerStatLabel}>With NAV</span>
            </div>
            {stats.stale_nav_7d > 0 && (
              <div className={`${s.headerStat} ${s.headerStatWarn}`}>
                <span className={s.headerStatVal}>{stats.stale_nav_7d}</span>
                <span className={s.headerStatLabel}>Stale</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className={s.tabs}>
        <button className={`${s.tab} ${tab === 'tracking' ? s.tabActive : ''}`} onClick={() => setTab('tracking')}>
          Tracking {counts.total > 0 && <span className={s.tabCount}>{counts.total}</span>}
        </button>
        <button className={`${s.tab} ${tab === 'discover' ? s.tabActive : ''}`} onClick={() => setTab('discover')}>
          Discover Schemes
        </button>
      </div>

      {/* ══════════════════════════════════════════════════
          TAB 1 — TRACKING
      ══════════════════════════════════════════════════ */}
      {tab === 'tracking' && (
        <div className={s.trackingPane}>

          {/* Stat filter cards */}
          <div className={s.filterCards}>
            {[
              { key: 'all',        label: 'All Tracked',  val: counts.total,      accent: '' },
              { key: 'no_data',    label: 'No Data',      val: counts.no_data,    accent: s.fcDanger },
              { key: 'has_data',   label: 'Has Data',     val: counts.has_data,   accent: s.fcSuccess },
              { key: 'no_metrics', label: 'No Metrics',   val: counts.no_metrics, accent: s.fcWarn },
            ].map(f => (
              <button
                key={f.key}
                className={`${s.filterCard} ${f.accent} ${filterStatus === f.key ? s.filterCardActive : ''}`}
                onClick={() => setFilterStatus(f.key as typeof filterStatus)}
              >
                <span className={s.fcVal}>{f.val}</span>
                <span className={s.fcLabel}>{f.label}</span>
              </button>
            ))}
          </div>

          {/* Search + bulk actions toolbar */}
          <div className={s.trackToolbar}>
            <input
              className={s.searchInput}
              type="text"
              placeholder="Search by name, AMC, or code..."
              value={trackSearch}
              onChange={e => setTrackSearch(e.target.value)}
            />
            <div className={s.toolbarRight}>
              {selected.size > 0 ? (
                <>
                  <button className={`${s.toolBtn} ${s.toolBtnPrimary}`} onClick={handleBulkDownload}>
                    ↓ Download ({selected.size})
                  </button>
                  <button className={`${s.toolBtn}`} onClick={handleBulkMetrics}>
                    ⊕ Metrics
                  </button>
                  <button className={`${s.toolBtn} ${s.toolBtnMuted}`} onClick={() => setSelected(new Set())}>
                    Clear
                  </button>
                </>
              ) : (
                <>
                  <button className={`${s.toolBtn}`} onClick={handleBulkMetrics} title="Calculate metrics for all tracked schemes">
                    ⊕ All Metrics
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Select-all row */}
          {filtered.length > 0 && (
            <div className={s.selectAllRow}>
              <label className={s.selectAllLabel}>
                <input
                  type="checkbox"
                  className={s.check}
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={toggleAll}
                />
                {selected.size > 0
                  ? `${selected.size} of ${filtered.length} selected`
                  : `${filtered.length} scheme${filtered.length !== 1 ? 's' : ''}`}
              </label>
            </div>
          )}

          {/* Card list */}
          {bookmarksLoading ? (
            <VdfLoader message="Loading tracked schemes" hint="Fetching from ProKey database" />
          ) : filtered.length === 0 ? (
            <div className={s.emptyState}>
              {bookmarks.length === 0 ? (
                <>
                  <div className={s.emptyIcon}>📋</div>
                  <div className={s.emptyTitle}>No schemes tracked yet</div>
                  <div className={s.emptyDesc}>
                    Go to <button className={s.emptyLink} onClick={() => setTab('discover')}>Discover Schemes</button> to search and add schemes for your clients.
                  </div>
                </>
              ) : (
                <>
                  <div className={s.emptyIcon}>🔍</div>
                  <div className={s.emptyTitle}>No matches for "{trackSearch}"</div>
                  <div className={s.emptyDesc}>Try a different name, AMC, or code.</div>
                </>
              )}
            </div>
          ) : (
            <div className={s.cardList}>
              {filtered.map(b => (
                <VdfTrackingCard
                  key={b.scheme_code}
                  bookmark={b}
                  selected={selected.has(b.scheme_code)}
                  onSelect={toggleSelect}
                  actions={cardActions(b)}
                  onClick={code => router.push(`/global-nav/${code}`)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          TAB 2 — DISCOVER
      ══════════════════════════════════════════════════ */}
      {tab === 'discover' && (
        <div className={s.discoverPane}>
          <p className={s.discoverHint}>
            Search across {stats?.total_schemes?.toLocaleString() || '16,000+'} schemes. Click <strong>+ Track</strong> to add a scheme to your tracking list.
          </p>

          <form
            className={s.discoverSearch}
            onSubmit={e => { e.preventDefault(); if (discoverQuery.trim().length >= 2) { setDiscoverActive(discoverQuery.trim()); setDiscoverPage(1); } }}
          >
            <input
              className={s.searchInput}
              type="text"
              placeholder="Search scheme name, AMC, or code…"
              value={discoverQuery}
              onChange={e => setDiscoverQuery(e.target.value)}
              autoFocus
            />
            <button type="submit" className={`${s.toolBtn} ${s.toolBtnPrimary}`} disabled={discoverQuery.trim().length < 2}>
              Search
            </button>
          </form>

          {/* Results */}
          {searching && <VdfLoader message="Searching schemes" />}

          {!searching && discoverActive && discoverSchemes.length === 0 && (
            <div className={s.emptyState}>
              <div className={s.emptyIcon}>🔍</div>
              <div className={s.emptyTitle}>No results for "{discoverActive}"</div>
              <div className={s.emptyDesc}>Try a different name or scheme code.</div>
            </div>
          )}

          {discoverSchemes.length > 0 && (
            <>
              <div className={s.discoverCount}>
                {discoverTotal.toLocaleString()} results for "{discoverActive}"
              </div>
              <div className={s.cardList}>
                {discoverSchemes.map(sc => (
                  <div key={sc.scheme_code} className={s.discoverCard}>
                    <div className={s.discoverCardInfo}>
                      <div className={s.discoverName}>
                        {sc.scheme_name}
                        {sc.is_bookmarked && <span className={s.trackingBadge}>✓ Tracking</span>}
                      </div>
                      <div className={s.discoverMeta}>
                        <span className={s.metaMono}>{sc.scheme_code}</span>
                        <span className={s.metaDot}>·</span>
                        <span>{sc.amc}</span>
                        {sc.category && <><span className={s.metaDot}>·</span><span className={s.metaMuted}>{sc.category}</span></>}
                        {!sc.active && <VdfStatusBadge label="Ended" variant="muted" size="sm" />}
                      </div>
                      <div className={s.discoverNavRow}>
                        {sc.nav
                          ? <span className={s.discoverNav}>₹{Number(sc.nav).toFixed(4)}</span>
                          : <span className={s.metaMuted}>No NAV data</span>}
                        {sc.nav_date && <span className={s.metaMuted}>· {sc.nav_date}</span>}
                        {sc.launch_date && <span className={s.metaMuted}>· Est. {sc.launch_date}</span>}
                      </div>
                    </div>
                    <div className={s.discoverCardAction}>
                      {sc.is_bookmarked ? (
                        <span className={s.alreadyTracking}>✓ Tracking</span>
                      ) : (
                        <button
                          className={`${s.toolBtn} ${s.toolBtnPrimary}`}
                          onClick={() => addBookmark(sc)}
                          disabled={bookmarking === sc.scheme_code}
                        >
                          {bookmarking === sc.scheme_code ? 'Adding…' : '+ Track'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {discoverPages > 1 && (
                <div className={s.pagination}>
                  <button className={s.pageBtn} disabled={discoverPage <= 1} onClick={() => setDiscoverPage(1)}>First</button>
                  <button className={s.pageBtn} disabled={discoverPage <= 1} onClick={() => setDiscoverPage(p => p - 1)}>Prev</button>
                  <span className={s.pageInfo}>{discoverPage} / {discoverPages}</span>
                  <button className={s.pageBtn} disabled={discoverPage >= discoverPages} onClick={() => setDiscoverPage(p => p + 1)}>Next</button>
                  <button className={s.pageBtn} disabled={discoverPage >= discoverPages} onClick={() => setDiscoverPage(discoverPages)}>Last</button>
                </div>
              )}
            </>
          )}

          {!discoverActive && (
            <div className={s.discoverIdle}>
              <div className={s.discoverIdleIcon}>🔭</div>
              <div className={s.discoverIdleText}>Type a scheme name, AMC or code to search</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
