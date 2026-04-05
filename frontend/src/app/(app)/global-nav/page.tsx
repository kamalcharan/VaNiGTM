'use client';

/**
 * Global NAV Explorer — ALL 16K+ schemes.
 *
 * No tenant filter — global scheme reference.
 * Reuses VdfTrackingCard (same component as My NAV) for the scheme list.
 *  - Stat filter cards at top
 *  - Search bar (debounced, server-side)
 *  - Paginated list using VdfTrackingCard
 *  - VdfDownloadNavModal for per-row NAV download
 *
 * COMPLIANCE:
 *  - forms.module.css  → inputs, buttons
 *  - data.module.css   → pagination, pageTitle
 *  - VDF components    → all UI
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import {
  VdfStatCard, VdfLoader, VdfEmptyState, VdfButton,
  VdfTrackingCard, type TrackingBookmark, type TrackingCardAction, type TrackingStatus,
} from '@/components/vdf';
import { VdfDownloadNavModal } from '@/components/vdf/download-nav-modal/VdfDownloadNavModal';
import f from '@/styles/forms.module.css';
import d from '@/styles/data.module.css';

/* ── Types ─────────────────────────────────────────── */

interface SchemeStats {
  total_schemes: number;
  active_schemes: number;
  ended_schemes: number;
  with_nav_data: number;
  without_nav_data: number;
  stale_nav_7d: number;
  metrics_calculated: number;
  metrics_pending: number;
}

interface SchemeRow {
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
  is_bookmarked: boolean;
}

interface SearchResult {
  results: SchemeRow[];
  total_matches: number;
  page: number;
  limit: number;
  total_pages: number;
}

type FilterStatus = 'all' | 'has_data' | 'no_data' | 'inactive';
const LIMIT = 50;

/* ── Helpers ─────────────────────────────────────────── */

