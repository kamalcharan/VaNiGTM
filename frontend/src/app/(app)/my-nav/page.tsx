'use client';

/**
 * My NAV — Tenant's bookmarked schemes.
 *
 * Two tabs:
 *  Tab 1 "My Schemes"  — bookmarked schemes, card view, bulk ops, VaNi
 *  Tab 2 "Discover"    — search all 16K schemes, add to My NAV
 *
 * COMPLIANCE:
 *  - No per-page CSS module — inline style for layout only
 *  - forms.module.css  → inputs, buttons
 *  - data.module.css   → pageTitle, pageSubtitle, pagination
 *  - VDF components    → all UI
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { useSkillQuery } from '@/hooks';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { useAuth } from '@/context/auth-provider';

const MIN_LOADER_MS = 600; // always show loader for at least this long (branding)
import {
  VdfTabs,
  VdfStatCard,
  VdfTrackingCard, type TrackingBookmark, type TrackingCardAction, type TrackingStatus, type AliasRecord,
  VdfProactiveCard,
  VdfProgressOverlay, type ProgressItem,
  VdfLoader,
  VdfStatusBadge,
  VdfEmptyState,
  VdfButton,
} from '@/components/vdf';
import f from '@/styles/forms.module.css';
import d from '@/styles/data.module.css';

/* ── Types ─────────────────────────────────────────── */

interface BookmarksResponse { bookmarks: TrackingBookmark[]; }

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

type FilterStatus = 'all' | 'no_data' | 'has_data' | 'no_metrics';
type Tab = 'my-schemes' | 'discover';

/* ── Helpers ────────────────────────────────────────── */

function computeStatus(b: TrackingBookmark): TrackingStatus {
  if (b.nav_records === 0) return 'no_data';
  if ((b.nav_age_days ?? 0) > 7) return 'stale';
  if (!b.metrics_calculated_at) return 'no_metrics';
  return 'healthy';
}

/* ── Component ─────────────────────────────────────── */

