'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { VdfStatCard, VdfStatusBadge, VdfInsightsCard, VdfEmptyState, type BadgeVariant, type Insight } from '@/components/vdf';
import d from '@/styles/data.module.css';
import s from './cruise-control.module.css';

/* ── Types ─────────────────────────────────────────── */

interface SchemeStatus {
  scheme_code: string;
  scheme_name: string;
  amc: string;
  category: string;
  daily_download_enabled: boolean;
  historical_download_done: boolean;
  active: boolean;
  closure_date: string | null;
  nav_records: number;
  latest_nav_date: string | null;
  earliest_nav_date: string | null;
  latest_nav: number | null;
  metrics_calculated_count: number;
  metrics_pending_count: number;
}

interface NavStatus {
  schemes: SchemeStatus[];
  stats: {
    total: number;
    with_data: number;
    without_data: number;
    metrics_calculated: number;
    ended_schemes: number;
  };
  last_execution: {
    status: string;
    started_at: string;
    execution_duration_ms: number;
    result_summary: Record<string, any>;
  } | null;
}

type Tab = 'nav' | 'market' | 'snapshots' | 'settings';

/* ── Helpers ───────────────────────────────────────── */

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/* ── Main Component ────────────────────────────────── */

export default function CruiseControlPage() {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<Tab>('nav');
  const [navStatus, setNavStatus] = useState<NavStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [fillingGaps, setFillingGaps] = useState(false);
  const [calculatingAll, setCalculatingAll] = useState(false);
  const [calculatingScheme, setCalculatingScheme] = useState<string | null>(null);
  const [downloadingScheme, setDownloadingScheme] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch NAV status
  const fetchStatus = useCallback(async () => {
    try {
      const data = await apiFetch<NavStatus>(API.nav.status);
      setNavStatus(data);
    } catch {
      // Failed to load
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Download daily NAV for all
  async function handleDownloadAll() {
    if (downloading) return;
    setDownloading(true);
    try {
      const result = await apiFetch<any>(API.nav.downloadDaily);
      showToast({
        message: `Downloaded: ${result.downloaded} schemes, ${result.skipped} skipped${result.failed ? `, ${result.failed} failed` : ''} (${(result.duration_ms / 1000).toFixed(1)}s)`,
        type: result.failed > 0 ? 'warning' : 'success',
      });
      fetchStatus();
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Download failed', type: 'error' });
    } finally {
      setDownloading(false);
    }
  }

  // Download historical for one scheme
  async function handleDownloadScheme(schemeCode: string) {
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
      fetchStatus();
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Download failed', type: 'error' });
    } finally {
      setDownloadingScheme(null);
    }
  }

  // Download ALL full history (sequential)
  async function handleDownloadAllFull() {
    if (downloadingAll) return; setDownloadingAll(true);
    try {
      const r = await apiFetch<any>(API.nav.downloadAll);
      showToast({ message: `Full history: ${r.downloaded} downloaded, ${r.skipped} skipped, ${r.failed} failed`, type: r.failed > 0 ? 'warning' : 'success' });
      fetchStatus();
    } catch (err) { showToast({ message: (err as ApiError).message || 'Failed', type: 'error' }); }
    finally { setDownloadingAll(false); }
  }

  // Fill ALL gaps
  async function handleFillAllGaps() {
    if (fillingGaps) return; setFillingGaps(true);
    try {
      const r = await apiFetch<any>(API.nav.downloadGapAll);
      showToast({ message: `Gaps filled: ${r.schemes_with_gaps} schemes, ${r.records_filled} records`, type: 'success' });
      fetchStatus();
    } catch (err) { showToast({ message: (err as ApiError).message || 'Failed', type: 'error' }); }
    finally { setFillingGaps(false); }
  }

  // Calculate ALL metrics
  async function handleCalculateAll() {
    if (calculatingAll) return; setCalculatingAll(true);
    try {
      const r = await apiFetch<any>(API.nav.calculateMetricsBulk);
      showToast({ message: `Metrics: ${r.total_schemes} schemes, ${r.total_records_updated} records (${(r.execution_ms / 1000).toFixed(1)}s)`, type: 'success' });
      fetchStatus();
    } catch (err) { showToast({ message: (err as ApiError).message || 'Failed', type: 'error' }); }
    finally { setCalculatingAll(false); }
  }

  // Calculate metrics for single scheme
  async function handleCalculateScheme(code: string) {
    if (calculatingScheme) return; setCalculatingScheme(code);
    try {
      const r = await apiFetch<any>({ ...API.nav.calculateMetrics, path: API.nav.calculateMetrics.path.replace(':code', code) });
      showToast({ message: r.status === 'already_fresh' ? `${code}: up to date` : `${code}: ${r.records_updated} records (${r.execution_ms}ms)`, type: 'success' });
      fetchStatus();
    } catch (err) { showToast({ message: (err as ApiError).message || 'Failed', type: 'error' }); }
    finally { setCalculatingScheme(null); }
  }

  // Filter schemes by search
  const filteredSchemes = navStatus?.schemes?.filter((sc) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return sc.scheme_name.toLowerCase().includes(q) ||
           sc.scheme_code.toLowerCase().includes(q) ||
           sc.amc.toLowerCase().includes(q);
  }) || [];

  // VaNi insights
  function getInsights(): { icon: string; text: string }[] {
    if (!navStatus) return [];
    const { stats, last_execution } = navStatus;
    const insights: { icon: string; text: string }[] = [];

    if (stats.total === 0) {
      insights.push({ icon: '\u{1F516}', text: 'No schemes bookmarked yet. Search and bookmark schemes to start tracking NAV data.' });
      return insights;
    }

    if (stats.without_data > 0) {
      insights.push({ icon: '\u26A0\uFE0F', text: `${stats.without_data} bookmarked scheme${stats.without_data > 1 ? 's' : ''} have no NAV data. Click "Run Now" or download individually.` });
    }

    if (stats.with_data > 0 && stats.metrics_calculated < stats.with_data) {
      const pending = stats.with_data - stats.metrics_calculated;
      insights.push({ icon: '\u{1F4CA}', text: `${pending} scheme${pending > 1 ? 's' : ''} need metrics calculation (returns, volatility, Sharpe ratio).` });
    }

    if (stats.ended_schemes > 0) {
      insights.push({ icon: '\u{1F6D1}', text: `${stats.ended_schemes} ended scheme${stats.ended_schemes > 1 ? 's' : ''} \u2014 daily downloads auto-disabled. Historical data still available.` });
    }

    if (last_execution) {
      const summary = last_execution.result_summary || {};
      insights.push({
        icon: '\u26A1',
        text: `Last run: ${timeAgo(last_execution.started_at)} \u2014 ${summary.downloaded || 0} downloaded, ${summary.skipped || 0} skipped (${((last_execution.execution_duration_ms || 0) / 1000).toFixed(1)}s)`,
      });
    }

    if (stats.total > 0 && stats.without_data === 0 && stats.metrics_calculated === stats.with_data) {
      insights.push({ icon: '\u2705', text: 'All schemes have NAV data and metrics are up to date. System is healthy.' });
    }

    return insights;
  }

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'nav', label: 'NAV Downloads', icon: '\u{1F4C8}' },
    { id: 'market', label: 'Market Data', icon: '\u{1F4CA}' },
    { id: 'snapshots', label: 'Snapshots', icon: '\u{1F4F8}' },
    { id: 'settings', label: 'Settings', icon: '\u2699\uFE0F' },
  ];

  /* ── Render ──────────────────────────────────────── */

  return (
    <div className={s.page}>
      {/* Header */}
      <div className={s.header}>
        <div>
          <h1 className={s.title}>Cruise Control</h1>
          <p className={s.subtitle}>Operational control center for automated data operations</p>
        </div>
      </div>

      {/* Tabs */}
      <div className={s.tabs}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`${s.tab} ${activeTab === tab.id ? s.tabActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ═══ NAV DOWNLOADS TAB ═══ */}
      {activeTab === 'nav' && (
        <div className={s.tabContent}>
          {/* Stats row */}
          {navStatus && (
            <div className={s.statsRow}>
              <VdfStatCard value={navStatus.stats.total} label="Bookmarked" />
              <VdfStatCard value={navStatus.stats.with_data} label="With NAV Data" accent="success" />
              <VdfStatCard value={navStatus.stats.without_data} label="Without Data" accent={navStatus.stats.without_data > 0 ? 'danger' : 'default'} />
              <VdfStatCard value={navStatus.stats.metrics_calculated} label="Metrics Done" />
              <VdfStatCard value={navStatus.stats.ended_schemes} label="Ended" />
            </div>
          )}

          {/* VaNi Insights */}
          <VdfInsightsCard title="VaNi Analysis" insights={getInsights()} />

          {/* Controls */}
          <div className={s.controlBar}>
            <input
              className={s.searchInput}
              type="text"
              placeholder="Search schemes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className={s.controlActions}>
              <button className={s.refreshBtn} onClick={fetchStatus} title="Refresh">{'\u21BB'}</button>
              <button className={s.runBtn} onClick={handleDownloadAll} disabled={downloading || !navStatus || navStatus.stats.total === 0}>
                {downloading ? 'Downloading...' : '\u25B6 Daily NAV'}
              </button>
              <button className={s.refreshBtn} onClick={handleDownloadAllFull} disabled={downloadingAll || !navStatus || navStatus.stats.total === 0}>
                {downloadingAll ? '...' : '\u2B07 Full History'}
              </button>
              <button className={s.refreshBtn} onClick={handleFillAllGaps} disabled={fillingGaps || !navStatus}>
                {fillingGaps ? '...' : '\u{1F527} Fill Gaps'}
              </button>
              <button className={s.refreshBtn} onClick={handleCalculateAll} disabled={calculatingAll || !navStatus}>
                {calculatingAll ? '...' : '\u{1F9EE} Metrics'}
              </button>
            </div>
          </div>

          {/* Schemes table */}
          {loading ? (
            <div className={s.tableEmpty}>Loading NAV status...</div>
          ) : filteredSchemes.length === 0 ? (
            <div className={s.tableEmpty}>
              {navStatus?.stats.total === 0
                ? 'No schemes bookmarked. Go to Market to search and bookmark schemes.'
                : 'No schemes match your search.'}
            </div>
          ) : (
            <div className={d.tableWrap}>
              <table className={d.table}>
                <thead>
                  <tr>
                    <th>Scheme</th>
                    <th>AMC</th>
                    <th>NAV Records</th>
                    <th>Latest NAV</th>
                    <th>Latest Date</th>
                    <th>Daily</th>
                    <th>Metrics</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSchemes.map((sc) => {
                    const hasData = sc.nav_records > 0;
                    const isEnded = !sc.active;
                    const metricsStatus = sc.nav_records === 0 ? 'none'
                      : sc.metrics_pending_count === 0 ? 'done'
                      : sc.metrics_calculated_count > 0 ? 'partial'
                      : 'pending';

                    return (
                      <tr key={sc.scheme_code} className={`${s.tableRow} ${isEnded ? s.rowEnded : ''}`}>
                        <td>
                          <div className={s.schemeName}>{sc.scheme_name.slice(0, 50)}</div>
                          <div className={s.schemeCode}>{sc.scheme_code}</div>
                        </td>
                        <td className={s.tdAmc}>{sc.amc.slice(0, 25)}</td>
                        <td className={s.tdMono}>{sc.nav_records.toLocaleString()}</td>
                        <td className={s.tdMono}>
                          {sc.latest_nav ? `\u20B9${Number(sc.latest_nav).toFixed(2)}` : '\u2014'}
                        </td>
                        <td className={s.tdDate}>{sc.latest_nav_date || '\u2014'}</td>
                        <td>
                          <VdfStatusBadge label={sc.daily_download_enabled ? 'On' : isEnded ? 'Ended' : 'Off'} variant={sc.daily_download_enabled ? 'success' : 'muted'} size="sm" />
                        </td>
                        <td>
                          <VdfStatusBadge
                            label={metricsStatus === 'done' ? '\u2713 Done' : metricsStatus === 'partial' ? 'Partial' : metricsStatus === 'pending' ? 'Pending' : '\u2014'}
                            variant={metricsStatus === 'done' ? 'success' : metricsStatus === 'partial' ? 'warning' : metricsStatus === 'pending' ? 'info' : 'muted'}
                            size="sm" />
                        </td>
                        <td style={{ display: 'flex', gap: 4 }}>
                          {!hasData && (
                            <button className={s.dlBtn} onClick={() => handleDownloadScheme(sc.scheme_code)} disabled={downloadingScheme === sc.scheme_code}>
                              {downloadingScheme === sc.scheme_code ? '...' : '\u2B07'}
                            </button>
                          )}
                          {hasData && metricsStatus !== 'done' && (
                            <button className={s.dlBtn} onClick={() => handleCalculateScheme(sc.scheme_code)} disabled={calculatingScheme === sc.scheme_code}>
                              {calculatingScheme === sc.scheme_code ? '...' : '\u{1F9EE}'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ OTHER TABS (placeholder) ═══ */}
      {activeTab === 'market' && (
        <div className={s.tabContent}>
          <div className={s.placeholder}>
            <div className={s.placeholderIcon}>{'\u{1F4CA}'}</div>
            <h3>Market Data Downloads</h3>
            <p>Nifty, Sensex, and sectoral indices tracking. Coming soon.</p>
          </div>
        </div>
      )}

      {activeTab === 'snapshots' && (
        <div className={s.tabContent}>
          <div className={s.placeholder}>
            <div className={s.placeholderIcon}>{'\u{1F4F8}'}</div>
            <h3>Portfolio Snapshots</h3>
            <p>Monthly point-in-time portfolio state capture. Coming soon.</p>
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className={s.tabContent}>
          <div className={s.placeholder}>
            <div className={s.placeholderIcon}>{'\u2699\uFE0F'}</div>
            <h3>Scheduler & Settings</h3>
            <p>Configure automated jobs, schedules, and data cleanup. Coming soon.</p>
          </div>
        </div>
      )}
    </div>
  );
}