function navAge(dateStr: string | null): number {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function toTrackingStatus(row: SchemeRow): TrackingStatus {
  if (row.nav_records === 0) return 'no_data';
  if (navAge(row.latest_nav_date) > 7) return 'stale';
  return 'healthy';
}

/** Map SchemeRow → TrackingBookmark so VdfTrackingCard can render it */
function toBookmark(row: SchemeRow): TrackingBookmark {
  return {
    id: 0,
    scheme_code: row.scheme_code,
    scheme_name: row.scheme_name,
    amc: row.amc,
    alias_name: null,
    daily_download_enabled: false,
    historical_download_done: row.nav_records > 0,
    active: row.active,
    category: row.category || null,
    scheme_type: row.scheme_type || null,
    nav_records: row.nav_records,
    latest_nav_date: row.latest_nav_date,
    latest_nav: row.nav,
    earliest_nav_date: row.earliest_nav_date,
    metrics_calculated_at: null,
    nav_age_days: navAge(row.nav_date) < 999 ? navAge(row.nav_date) : null,
  };
}

/* ── Component ─────────────────────────────────────── */

export default function GlobalNavPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [stats, setStats] = useState<SchemeStats | null>(null);
  const [schemes, setSchemes] = useState<SchemeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalMatches, setTotalMatches] = useState(0);
  const [bookmarkLoading, setBookmarkLoading] = useState<string | null>(null);
  const [downloadModal, setDownloadModal] = useState<SchemeRow | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Load stats (once) ── */
  useEffect(() => {
    apiFetch<{ data: SchemeStats }>(API.skills.execute, {
      pathParams: { skill: 'market-skill', fn: 'get_scheme_stats' },
      body: { params: {} },
    }).then(r => setStats(r.data)).catch(() => {}).finally(() => setStatsLoading(false));
  }, []);

  /* ── Load schemes ── */
  const loadSchemes = useCallback(async (q: string, status: FilterStatus, pg: number) => {
    setLoading(true);
    setLoadError(false);
    try {
      const params: Record<string, unknown> = { query: q, page: pg, limit: LIMIT };
      if (status === 'has_data')  params.has_nav_data = true;
      if (status === 'no_data')   params.has_nav_data = false;
      if (status === 'inactive')  params.active_only  = false;

      const r = await apiFetch<{ data: SearchResult }>(API.skills.execute, {
        pathParams: { skill: 'market-skill', fn: 'search_schemes' },
        body: { params },
      });
      setSchemes(r.data.results || []);
      setTotalPages(r.data.total_pages || 1);
      setTotalMatches(r.data.total_matches || 0);
    } catch {
      setLoadError(true);
      showToast({ message: 'Failed to load schemes', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  /* Debounce search + filter changes, reset page */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      loadSchemes(search, filterStatus, 1);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, filterStatus, loadSchemes]);

  /* Page change (no debounce) */
  useEffect(() => {
    loadSchemes(search, filterStatus, page);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  /* ── Bookmark toggle ── */
  async function toggleBookmark(row: SchemeRow) {
    if (bookmarkLoading) return;
    setBookmarkLoading(row.scheme_code);
    try {
      if (row.is_bookmarked) {
        await apiFetch<any>({ ...API.nav.removeBookmark, path: API.nav.removeBookmark.path.replace(':schemeCode', row.scheme_code) });
        showToast({ message: 'Removed from My NAV', type: 'success' });
      } else {
        await apiFetch<any>(API.nav.addBookmark, { body: { scheme_code: row.scheme_code } });
        showToast({ message: 'Added to My NAV', type: 'success' });
      }
      setSchemes(prev => prev.map(s => s.scheme_code === row.scheme_code ? { ...s, is_bookmarked: !s.is_bookmarked } : s));
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Action failed', type: 'error' });
    } finally {
      setBookmarkLoading(null);
    }
  }

  /* ── After download — refresh that row's records count ── */
  function handleDownloaded(records: number) {
    if (!downloadModal) return;
    setSchemes(prev => prev.map(s =>
      s.scheme_code === downloadModal.scheme_code
        ? { ...s, nav_records: s.nav_records + records, latest_nav_date: new Date().toISOString().split('T')[0] }
        : s,
    ));
    apiFetch<{ data: SchemeStats }>(API.skills.execute, {
      pathParams: { skill: 'market-skill', fn: 'get_scheme_stats' },
      body: { params: {} },
    }).then(r => setStats(r.data)).catch(() => {});
  }

  /* ── Filter card click — resets page ── */
  function handleFilterClick(status: FilterStatus) {
    setFilterStatus(status);
    setPage(1);
  }

  /* ── Card actions for each row ── */
  function cardActions(row: SchemeRow): TrackingCardAction[] {
    const busy = bookmarkLoading === row.scheme_code;
    return [
      {
        label: 'Dashboard',
        onClick: () => router.push(`/global-nav/${row.scheme_code}`),
        variant: 'primary',
        primary: true,
      },
      {
        label: row.nav_records > 0 ? 'Update NAV' : 'Download NAV',
        onClick: () => setDownloadModal(row),
        variant: 'success',
      },
      {
        label: row.is_bookmarked ? '★ My NAV' : '☆ Add to My NAV',
        onClick: () => toggleBookmark(row),
        variant: 'muted',
        disabled: busy,
      },
    ];
  }

  /* ── Render ── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '24px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div>
        <h1 className={d.pageTitle}>Global NAV</h1>
        <p className={d.pageSubtitle}>All mutual fund schemes · search, download NAV, add to My NAV</p>
      </div>

      {/* Stat filter cards */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <VdfStatCard
          value={statsLoading ? '…' : (stats?.total_schemes ?? 0)}
          label="All Schemes"
          accent="default"
          active={filterStatus === 'all'}
          onClick={() => handleFilterClick('all')}
        />
        <VdfStatCard
          value={statsLoading ? '…' : (stats?.with_nav_data ?? 0)}
          label="Has NAV Data"
          accent="success"
          active={filterStatus === 'has_data'}
          onClick={() => handleFilterClick('has_data')}
        />
        <VdfStatCard
          value={statsLoading ? '…' : (stats?.without_nav_data ?? 0)}
          label="No Data"
          accent="danger"
          active={filterStatus === 'no_data'}
          onClick={() => handleFilterClick('no_data')}
        />
        <VdfStatCard
          value={statsLoading ? '…' : (stats?.ended_schemes ?? 0)}
          label="Inactive"
          accent="warning"
          active={filterStatus === 'inactive'}
          onClick={() => handleFilterClick('inactive')}
        />
      </div>

      {/* Search bar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className={f.input}
          style={{ flex: 1, minWidth: 240 }}
          type="text"
          placeholder="Search by scheme name, AMC, category, or code…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {totalMatches > 0 && (
          <span style={{ fontSize: '0.72rem', color: 'var(--color-muted)', flexShrink: 0 }}>
            {totalMatches.toLocaleString()} scheme{totalMatches !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Scheme list — uses VdfTrackingCard (same component as My NAV) */}
      {loading ? (
        <VdfLoader message="Loading schemes" hint="Fetching from global scheme database" />
      ) : loadError ? (
        <VdfEmptyState
          icon="⚠️"
          title="Could not load schemes"
          description="There was a problem fetching scheme data."
          action={<VdfButton variant="primary" size="sm" onClick={() => loadSchemes(search, filterStatus, page)}>Retry</VdfButton>}
        />
      ) : schemes.length === 0 ? (
        <VdfEmptyState
          icon="🔍"
          title={search ? `No matches for "${search}"` : 'No schemes found'}
          description={search ? 'Try a different search term.' : 'No schemes match the current filter.'}
          action={search || filterStatus !== 'all'
            ? <VdfButton variant="outline" size="sm" onClick={() => { setSearch(''); setFilterStatus('all'); }}>Clear filters</VdfButton>
            : undefined}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {schemes.map(row => (
            <VdfTrackingCard
              key={row.scheme_code}
              bookmark={toBookmark(row)}
              status={toTrackingStatus(row)}
              actions={cardActions(row)}
              onClick={code => router.push(`/global-nav/${code}`)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && !loadError && totalPages > 1 && (
        <div className={d.pagination}>
          <button className={d.pageBtn} onClick={() => setPage(1)} disabled={page === 1}>«</button>
          <button className={d.pageBtn} onClick={() => setPage(p => p - 1)} disabled={page === 1}>‹</button>
          <span className={d.pageInfo}>Page {page} of {totalPages}</span>
          <button className={d.pageBtn} onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>›</button>
          <button className={d.pageBtn} onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
        </div>
      )}

      {/* Download NAV modal */}
      {downloadModal && (
        <VdfDownloadNavModal
          isOpen={!!downloadModal}
          onClose={() => setDownloadModal(null)}
          schemeCode={downloadModal.scheme_code}
          schemeName={downloadModal.scheme_name}
          amc={downloadModal.amc}
          launchDate={downloadModal.launch_date}
          navRecords={downloadModal.nav_records}
          earliestNavDate={downloadModal.earliest_nav_date}
          latestNavDate={downloadModal.latest_nav_date}
          onDownloaded={handleDownloaded}
        />
      )}

    </div>
  );
}
