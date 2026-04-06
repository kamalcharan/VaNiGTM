'use client';

/**
 * Global NAV Explorer — ALL 16K+ schemes.
 *
 * No tenant filter — global scheme reference.
 * VdfTrackingCard reused identically from My NAV:
 *   Dashboard | Update/Download NAV | Calc Metrics | Aliases
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
import { useAuth } from '@/context/auth-provider';
import {
  VdfStatCard, VdfLoader, VdfEmptyState, VdfButton, VdfModal, VdfStatusBadge,
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

/** Map SchemeRow → TrackingBookmark so VdfTrackingCard renders identically to My NAV */
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
  const { isAdmin } = useAuth();

  /* ── Scheme list state ── */
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
  const [calcLoading, setCalcLoading] = useState<string | null>(null);
  const [downloadModal, setDownloadModal] = useState<SchemeRow | null>(null);

  /* ── Alias modal state — identical to My NAV ── */
  const [aliasModal, setAliasModal] = useState<{
    scheme_code: string; scheme_name: string; display_alias: string | null;
  } | null>(null);
  const [aliases, setAliases] = useState<{ id: number; alias_name: string; source: string }[]>([]);
  const [aliasesLoading, setAliasesLoading] = useState(false);
  const [newAlias, setNewAlias] = useState('');
  const [addingAlias, setAddingAlias] = useState(false);
  const [displayAliasEdit, setDisplayAliasEdit] = useState('');
  const [savingDisplayAlias, setSavingDisplayAlias] = useState(false);

  /* ── Global bulk job state ── */
  interface BulkJob {
    id: string;
    type: 'download' | 'redownload' | 'metrics' | 'recalc';
    status: 'running' | 'done' | 'failed';
    total: number;
    done: number;
    failed: number;
    pct: number;
    current_scheme: string | null;
    elapsed_ms: number;
    error?: string;
  }
  const [bulkJob, setBulkJob] = useState<BulkJob | null>(null);
  const [bulkJobStarting, setBulkJobStarting] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const JOB_LABELS: Record<string, string> = {
    download:   'Downloading NAV — all schemes with no data',
    redownload: 'Redownloading NAV — clean + full refetch',
    metrics:    'Calculating Metrics — all stale/missing',
    recalc:     'Recalculating Metrics — full clean slate',
  };

  function stopPoll() {
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
  }

  async function pollJob(jobId: string) {
    try {
      const data = await apiFetch<BulkJob>({
        ...API.nav.globalJobStatus,
        path: API.nav.globalJobStatus.path.replace(':jobId', jobId),
      });
      setBulkJob(data);
      if (data.status === 'running') {
        pollRef.current = setTimeout(() => pollJob(jobId), 2500);
      } else {
        stopPoll();
        if (data.status === 'done') {
          showToast({ message: `Job complete — ${data.done} done, ${data.failed} failed`, type: data.failed > 0 ? 'warning' : 'success' });
          // Refresh stat cards and current scheme list so counts reflect the completed job
          apiFetch<{ data: SchemeStats }>(API.skills.execute, {
            pathParams: { skill: 'market-skill', fn: 'get_scheme_stats' },
            body: { params: {} },
          }).then(r => setStats(r.data)).catch(() => {});
          loadSchemes(search, filterStatus, page);
        } else {
          showToast({ message: `Job failed: ${data.error || 'Unknown error'}`, type: 'error' });
        }
      }
    } catch {
      stopPoll();
      showToast({ message: 'Lost contact with job', type: 'error' });
    }
  }

  async function startBulkJob(type: 'download' | 'redownload' | 'metrics' | 'recalc') {
    if (bulkJobStarting || bulkJob?.status === 'running') return;
    setBulkJobStarting(type);
    stopPoll();
    setBulkJob(null);
    try {
      const apiKey = {
        download:   API.nav.globalJobDownload,
        redownload: API.nav.globalJobRedownload,
        metrics:    API.nav.globalJobMetrics,
        recalc:     API.nav.globalJobRecalc,
      }[type];
      const r = await apiFetch<{ job_id: string }>(apiKey);
      // Seed initial state so modal opens immediately
      setBulkJob({ id: r.job_id, type, status: 'running', total: 0, done: 0, failed: 0, pct: 0, current_scheme: null, elapsed_ms: 0 });
      pollRef.current = setTimeout(() => pollJob(r.job_id), 2500);
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Failed to start job', type: 'error' });
    } finally {
      setBulkJobStarting(null);
    }
  }

  // Cleanup poll on unmount
  useEffect(() => () => stopPoll(), []);

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

  /* ── Calc metrics — identical to My NAV ── */
  async function calcMetrics(code: string) {
    if (calcLoading) return;
    setCalcLoading(code);
    try {
      const r = await apiFetch<any>({ ...API.nav.calculateMetrics, path: API.nav.calculateMetrics.path.replace(':code', code) });
      showToast({ message: r.status === 'already_fresh' ? 'Metrics up to date' : `${r.records_updated || 0} records updated`, type: 'success' });
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Metrics calculation failed', type: 'error' });
    } finally {
      setCalcLoading(null);
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

  /* ── Alias modal — identical to My NAV ── */
  async function openAliasModal(row: SchemeRow) {
    setAliasModal({ scheme_code: row.scheme_code, scheme_name: row.scheme_name, display_alias: null });
    setDisplayAliasEdit('');
    setNewAlias('');
    setAliases([]);
    setAliasesLoading(true);
    try {
      const data = await apiFetch<{ aliases: any[] }>({
        ...API.nav.aliases,
        path: `${API.nav.aliases.path}?scheme_code=${row.scheme_code}`,
      });
      setAliases(data.aliases || []);
    } catch {
      showToast({ message: 'Failed to load aliases', type: 'error' });
    } finally {
      setAliasesLoading(false);
    }
  }

  async function handleAddAlias() {
    if (!aliasModal || !newAlias.trim() || addingAlias) return;
    setAddingAlias(true);
    try {
      const data = await apiFetch<{ alias: any }>(API.nav.createAlias, {
        body: { scheme_code: aliasModal.scheme_code, alias_name: newAlias.trim(), source: 'manual' },
      });
      setAliases(prev => [...prev, data.alias]);
      setNewAlias('');
      showToast({ message: 'Alias added', type: 'success' });
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Failed to add alias', type: 'error' });
    } finally {
      setAddingAlias(false);
    }
  }

  async function handleDeleteAlias(id: number) {
    try {
      await apiFetch<any>({ ...API.nav.deleteAlias, path: API.nav.deleteAlias.path.replace(':id', String(id)) });
      setAliases(prev => prev.filter(a => a.id !== id));
      showToast({ message: 'Alias removed', type: 'success' });
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Failed to remove alias', type: 'error' });
    }
  }

  async function handleSaveDisplayAlias() {
    if (!aliasModal || savingDisplayAlias) return;
    setSavingDisplayAlias(true);
    try {
      await apiFetch<any>(
        { ...API.nav.updateBookmarkAlias, path: API.nav.updateBookmarkAlias.path.replace(':schemeCode', aliasModal.scheme_code) },
        { body: { alias_name: displayAliasEdit.trim() || null } },
      );
      setAliasModal(prev => prev ? { ...prev, display_alias: displayAliasEdit.trim() || null } : null);
      showToast({ message: 'Display alias updated', type: 'success' });
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Failed to update alias', type: 'error' });
    } finally {
      setSavingDisplayAlias(false);
    }
  }

  /* ── Filter card click — resets page ── */
  function handleFilterClick(status: FilterStatus) {
    setFilterStatus(status);
    setPage(1);
  }

  /* ── Card actions — 100% identical to My NAV ── */
  function cardActions(row: SchemeRow): TrackingCardAction[] {
    const calcBusy = calcLoading === row.scheme_code;
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
        label: 'Calc Metrics',
        onClick: () => calcMetrics(row.scheme_code),
        variant: 'muted',
        disabled: calcBusy || row.nav_records === 0,
        loading: calcBusy,
      },
      {
        label: 'Aliases',
        onClick: () => openAliasModal(row),
        variant: 'muted',
      },
    ];
  }

  /* ── Render ── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '24px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className={d.pageTitle}>Global NAV</h1>
          <p className={d.pageSubtitle}>All mutual fund schemes · search, download NAV, manage aliases</p>
        </div>

        {/* Bulk Operations */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginRight: 4 }}>
            Bulk Ops
          </span>
          <VdfButton
            variant="outline" size="sm"
            onClick={() => startBulkJob('download')}
            disabled={!!bulkJobStarting || bulkJob?.status === 'running'}
            loading={bulkJobStarting === 'download'}
          >
            Download All
          </VdfButton>
          <VdfButton
            variant="outline" size="sm"
            onClick={() => startBulkJob('redownload')}
            disabled={!!bulkJobStarting || bulkJob?.status === 'running'}
            loading={bulkJobStarting === 'redownload'}
          >
            Redownload All
          </VdfButton>
          <VdfButton
            variant="outline" size="sm"
            onClick={() => startBulkJob('metrics')}
            disabled={!!bulkJobStarting || bulkJob?.status === 'running'}
            loading={bulkJobStarting === 'metrics'}
          >
            Calc All Metrics
          </VdfButton>
          <VdfButton
            variant="outline" size="sm"
            onClick={() => startBulkJob('recalc')}
            disabled={!!bulkJobStarting || bulkJob?.status === 'running'}
            loading={bulkJobStarting === 'recalc'}
          >
            Recalculate All
          </VdfButton>
        </div>
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
          label="No NAV Data"
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
        <VdfStatCard
          value={statsLoading ? '…' : (stats?.metrics_calculated ?? 0)}
          label="Metrics Done"
          accent="info"
        />
        <VdfStatCard
          value={statsLoading ? '…' : (stats?.metrics_pending ?? 0)}
          label="Metrics Pending"
          accent="warning"
        />
        {stats && stats.with_nav_data > 0 && (
          <VdfStatCard
            value={statsLoading ? '…' : `${Math.round((stats.metrics_calculated / stats.with_nav_data) * 100)}%`}
            label="Metrics Coverage"
            accent="success"
          />
        )}
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

      {/* Scheme list — VdfTrackingCard, same component as My NAV */}
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

      {/* Bulk Job Progress Modal */}
      <VdfModal
        isOpen={!!bulkJob}
        onClose={() => { if (bulkJob?.status !== 'running') { stopPoll(); setBulkJob(null); } }}
        title={bulkJob ? JOB_LABELS[bulkJob.type] : ''}
        subtitle={bulkJob?.status === 'running' ? 'Running in background — safe to navigate away' : bulkJob?.status === 'done' ? 'Completed' : 'Failed'}
      >
        {bulkJob && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Progress bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                <span>{bulkJob.done} of {bulkJob.total || '?'} schemes</span>
                <span>{bulkJob.pct}%</span>
              </div>
              <div style={{ height: 8, background: 'var(--color-surface)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${bulkJob.pct}%`,
                  background: bulkJob.status === 'failed' ? 'var(--color-danger)' : bulkJob.status === 'done' ? 'var(--color-success)' : 'var(--color-primary)',
                  borderRadius: 4,
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                { label: 'Done', value: bulkJob.done, color: 'var(--color-success)' },
                { label: 'Failed', value: bulkJob.failed, color: bulkJob.failed > 0 ? 'var(--color-danger)' : 'var(--color-muted)' },
                { label: 'Elapsed', value: `${Math.round(bulkJob.elapsed_ms / 1000)}s`, color: 'var(--color-fg)' },
              ].map(s => (
                <div key={s.label} style={{ padding: '10px 14px', background: 'var(--color-surface)', borderRadius: 8, border: '1px solid var(--color-border)', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: s.color, fontFamily: 'var(--font-mono, monospace)' }}>{s.value}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 3 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Current scheme */}
            {bulkJob.current_scheme && (
              <div style={{ padding: '8px 12px', background: 'var(--glass)', border: '1px solid var(--glass-border)', borderRadius: 6, fontSize: '0.78rem', color: 'var(--color-muted)' }}>
                <span style={{ color: 'var(--color-primary)', marginRight: 6 }}>▶</span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--color-fg)' }}>{bulkJob.current_scheme}</span>
              </div>
            )}

            {/* Error */}
            {bulkJob.error && (
              <div style={{ padding: '8px 12px', background: 'rgba(var(--color-danger-rgb, 239,68,68), 0.08)', border: '1px solid var(--color-danger)', borderRadius: 6, fontSize: '0.78rem', color: 'var(--color-danger)' }}>
                {bulkJob.error}
              </div>
            )}

            {/* Status message */}
            <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', textAlign: 'center' }}>
              {bulkJob.status === 'running' && 'Processing sequentially to avoid API rate limits…'}
              {bulkJob.status === 'done' && `All done — ${bulkJob.failed > 0 ? `${bulkJob.failed} failed (network/data errors)` : 'no errors'}`}
              {bulkJob.status === 'failed' && 'Job stopped due to an unexpected error'}
            </div>

            {bulkJob.status !== 'running' && (
              <VdfButton variant="primary" size="sm" onClick={() => { stopPoll(); setBulkJob(null); }}>
                Close
              </VdfButton>
            )}
          </div>
        )}
      </VdfModal>

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

      {/* Alias Management Modal — identical to My NAV */}
      <VdfModal
        isOpen={!!aliasModal}
        onClose={() => setAliasModal(null)}
        title="Scheme Aliases"
        subtitle={aliasModal ? `${aliasModal.scheme_name} · used for CSV/CAS import matching` : ''}
      >
        {aliasModal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Display alias */}
            <div>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 6 }}>
                Display Alias
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginBottom: 10 }}>
                Shown on cards instead of the scheme name. Personal to your account.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className={f.input}
                  style={{ flex: 1 }}
                  placeholder={aliasModal.scheme_name}
                  value={displayAliasEdit}
                  onChange={e => setDisplayAliasEdit(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveDisplayAlias(); }}
                />
                <VdfButton variant="primary" size="sm" onClick={handleSaveDisplayAlias} disabled={savingDisplayAlias}>
                  {savingDisplayAlias ? '…' : 'Save'}
                </VdfButton>
                {displayAliasEdit && (
                  <VdfButton variant="ghost" size="sm" onClick={() => setDisplayAliasEdit('')}>Clear</VdfButton>
                )}
              </div>
            </div>

            <div style={{ height: 1, background: 'var(--color-border)' }} />

            {/* Import aliases */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>
                  Import Aliases
                </div>
                {aliases.length > 0 && <span style={{ fontSize: '0.65rem', color: 'var(--color-muted)' }}>{aliases.length} total</span>}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginBottom: 10 }}>
                Global aliases used to match this scheme during CAS / CSV imports.
              </div>

              {aliasesLoading ? (
                <div style={{ padding: '12px 0', textAlign: 'center', color: 'var(--color-muted)', fontSize: '0.8rem' }}>Loading…</div>
              ) : aliases.length === 0 ? (
                <div style={{ padding: '12px 0', textAlign: 'center', color: 'var(--color-muted)', fontSize: '0.8rem' }}>No aliases yet — add one below</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 210, overflowY: 'auto', marginBottom: 12 }}>
                  {aliases.map(alias => (
                    <div key={alias.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--color-surface)', borderRadius: 6, border: '1px solid var(--color-border)' }}>
                      <span style={{ flex: 1, fontSize: '0.8rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{alias.alias_name}</span>
                      <VdfStatusBadge
                        label={alias.source}
                        variant={['csv_upload', 'import'].includes(alias.source) ? 'success' : alias.source === 'manual' ? 'info' : 'muted'}
                        size="sm"
                      />
                      {isAdmin && (
                        <button
                          onClick={() => handleDeleteAlias(alias.id)}
                          title="Delete alias"
                          style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', fontSize: '0.85rem', padding: '2px 4px', borderRadius: 4, lineHeight: 1 }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className={f.input}
                  style={{ flex: 1 }}
                  placeholder="New alias (e.g. HDFC Top 100 Growth)"
                  value={newAlias}
                  onChange={e => setNewAlias(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddAlias(); }}
                />
                <VdfButton variant="success" size="sm" onClick={handleAddAlias} disabled={!newAlias.trim() || addingAlias}>
                  {addingAlias ? '…' : '+ Add'}
                </VdfButton>
              </div>
            </div>

          </div>
        )}
      </VdfModal>

    </div>
  );
}