export default function MyNavPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { user } = useAuth();
  const cancelRef = useRef(false);

  const [tab, setTab] = useState<Tab>('my-schemes');

  /* ── My Schemes tab state ── */
  const [bookmarks, setBookmarks] = useState<TrackingBookmark[]>([]);
  const [bookmarksLoading, setBookmarksLoading] = useState(true);
  const [minLoadDone, setMinLoadDone] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [trackSearch, setTrackSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [opLoading, setOpLoading] = useState<Record<string, boolean>>({});
  const [vaniDismissed, setVaniDismissed] = useState(false);

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
    setLoadError(false);
    try {
      const data = await apiFetch<BookmarksResponse>(API.nav.bookmarks);
      setBookmarks(data.bookmarks || []);
    } catch (err) {
      setLoadError(true);
      showToast({ message: (err as ApiError).message || 'Failed to load bookmarks', type: 'error' });
    } finally {
      setBookmarksLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadBookmarks(); }, [loadBookmarks]);

  // Minimum loader duration — always show loader for at least MIN_LOADER_MS (branding)
  useEffect(() => {
    const t = setTimeout(() => setMinLoadDone(true), MIN_LOADER_MS);
    return () => clearTimeout(t);
  }, []);

  /* ── Global stats (for Discover tab hint) ── */
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
        !(b.alias_name || '').toLowerCase().includes(q) &&
        !b.amc.toLowerCase().includes(q) &&
        !b.scheme_code.includes(q)) return false;
    if (filterStatus === 'no_data') return b.nav_records === 0;
    if (filterStatus === 'has_data') return b.nav_records > 0;
    if (filterStatus === 'no_metrics') return !b.metrics_calculated_at;
    return true;
  });

  /* ── Counts for filter cards ── */
  const counts = {
    total: bookmarks.length,
    no_data: bookmarks.filter(b => b.nav_records === 0).length,
    has_data: bookmarks.filter(b => b.nav_records > 0).length,
    no_metrics: bookmarks.filter(b => !b.metrics_calculated_at).length,
    stale: bookmarks.filter(b => (b.nav_age_days ?? 0) > 7 && b.nav_records > 0).length,
  };

  /* ── VaNi — always visible, 3 states ── */
  const gapCount = counts.no_data + counts.stale;

  // State 1: no bookmarks → onboarding nudge
  // State 2: gaps exist (not dismissed) → fill nudge
  // State 3: all healthy → affirmation
  const vaniProps: {
    message: string; ctaLabel?: string; onCta?: () => void; onDismiss?: () => void;
  } = counts.total === 0
    ? {
        message: 'Add schemes to My NAV to track their NAV data and calculate performance metrics. Use Discover & Add to browse 16,000+ mutual funds.',
        ctaLabel: 'Discover Schemes',
        onCta: () => setTab('discover'),
      }
    : gapCount > 0 && !vaniDismissed
    ? {
        message: counts.no_data > 0 && counts.stale > 0
          ? `${counts.no_data} scheme${counts.no_data !== 1 ? 's' : ''} have no NAV data and ${counts.stale} ${counts.stale !== 1 ? 'are' : 'is'} stale (>7 days). Download all to stay current.`
          : counts.no_data > 0
          ? `${counts.no_data} tracked scheme${counts.no_data !== 1 ? 's have' : ' has'} no NAV data yet. Download to start tracking.`
          : `${counts.stale} tracked scheme${counts.stale !== 1 ? 's are' : ' is'} stale (last NAV >7 days ago). Refresh now.`,
        ctaLabel: `Fill ${gapCount} Gap${gapCount !== 1 ? 's' : ''}`,
        onCta: handleFillAllGaps,
        onDismiss: () => setVaniDismissed(true),
      }
    : {
        message: `All ${counts.total} tracked scheme${counts.total !== 1 ? 's are' : ' is'} up to date with fresh NAV data${counts.metrics_pending > 0 ? ` — ${counts.metrics_pending} still need metrics calculated` : ''}.`,
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
        label: 'Dashboard',
        onClick: () => router.push(`/global-nav/${b.scheme_code}`),
        variant: 'primary', primary: true,
      },
      {
        label: b.nav_records > 0 ? 'Update NAV' : 'Download NAV',
        onClick: () => downloadOne(b.scheme_code),
        variant: 'success',
        disabled: busy, loading: busy && !!opLoading[b.scheme_code + '_dl'],
      },
      ...(b.nav_records > 0 ? [{
        label: 'Calc Metrics',
        onClick: () => calcOne(b.scheme_code),
        variant: 'muted' as const,
        disabled: busy, loading: busy && !!opLoading[b.scheme_code + '_calc'],
      }] : []),
    ];
  }

  async function downloadOne(code: string) {
    setOpLoading(p => ({ ...p, [code]: true, [code + '_dl']: true }));
    try {
      const r = await apiFetch<any>({ ...API.nav.downloadScheme, path: API.nav.downloadScheme.path.replace(':code', code) });
      showToast({ message: `${r.records || 0} records downloaded`, type: 'success' });
      loadBookmarks();
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Download failed', type: 'error' });
    } finally {
      setOpLoading(p => { const n = { ...p }; delete n[code]; delete n[code + '_dl']; return n; });
    }
  }

  async function calcOne(code: string) {
    setOpLoading(p => ({ ...p, [code]: true, [code + '_calc']: true }));
    try {
      const r = await apiFetch<any>({ ...API.nav.calculateMetrics, path: API.nav.calculateMetrics.path.replace(':code', code) });
      showToast({ message: r.status === 'already_fresh' ? 'Metrics up to date' : `${r.records_updated || 0} records updated`, type: 'success' });
      loadBookmarks();
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Metrics calculation failed', type: 'error' });
    } finally {
      setOpLoading(p => { const n = { ...p }; delete n[code]; delete n[code + '_calc']; return n; });
    }
  }

  /* ── Alias handlers ── */
  async function handleAliasEdit(code: string, newAlias: string | null) {
    try {
      await apiFetch<any>({ ...API.nav.updateBookmarkAlias, path: API.nav.updateBookmarkAlias.path.replace(':schemeCode', code) }, { body: { alias_name: newAlias } });
      setBookmarks(prev => prev.map(b => b.scheme_code === code ? { ...b, alias_name: newAlias } : b));
      showToast({ message: newAlias ? `Display name set: ${newAlias}` : 'Display name cleared', type: 'success' });
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Failed to update alias', type: 'error' });
      throw err;
    }
  }

  async function handleAliasLoad(code: string): Promise<AliasRecord[]> {
    const data = await apiFetch<{ aliases: AliasRecord[] }>({ ...API.nav.aliases, path: `${API.nav.aliases.path}?scheme_code=${encodeURIComponent(code)}` });
    return data.aliases || [];
  }

  async function handleAliasAdd(code: string, alias: string): Promise<AliasRecord> {
    const data = await apiFetch<{ alias: AliasRecord }>(API.nav.createAlias, { body: { scheme_code: code, alias_name: alias, source: 'manual' } });
    showToast({ message: `Alias added: ${alias}`, type: 'success' });
    return data.alias;
  }

  async function handleAliasDelete(id: number, code: string) {
    await apiFetch<any>({ ...API.nav.deleteAlias, path: API.nav.deleteAlias.path.replace(':id', String(id)) });
    showToast({ message: 'Alias removed', type: 'success' });
  }

  async function removeBookmark(code: string) {
    try {
      await apiFetch<any>({ ...API.nav.removeBookmark, path: API.nav.removeBookmark.path.replace(':schemeCode', code) });
      showToast({ message: 'Removed from My NAV', type: 'success' });
      setBookmarks(prev => prev.filter(b => b.scheme_code !== code));
      setSelected(prev => { const n = new Set(prev); n.delete(code); return n; });
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Remove failed', type: 'error' });
    }
  }

  /* ── VaNi CTA: fill all gaps ── */
  async function handleFillAllGaps() {
    const codes = bookmarks
      .filter(b => b.nav_records === 0 || (b.nav_age_days ?? 0) > 7)
      .map(b => b.scheme_code);
    if (codes.length === 0) return;
    cancelRef.current = false;

    const items: ProgressItem[] = codes.map(c => ({
      label: bookmarks.find(b => b.scheme_code === c)?.alias_name ||
             bookmarks.find(b => b.scheme_code === c)?.scheme_name || c,
      status: 'pending' as const,
    }));

    setBulkOp({ title: 'Filling NAV Gaps', progress: 0, progressText: `0 of ${codes.length}`, items, vani: 'Starting sequential download...' });

    let done = 0;
    for (let i = 0; i < codes.length; i++) {
      if (cancelRef.current) break;
      items[i] = { ...items[i], status: 'running' };
      setBulkOp(p => p ? { ...p, items: [...items], progress: (i / codes.length) * 100, progressText: `${i + 1} of ${codes.length}`, vani: `Fetching ${items[i].label.slice(0, 40)}...` } : null);
      try {
        const r = await apiFetch<any>({ ...API.nav.downloadScheme, path: API.nav.downloadScheme.path.replace(':code', codes[i]) });
        items[i] = { ...items[i], status: 'done', detail: `${(r.records || 0).toLocaleString()} records` };
        done++;
      } catch {
        items[i] = { ...items[i], status: 'failed', detail: 'Error' };
      }
      setBulkOp(p => p ? { ...p, items: [...items], progress: ((i + 1) / codes.length) * 100, vani: `${done} complete.` } : null);
    }

    setBulkOp(p => p ? {
      ...p, progress: 100,
      progressText: `${done} of ${codes.length} complete`,
      vani: cancelRef.current ? 'Cancelled.' : `Done! ${done} schemes updated.`,
    } : null);
    setTimeout(() => { setBulkOp(null); loadBookmarks(); setVaniDismissed(true); }, 2500);
  }

  /* ── Bulk: download selected ── */
  async function handleBulkDownload() {
    const codes = [...selected];
    if (codes.length === 0) return;
    cancelRef.current = false;

    const items: ProgressItem[] = codes.map(c => ({
      label: bookmarks.find(b => b.scheme_code === c)?.alias_name ||
             bookmarks.find(b => b.scheme_code === c)?.scheme_name || c,
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
      } catch {
        items[i] = { ...items[i], status: 'failed', detail: 'Error' };
      }
      setBulkOp(p => p ? { ...p, items: [...items], progress: ((i + 1) / codes.length) * 100, vani: `${done} complete so far.` } : null);
    }

    setBulkOp(p => p ? {
      ...p, progress: 100,
      progressText: `${done} of ${codes.length} complete`,
      vani: cancelRef.current ? 'Cancelled.' : `Done! ${done} schemes updated.`,
    } : null);
    setTimeout(() => { setBulkOp(null); loadBookmarks(); }, 2500);
  }

  /* ── Bulk: recalculate all metrics ── */
  async function handleBulkMetrics() {
    setBulkOp({
      title: 'Calculating Metrics', progress: 50,
      progressText: 'Running PostgreSQL RPC...',
      items: [{ label: 'calculate_all_scheme_metrics()', status: 'running' }],
      vani: 'Computing returns, volatility, Sharpe, CAGR for all tracked schemes...',
    });
    try {
      const r = await apiFetch<any>(API.nav.calculateMetricsBulk);
      setBulkOp({
        title: 'Metrics Complete', progress: 100,
        progressText: `${r.total_schemes} schemes`,
        items: [{ label: `${(r.total_records_updated || 0).toLocaleString()} records updated`, status: 'done', detail: `${((r.execution_ms || 0) / 1000).toFixed(1)}s` }],
        vani: `All metrics calculated across ${r.total_schemes} schemes.`,
      });
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Metrics calculation failed', type: 'error' });
      setBulkOp(null);
      return;
    }
    setTimeout(() => { setBulkOp(null); loadBookmarks(); }, 2500);
  }

  /* ── Add bookmark from Discover ── */
  async function addBookmark(scheme: SearchResult) {
    if (scheme.is_bookmarked || bookmarking === scheme.scheme_code) return;
    setBookmarking(scheme.scheme_code);
    try {
      await apiFetch<any>(API.nav.addBookmark, {
        body: { scheme_code: scheme.scheme_code, scheme_name: scheme.scheme_name, amc: scheme.amc },
      });
      showToast({ message: `${scheme.scheme_name.slice(0, 50)} added to My NAV`, type: 'success' });
      scheme.is_bookmarked = true;
      loadBookmarks();
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Failed to add scheme', type: 'error' });
    } finally {
      setBookmarking(null);
    }
  }

  /* ── Render ────────────────────────────────────────── */

  // Full-page loader: show until both data is ready AND min duration has elapsed
  if (bookmarksLoading || !minLoadDone) {
    return <VdfLoader message="Loading My NAV" hint="Fetching your tracked schemes" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '24px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Bulk op overlay */}
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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className={d.pageTitle}>My NAV</h1>
          <p className={d.pageSubtitle}>
            {user?.name ? `${user.name} · ` : ''}
            {counts.total > 0
              ? `${counts.total} scheme${counts.total !== 1 ? 's' : ''} tracked · ${counts.has_data} with NAV data`
              : 'Add schemes to track their NAV and calculate performance metrics'}
          </p>
        </div>
        {counts.total > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <VdfStatCard value={counts.total} label="Tracked" />
            <VdfStatCard value={counts.has_data} label="With NAV" accent="success" />
            {counts.stale > 0 && <VdfStatCard value={counts.stale} label="Stale" accent="warning" />}
            {counts.no_data > 0 && <VdfStatCard value={counts.no_data} label="No Data" accent="danger" />}
          </div>
        )}
      </div>

      {/* ── Tab navigation ── */}
      <VdfTabs
        variant="pill"
        activeId={tab}
        onChange={id => setTab(id as Tab)}
        tabs={[
          { id: 'my-schemes', label: 'My Schemes', badge: counts.total > 0 ? counts.total : undefined },
          { id: 'discover', label: 'Discover & Add' },
        ]}
      />

      {/* ══════════════════════════════════════════════════
          TAB 1 — MY SCHEMES
      ══════════════════════════════════════════════════ */}
      {tab === 'my-schemes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* VaNi — always visible in My Schemes: onboarding / gap nudge / all-healthy */}
          <VdfProactiveCard
            label="VaNi"
            message={vaniProps.message}
            ctaLabel={vaniProps.ctaLabel}
            onCta={vaniProps.onCta}
            onDismiss={vaniProps.onDismiss}
          />

          {/* Filter stat cards */}
          {counts.total > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              <VdfStatCard value={counts.total} label="All"
                onClick={() => setFilterStatus('all')} active={filterStatus === 'all'} />
              <VdfStatCard value={counts.no_data} label="No Data"
                accent={counts.no_data > 0 ? 'danger' : 'default'}
                onClick={() => setFilterStatus('no_data')} active={filterStatus === 'no_data'} />
              <VdfStatCard value={counts.has_data} label="Has Data"
                accent="success"
                onClick={() => setFilterStatus('has_data')} active={filterStatus === 'has_data'} />
              <VdfStatCard value={counts.no_metrics} label="No Metrics"
                accent={counts.no_metrics > 0 ? 'warning' : 'default'}
                onClick={() => setFilterStatus('no_metrics')} active={filterStatus === 'no_metrics'} />
            </div>
          )}

          {/* Toolbar: search + bulk actions */}
          {counts.total > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                className={f.input}
                style={{ flex: 1, minWidth: 200 }}
                type="text"
                placeholder="Search by name, alias, AMC, or code..."
                value={trackSearch}
                onChange={e => setTrackSearch(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {selected.size > 0 ? (
                  <>
                    <VdfButton variant="primary" size="sm" onClick={handleBulkDownload}>
                      ↓ Download ({selected.size})
                    </VdfButton>
                    <VdfButton variant="outline" size="sm" onClick={handleBulkMetrics}>
                      ⊕ Metrics
                    </VdfButton>
                    <VdfButton variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                      Clear
                    </VdfButton>
                  </>
                ) : (
                  <VdfButton variant="outline" size="sm" onClick={handleBulkMetrics}
                    title="Recalculate metrics for all tracked schemes">
                    ⊕ All Metrics
                  </VdfButton>
                )}
              </div>
            </div>
          )}

          {/* Select-all row */}
          {filtered.length > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem', color: 'var(--color-muted)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                style={{ accentColor: 'var(--color-primary)', width: 15, height: 15 }}
                checked={selected.size === filtered.length && filtered.length > 0}
                onChange={toggleAll}
              />
              {selected.size > 0
                ? `${selected.size} of ${filtered.length} selected`
                : `${filtered.length} scheme${filtered.length !== 1 ? 's' : ''}`}
            </label>
          )}

          {/* Card list */}
          {loadError ? (
            <VdfEmptyState
              icon="⚠️"
              title="Could not load schemes"
              description="There was a problem fetching your tracked schemes."
              action={
                <VdfButton variant="primary" size="sm" onClick={loadBookmarks}>
                  Try Again
                </VdfButton>
              }
            />
          ) : filtered.length === 0 ? (
            bookmarks.length === 0 ? (
              <VdfEmptyState
                icon="📌"
                title="No schemes in My NAV yet"
                description="Use Discover & Add to search 16,000+ mutual funds and add them here."
                action={
                  <VdfButton variant="primary" size="sm" onClick={() => setTab('discover')}>
                    Discover & Add Schemes
                  </VdfButton>
                }
              />
            ) : (
              <VdfEmptyState
                icon="🔍"
                title={`No matches for "${trackSearch}"`}
                description="Try searching by alias, scheme name, AMC, or code."
              />
            )
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map(b => (
                <VdfTrackingCard
                  key={b.scheme_code}
                  bookmark={b}
                  status={computeStatus(b)}
                  selected={selected.has(b.scheme_code)}
                  onSelect={toggleSelect}
                  onRemove={removeBookmark}
                  actions={cardActions(b)}
                  onClick={code => router.push(`/global-nav/${code}`)}
                  onAliasEdit={handleAliasEdit}
                  onAliasLoad={handleAliasLoad}
                  onAliasAdd={handleAliasAdd}
                  onAliasDelete={handleAliasDelete}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          TAB 2 — DISCOVER & ADD
      ══════════════════════════════════════════════════ */}
      {tab === 'discover' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-muted)' }}>
            Search across {stats?.total_schemes?.toLocaleString() || '16,000+'} mutual fund schemes.
            Click <strong>+ Add to My NAV</strong> to start tracking.
          </p>

          <form
            style={{ display: 'flex', gap: 8 }}
            onSubmit={e => {
              e.preventDefault();
              if (discoverQuery.trim().length >= 2) {
                setDiscoverActive(discoverQuery.trim());
                setDiscoverPage(1);
              }
            }}
          >
            <input
              className={f.input}
              style={{ flex: 1 }}
              type="text"
              placeholder="Search scheme name, AMC, or scheme code…"
              value={discoverQuery}
              onChange={e => setDiscoverQuery(e.target.value)}
              autoFocus
            />
            <VdfButton variant="primary" size="md" type="submit" disabled={discoverQuery.trim().length < 2}>
              Search
            </VdfButton>
          </form>

          {searching && <VdfLoader message="Searching schemes" />}

          {!searching && discoverActive && discoverSchemes.length === 0 && (
            <VdfEmptyState
              icon="🔍"
              title={`No results for "${discoverActive}"`}
              description="Try a different scheme name or AMC."
            />
          )}

          {discoverSchemes.length > 0 && (
            <>
              <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--color-muted)' }}>
                {discoverTotal.toLocaleString()} results for &ldquo;{discoverActive}&rdquo;
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {discoverSchemes.map(sc => (
                  <div
                    key={sc.scheme_code}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 16px',
                      background: 'var(--glass)', border: '1px solid var(--glass-border)',
                      borderRadius: 10,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {/* Name row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-fg)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sc.scheme_name}
                        </span>
                        {sc.is_bookmarked && <VdfStatusBadge label="In My NAV" variant="success" size="sm" />}
                        {!sc.active && <VdfStatusBadge label="Ended" variant="muted" size="sm" />}
                      </div>
                      {/* Meta row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', color: 'var(--color-muted)', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 600, color: 'var(--color-fg)' }}>{sc.scheme_code}</span>
                        <span style={{ opacity: 0.4 }}>·</span>
                        <span>{sc.amc}</span>
                        {sc.category && <><span style={{ opacity: 0.4 }}>·</span><span>{sc.category}</span></>}
                      </div>
                      {/* NAV row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.68rem', color: 'var(--color-muted)' }}>
                        {sc.nav
                          ? <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: 'var(--color-primary)' }}>₹{Number(sc.nav).toFixed(4)}</span>
                          : <span>No NAV data</span>}
                        {sc.nav_date && <><span style={{ opacity: 0.4 }}>·</span><span>{sc.nav_date}</span></>}
                      </div>
                    </div>

                    {/* Action */}
                    <div style={{ flexShrink: 0 }}>
                      {sc.is_bookmarked ? (
                        <VdfStatusBadge label="✓ In My NAV" variant="success" size="sm" />
                      ) : (
                        <VdfButton
                          variant="primary" size="sm"
                          onClick={() => addBookmark(sc)}
                          disabled={bookmarking === sc.scheme_code}
                        >
                          {bookmarking === sc.scheme_code ? 'Adding…' : '+ Add to My NAV'}
                        </VdfButton>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {discoverPages > 1 && (
                <div className={d.pagination}>
                  <button className={d.pageBtn} disabled={discoverPage <= 1} onClick={() => setDiscoverPage(1)}>First</button>
                  <button className={d.pageBtn} disabled={discoverPage <= 1} onClick={() => setDiscoverPage(p => p - 1)}>Prev</button>
                  <span className={d.pageInfo}>{discoverPage} / {discoverPages}</span>
                  <button className={d.pageBtn} disabled={discoverPage >= discoverPages} onClick={() => setDiscoverPage(p => p + 1)}>Next</button>
                  <button className={d.pageBtn} disabled={discoverPage >= discoverPages} onClick={() => setDiscoverPage(discoverPages)}>Last</button>
                </div>
              )}
            </>
          )}

          {!discoverActive && (
            <VdfEmptyState
              icon="🔭"
              title="Search for a scheme"
              description="Type a scheme name, AMC, or code above to browse 16,000+ mutual funds."
            />
          )}
        </div>
      )}
    </div>
  );
}
