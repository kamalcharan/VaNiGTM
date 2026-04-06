'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { useSkillQuery } from '@/hooks';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { VdfLineChart, VdfLoader, VdfEmptyState, VdfButton } from '@/components/vdf';
import type { ChartType } from '@/components/vdf/line-chart/VdfLineChart';
import d from '@/styles/data.module.css';
import s from './scheme-dashboard.module.css';

/* ── Types ─────────────────────────────────────────── */

interface SchemeDetail {
  scheme: {
    scheme_code: string; scheme_name: string; amc: string; category: string;
    scheme_type: string; active: boolean; launch_date: string | null;
    closure_date: string | null; isin_growth: string | null;
    isin_dividend: string | null; nav_name: string | null; min_amount: number | null;
  };
  nav: { total_records: number; earliest_date: string | null; latest_date: string | null; latest_nav: number | null; latest_nav_date: string | null; };
  metrics: {
    daily_return: number | null; return_1w: number | null; return_1m: number | null;
    return_3m: number | null; return_6m: number | null; return_1y: number | null;
    return_ytd: number | null; return_all: number | null;
    sd_7d: number | null; sd_14d: number | null; sd_21d: number | null;
    sd_42d: number | null; sd_3m: number | null; sd_6m: number | null;
    sharpe_ratio: number | null; max_drawdown: number | null; cagr: number | null;
    metrics_calculated_at: string | null; metrics_date: string | null;
  } | null;
  gaps: { gap_after: string; gap_before: string; gap_days: number }[];
  bookmark: { id: number; daily_download_enabled: boolean } | null;
}

interface NavHistoryData { data: { date: string; nav: number }[]; }

type Period = '1w' | '1m' | '6m' | 'ytd' | '1y' | '3y' | '5y' | 'max' | 'custom';
type Granularity = 'daily' | 'weekly' | 'monthly';
type ViewMode = 'chart' | 'table';
type DataMode = 'price' | 'returns';

const PERIOD_DAYS: Record<Period, number | null> = {
  '1w': 7, '1m': 30, '6m': 180, 'ytd': null, '1y': 365, '3y': 1095, '5y': 1825, 'max': null, 'custom': null,
};
const PERIOD_LABELS: Record<Period, string> = {
  '1w': '1W', '1m': '1M', '6m': '6M', 'ytd': 'YTD', '1y': '1Y', '3y': '3Y', '5y': '5Y', 'max': 'Max', 'custom': 'Custom',
};

const CHART_COLOR_PRESETS = [
  '#6366f1', '#22c55e', '#ef4444', '#f59e0b',
  '#06b6d4', '#8b5cf6', '#ec4899', '#0ea5e9',
];

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtPct(v: number | null): string {
  return v == null ? '\u2014' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}
function fmtNav(v: number): string {
  return `\u20B9${v.toFixed(4)}`;
}
function fmtChange(v: number): string {
  return `${v >= 0 ? '+' : ''}\u20B9${Math.abs(v).toFixed(2)}`;
}

/** Client-side aggregation — weekly takes the last NAV of each Mon-Sun week, monthly takes last of each calendar month */
function aggregateData(data: { date: string; nav: number }[], gran: Granularity) {
  if (gran === 'daily' || data.length === 0) return data;
  const buckets = new Map<string, { date: string; nav: number }>();
  for (const pt of data) {
    let key: string;
    if (gran === 'monthly') {
      key = pt.date.slice(0, 7); // YYYY-MM
    } else {
      const d = new Date(pt.date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d); monday.setDate(diff);
      key = monday.toISOString().split('T')[0];
    }
    buckets.set(key, pt); // last point in bucket wins
  }
  return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/* ── Component ─────────────────────────────────────── */

export default function SchemeDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const code = params.code as string;

  // Core data
  const [detail, setDetail] = useState<SchemeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  // Chart controls
  const [period, setPeriod] = useState<Period>('1y');
  const [granularity, setGranularity] = useState<Granularity>('daily');
  const [viewMode, setViewMode] = useState<ViewMode>('chart');
  const [dataMode, setDataMode] = useState<DataMode>('price');
  const [chartType, setChartType] = useState<ChartType>('line');
  const [chartCustomFrom, setChartCustomFrom] = useState('');
  const [chartCustomTo, setChartCustomTo] = useState('');
  const [chartColor, setChartColor] = useState(''); // '' = auto
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [pendingColor, setPendingColor] = useState('');
  const colorPickerRef = useRef<HTMLDivElement>(null);

  // Table
  const [tablePage, setTablePage] = useState(1);
  const PAGE_SIZE = 50;

  // Chart fullscreen
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Actions
  const [downloading, setDownloading] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [exportingPng, setExportingPng] = useState(false);

  const fetchDetail = useCallback(async () => {
    setFetchError(false);
    try {
      const data = await apiFetch<SchemeDetail>({ ...API.nav.schemeDetail, path: API.nav.schemeDetail.path.replace(':code', code) });
      setDetail(data);
    } catch (err) {
      setFetchError(true);
      showToast({ message: (err as ApiError).message || 'Failed to load scheme data', type: 'error' });
    } finally { setLoading(false); }
  }, [code, showToast]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  // ── Period → API date range ──────────────────────────
  const { dateFrom, dateTo } = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    if (period === 'ytd') {
      return { dateFrom: `${new Date().getFullYear()}-01-01`, dateTo: today };
    }
    if (period === 'custom') {
      return { dateFrom: chartCustomFrom || '2000-01-01', dateTo: chartCustomTo || today };
    }
    const days = PERIOD_DAYS[period];
    return { dateFrom: days === null ? '2000-01-01' : new Date(Date.now() - days * 86400000).toISOString().split('T')[0], dateTo: today };
  }, [period, chartCustomFrom, chartCustomTo]);

  const { data: navHistory } = useSkillQuery<NavHistoryData>(
    'market-skill', 'get_nav_history',
    { scheme_code: code, from_date: dateFrom, to_date: dateTo },
    { enabled: !!code && (period !== 'custom' || !!chartCustomFrom) },
  );
  const rawNavData = navHistory?.data?.data || [];

  // ── Client-side aggregation ───────────────────────────
  const displayData = useMemo(() => aggregateData(rawNavData, granularity), [rawNavData, granularity]);

  // ── Returns mode: transform NAV → % return from period start ─
  const chartData = useMemo(() => {
    if (dataMode === 'price' || displayData.length < 2) return displayData;
    const first = displayData[0].nav;
    if (first === 0) return displayData;
    return displayData.map(p => ({ date: p.date, nav: ((p.nav - first) / first) * 100 }));
  }, [displayData, dataMode]);

  // ── Period stats strip ────────────────────────────────
  const periodStats = useMemo(() => {
    const src = chartData;
    if (src.length < 2) return null;
    const navs = src.map(p => p.nav);
    const current = navs[navs.length - 1];
    const first = navs[0];
    const min = Math.min(...navs);
    const max = Math.max(...navs);
    const change = current - first;
    const changePct = first > 0 ? (change / first) * 100 : 0;
    return { current, min, max, change, changePct };
  }, [chartData]);

  // ── Table (newest first, inside chart panel) ──────────
  const tableData = useMemo(() => [...rawNavData].reverse(), [rawNavData]);
  const totalTablePages = Math.ceil(tableData.length / PAGE_SIZE);
  const pagedData = tableData.slice((tablePage - 1) * PAGE_SIZE, tablePage * PAGE_SIZE);
  useEffect(() => { setTablePage(1); }, [period, viewMode, dataMode]);

  // Auto-switch chart type when data mode changes (bar only valid in returns, area only in price)
  useEffect(() => {
    if (dataMode === 'returns' && chartType === 'area') setChartType('line');
    if (dataMode === 'price'   && chartType === 'bar')  setChartType('line');
  }, [dataMode, chartType]);

  // ── Close color picker on outside click ───────────────
  useEffect(() => {
    if (!colorPickerOpen) return;
    function onOutside(e: MouseEvent) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setColorPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [colorPickerOpen]);

  // ── Actions ───────────────────────────────────────────
  async function handleDownload(range: 'all' | '1y' | '6m' | '3m' | 'custom') {
    if (downloading) return;
    setDownloading(range);
    try {
      const body: Record<string, string> = {};
      if (range !== 'all') {
        const to = new Date().toISOString().split('T')[0];
        if (range === 'custom') {
          if (!customFrom) return;
          body.date_from = customFrom;
          body.date_to = customTo || to;
        } else {
          const from = new Date();
          if (range === '1y') from.setFullYear(from.getFullYear() - 1);
          else if (range === '6m') from.setMonth(from.getMonth() - 6);
          else if (range === '3m') from.setMonth(from.getMonth() - 3);
          body.date_from = from.toISOString().split('T')[0];
          body.date_to = to;
        }
      }
      const r = await apiFetch<any>(
        { ...API.nav.downloadScheme, path: API.nav.downloadScheme.path.replace(':code', code) },
        { body },
      );
      showToast({ message: `${r.records} records downloaded`, type: 'success' });
      fetchDetail();
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Download failed', type: 'error' });
    } finally {
      setDownloading(null);
    }
  }

  async function handleRepairGaps() {
    if (downloading) return;
    setDownloading('gap');
    try {
      const r = await apiFetch<any>({ ...API.nav.downloadGap, path: API.nav.downloadGap.path.replace(':code', code) });
      showToast({ message: r.status === 'no_gaps' ? 'No gaps found' : `${r.records_filled} missing records restored`, type: 'success' });
      fetchDetail();
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Repair failed', type: 'error' });
    } finally {
      setDownloading(null);
    }
  }

  async function handleCalculate() {
    if (calculating) return;
    setCalculating(true);
    try {
      const r = await apiFetch<any>({ ...API.nav.calculateMetrics, path: API.nav.calculateMetrics.path.replace(':code', code) });
      showToast({
        message: r.status === 'already_fresh' ? 'Metrics are already up to date' : `Metrics calculated — ${r.records_updated} records processed`,
        type: 'success',
      });
      fetchDetail();
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Calculation failed', type: 'error' });
    } finally {
      setCalculating(false);
    }
  }

  function handleExportCSV() {
    if (rawNavData.length === 0) return;
    const csv = 'Date,NAV\n' + rawNavData.map(p => `${p.date},${p.nav}`).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `NAV_${code}_${period}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  }

  async function handleExportPNG() {
    const container = document.getElementById('nav-chart-container');
    const svg = container?.querySelector('svg');
    if (!svg) return;
    setExportingPng(true);
    try {
      const cs = getComputedStyle(document.documentElement);
      const resolve = (v: string) => cs.getPropertyValue(v.replace(/var\((.+?)\)/, '$1')).trim();
      let svgStr = new XMLSerializer().serializeToString(svg);
      // Resolve CSS vars that canvas can't render
      [['var(--color-success)', '--color-success'], ['var(--color-danger)', '--color-danger'],
        ['var(--color-muted)', '--color-muted'], ['var(--color-fg)', '--color-fg'],
        ['var(--color-border)', '--color-border']].forEach(([token, prop]) => {
        const val = cs.getPropertyValue(prop).trim();
        if (val) svgStr = svgStr.replaceAll(token, val);
      });
      // Also replace any user color (already a hex, no-op but consistent)
      const clone = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(clone);
      const img = new Image();
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = url; });
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = svg.clientWidth * scale;
      canvas.height = svg.clientHeight * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(scale, scale);
      ctx.fillStyle = cs.getPropertyValue('--color-bg').trim() || '#0d0d14';
      ctx.fillRect(0, 0, svg.clientWidth, svg.clientHeight);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${(detail?.scheme.scheme_name || code).slice(0, 40)}_${period}_${new Date().toISOString().split('T')[0]}.png`;
        a.click();
      }, 'image/png');
    } catch {
      showToast({ message: 'Image export failed', type: 'error' });
    } finally {
      setExportingPng(false);
    }
  }

  if (loading) return <VdfLoader message={`Loading ${code}`} hint="Fetching scheme data" />;
  if (fetchError || !detail) return (
    <div style={{ padding: '48px 24px' }}>
      <VdfEmptyState
        icon="⚠️"
        title={fetchError ? 'Failed to load scheme' : 'Scheme not found'}
        description={fetchError ? 'Could not fetch scheme data. Check your connection and try again.' : `No scheme found for code ${code}.`}
        action={
          fetchError
            ? <VdfButton variant="primary" size="sm" onClick={() => { setLoading(true); fetchDetail(); }}>Retry</VdfButton>
            : <VdfButton variant="outline" size="sm" onClick={() => router.push('/global-nav')}>Back to Global NAV</VdfButton>
        }
      />
    </div>
  );

  const { scheme, nav, metrics, gaps } = detail;
  const dailyChange = metrics?.daily_return;
  const isUp = (dailyChange ?? 0) >= 0;

  // Sharpe quality label
  const sharpeLabel = metrics?.sharpe_ratio == null ? null
    : metrics.sharpe_ratio > 2 ? 'Excellent' : metrics.sharpe_ratio > 1 ? 'Good'
    : metrics.sharpe_ratio > 0 ? 'Moderate' : 'Poor';

  return (
    <div className={s.page}>

      {/* ═══ HEADER ═══════════════════════════════════════ */}
      <div className={s.topRow}>
        <div className={s.topLeft}>
          <button className={s.backBtn} onClick={() => router.push('/global-nav')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div>
            <div className={s.nameRow}>
              <h1 className={s.heroName}>{scheme.scheme_name}</h1>
              <span className={s.typeBadge}>{scheme.scheme_type}</span>
              {!scheme.active && <span className={s.endedBadge}>Ended</span>}
            </div>
            <p className={s.heroMeta}>
              {scheme.isin_growth && <><span className={s.heroCode}>{scheme.isin_growth}</span><span className={s.dot}>·</span></>}
              <span className={s.heroCode}>{scheme.scheme_code}</span>
              <span className={s.dot}>·</span>
              {scheme.amc}
              {scheme.category && <><span className={s.dot}>·</span>{scheme.category}</>}
            </p>
          </div>
        </div>
        <div className={s.topRight}>
          {nav.latest_nav != null ? (
            <>
              <div className={s.navDateLabel}>NAV as of {nav.latest_nav_date ? fmtDate(nav.latest_nav_date) : '—'}</div>
              <div className={s.navBig}>
                {fmtNav(Number(nav.latest_nav))}
                {dailyChange != null && (
                  <span className={`${s.navChange} ${isUp ? s.changeUp : s.changeDown}`}>
                    {fmtPct(dailyChange)} today
                  </span>
                )}
              </div>
              <div className={s.navRecords}>{nav.total_records.toLocaleString()} records · {nav.earliest_date ? fmtDate(nav.earliest_date) : '—'} → {nav.latest_date ? fmtDate(nav.latest_date) : '—'}</div>
            </>
          ) : (
            <div className={s.navNoData}>No NAV data</div>
          )}
        </div>
      </div>

      {/* ═══ ALERT STRIP (actionable, replaces VaNi card) ═ */}
      {(nav.total_records === 0 || gaps.length > 0 || (!metrics && nav.total_records > 0) || !scheme.active) && (
        <div className={s.alertStrip}>
          {nav.total_records === 0 && (
            <div className={s.alertItem}>
              <span className={s.alertIcon} style={{ color: 'var(--color-warning)' }}>◆</span>
              <span className={s.alertText}>No NAV history — download from MFAPI to begin tracking</span>
              <button className={s.alertAction} onClick={() => handleDownload('all')} disabled={!!downloading}>
                {downloading === 'all' ? 'Downloading…' : 'Download Full History'}
              </button>
            </div>
          )}
          {gaps.length > 0 && (
            <div className={s.alertItem}>
              <span className={s.alertIcon} style={{ color: 'var(--color-warning)' }}>◆</span>
              <span className={s.alertText}>{gaps.length} date gap{gaps.length !== 1 ? 's' : ''} detected in NAV history</span>
              <button className={s.alertAction} onClick={handleRepairGaps} disabled={!!downloading}>
                {downloading === 'gap' ? 'Repairing…' : `Repair ${gaps.length} Gap${gaps.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          )}
          {!metrics && nav.total_records > 0 && (
            <div className={s.alertItem}>
              <span className={s.alertIcon} style={{ color: 'var(--color-info)' }}>◆</span>
              <span className={s.alertText}>Performance metrics not yet calculated</span>
              <button className={s.alertAction} onClick={handleCalculate} disabled={calculating}>
                {calculating ? 'Calculating…' : 'Calculate Metrics'}
              </button>
            </div>
          )}
          {!scheme.active && (
            <div className={s.alertItem}>
              <span className={s.alertIcon} style={{ color: 'var(--color-muted)' }}>◆</span>
              <span className={s.alertText}>Scheme ended {scheme.closure_date ? `on ${fmtDate(scheme.closure_date)}` : ''} — daily downloads disabled</span>
            </div>
          )}
        </div>
      )}

      {/* ═══ 2-COLUMN LAYOUT ══════════════════════════════ */}
      <div className={s.columns}>

        {/* ── LEFT: Chart panel + Action cards ─────────── */}
        <div className={s.leftCol}>

          {/* CHART PANEL */}
          <div className={s.chartPanel}>

            {/* Toolbar: periods + granularity + data mode + view toggle + tools */}
            <div className={s.toolbar}>
              {/* Period pills */}
              <div className={s.periodToggle}>
                {(['1w', '1m', '6m', 'ytd', '1y', '3y', '5y', 'max', 'custom'] as Period[]).map(p => (
                  <button
                    key={p}
                    className={`${s.periodBtn} ${period === p ? s.periodBtnActive : ''}`}
                    onClick={() => setPeriod(p)}
                  >
                    {PERIOD_LABELS[p]}
                  </button>
                ))}
              </div>

              <div className={s.toolbarRight}>
                {/* Granularity */}
                <div className={s.segmentGroup}>
                  {(['daily', 'weekly', 'monthly'] as Granularity[]).map(g => (
                    <button key={g} className={`${s.segBtn} ${granularity === g ? s.segBtnActive : ''}`} onClick={() => setGranularity(g)}>
                      {g[0].toUpperCase() + g.slice(1, g === 'daily' ? 1 : g === 'weekly' ? 2 : 2)}
                    </button>
                  ))}
                </div>

                {/* Price / Returns toggle */}
                <div className={s.segmentGroup}>
                  <button className={`${s.segBtn} ${dataMode === 'price' ? s.segBtnActive : ''}`} onClick={() => setDataMode('price')} title="Show NAV price">₹</button>
                  <button className={`${s.segBtn} ${dataMode === 'returns' ? s.segBtnActive : ''}`} onClick={() => setDataMode('returns')} title="Show % return from period start">%</button>
                </div>

                {/* Chart type selector — context-sensitive */}
                {viewMode === 'chart' && (
                  <div className={s.segmentGroup}>
                    {dataMode === 'price' ? <>
                      <button className={`${s.segBtn} ${chartType === 'line' ? s.segBtnActive : ''}`} onClick={() => setChartType('line')} title="Line chart">
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="13" height="13"><polyline points="1,12 5,6 9,9 15,3"/></svg>
                      </button>
                      <button className={`${s.segBtn} ${chartType === 'area' ? s.segBtnActive : ''}`} onClick={() => setChartType('area')} title="Area chart">
                        <svg viewBox="0 0 16 16" fill="currentColor" width="13" height="13"><path d="M1 13 L5 6 L9 9 L15 3 L15 13 Z" opacity="0.55"/><path d="M1 13 L5 6 L9 9 L15 3" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
                      </button>
                    </> : <>
                      <button className={`${s.segBtn} ${chartType === 'line' ? s.segBtnActive : ''}`} onClick={() => setChartType('line')} title="Line + baseline">
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="13" height="13"><polyline points="1,12 5,6 9,9 15,3"/></svg>
                      </button>
                      <button className={`${s.segBtn} ${chartType === 'bar' ? s.segBtnActive : ''}`} onClick={() => setChartType('bar')} title="Bar chart — returns per period">
                        <svg viewBox="0 0 16 16" fill="currentColor" width="13" height="13">
                          <rect x="1" y="5" width="3" height="8" opacity="0.9"/><rect x="6" y="3" width="3" height="10" opacity="0.9"/><rect x="11" y="7" width="3" height="6" opacity="0.9"/>
                        </svg>
                      </button>
                    </>}
                  </div>
                )}

                {/* Graph / Table toggle */}
                <div className={s.segmentGroup}>
                  <button className={`${s.segBtn} ${viewMode === 'chart' ? s.segBtnActive : ''}`} onClick={() => setViewMode('chart')}>Chart</button>
                  <button className={`${s.segBtn} ${viewMode === 'table' ? s.segBtnActive : ''}`} onClick={() => setViewMode('table')}>Table</button>
                </div>

                {/* Color picker */}
                <div className={s.colorPickerWrap} ref={colorPickerRef}>
                  <button
                    className={s.colorBtn}
                    onClick={() => { setPendingColor(chartColor); setColorPickerOpen(v => !v); }}
                    title="Chart line color"
                    style={{ '--swatch': chartColor || 'var(--color-primary)' } as React.CSSProperties}
                  >
                    <span className={s.colorSwatch} />
                  </button>
                  {colorPickerOpen && (
                    <div className={s.colorPopover}>
                      <div className={s.colorPopoverTitle}>Line Color</div>
                      <input
                        type="color"
                        className={s.colorInput}
                        value={pendingColor || '#6366f1'}
                        onChange={e => setPendingColor(e.target.value)}
                      />
                      <div className={s.colorPresets}>
                        {CHART_COLOR_PRESETS.map(c => (
                          <button
                            key={c}
                            className={`${s.colorPreset} ${pendingColor === c ? s.colorPresetActive : ''}`}
                            style={{ background: c }}
                            onClick={() => setPendingColor(c)}
                          />
                        ))}
                      </div>
                      <div className={s.colorActions}>
                        <button className={s.colorReset} onClick={() => { setChartColor(''); setColorPickerOpen(false); }}>Auto</button>
                        <button className={s.colorApply} onClick={() => { setChartColor(pendingColor); setColorPickerOpen(false); }}>Apply</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Export buttons */}
                <button className={s.toolBtn} onClick={handleExportCSV} disabled={rawNavData.length === 0} title="Export CSV">
                  CSV
                </button>
                <button className={s.toolBtn} onClick={handleExportPNG} disabled={chartData.length < 2 || viewMode !== 'chart' || exportingPng} title="Save chart as PNG">
                  {exportingPng ? '…' : 'PNG'}
                </button>

                {/* Fullscreen */}
                <button className={s.toolBtn} onClick={() => setIsFullscreen(true)} disabled={chartData.length < 2 || viewMode !== 'chart'} title="Full page view">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* Custom date row */}
            {period === 'custom' && (
              <div className={s.chartCustomRow}>
                <span className={s.statLabel}>From</span>
                <input type="date" className={s.dateInput} value={chartCustomFrom} onChange={e => setChartCustomFrom(e.target.value)} />
                <span className={s.dateSep}>→</span>
                <input type="date" className={s.dateInput} value={chartCustomTo} onChange={e => setChartCustomTo(e.target.value)} />
                {!chartCustomFrom && <span className={s.actionHint} style={{ marginLeft: 4 }}>Enter a start date to load data</span>}
              </div>
            )}

            {/* Stats strip */}
            {periodStats && (
              <div className={s.statsStrip}>
                {dataMode === 'returns' ? <>
                  <span className={s.statItem}>
                    <span className={s.statLabel}>Return</span>
                    <span className={`${s.statVal} ${periodStats.current >= 0 ? s.statUp : s.statDown}`}>
                      {fmtPct(periodStats.current)}
                    </span>
                  </span>
                  <span className={s.statSep}>·</span>
                  <span className={s.statItem}>
                    <span className={s.statLabel}>Min</span>
                    <span className={`${s.statVal} ${periodStats.min >= 0 ? s.statUp : s.statDown}`}>
                      {fmtPct(periodStats.min)}
                    </span>
                  </span>
                  <span className={s.statSep}>·</span>
                  <span className={s.statItem}>
                    <span className={s.statLabel}>Peak</span>
                    <span className={`${s.statVal} ${periodStats.max >= 0 ? s.statUp : s.statDown}`}>
                      {fmtPct(periodStats.max)}
                    </span>
                  </span>
                </> : <>
                  <span className={s.statItem}>
                    <span className={s.statLabel}>Current</span>
                    <span className={s.statVal}>{fmtNav(periodStats.current)}</span>
                  </span>
                  <span className={s.statSep}>·</span>
                  <span className={s.statItem}>
                    <span className={s.statLabel}>Min</span>
                    <span className={s.statVal}>{fmtNav(periodStats.min)}</span>
                  </span>
                  <span className={s.statSep}>·</span>
                  <span className={s.statItem}>
                    <span className={s.statLabel}>Max</span>
                    <span className={s.statVal}>{fmtNav(periodStats.max)}</span>
                  </span>
                  <span className={s.statSep}>·</span>
                  <span className={s.statItem}>
                    <span className={s.statLabel}>Change</span>
                    <span className={`${s.statVal} ${periodStats.change >= 0 ? s.statUp : s.statDown}`}>
                      {fmtChange(periodStats.change)} ({fmtPct(periodStats.changePct)})
                    </span>
                  </span>
                </>}
              </div>
            )}

            {/* Chart or Table */}
            {viewMode === 'chart' ? (
              chartData.length >= 2 ? (
                <VdfLineChart
                  data={chartData.map(p => ({ date: p.date, value: p.nav }))}
                  height={340}
                  color={chartColor || undefined}
                  containerId="nav-chart-container"
                  formatValue={dataMode === 'returns' ? v => fmtPct(v) : v => fmtNav(v)}
                  baseline={dataMode === 'returns' ? 0 : undefined}
                  chartType={chartType}
                />
              ) : (
                <div className={s.chartEmpty}>
                  {rawNavData.length === 0 ? 'No NAV history — download to start tracking' : 'Not enough data for this period'}
                </div>
              )
            ) : (
              /* ── Table view ── */
              <div className={s.tableView}>
                <div className={s.tableCount}>
                  {tableData.length === 0 ? 'No records' : `${((tablePage - 1) * PAGE_SIZE) + 1}–${Math.min(tablePage * PAGE_SIZE, tableData.length)} of ${tableData.length.toLocaleString()}`}
                </div>
                {tableData.length > 0 && (
                  <>
                    <div className={d.tableWrap} style={{ maxHeight: 320 }}>
                      <table className={d.table}>
                        <thead>
                          <tr><th>Date</th><th>NAV</th><th>Daily Return</th></tr>
                        </thead>
                        <tbody>
                          {pagedData.map((row, i) => {
                            const prev = i < pagedData.length - 1 ? pagedData[i + 1].nav : null;
                            const ret = prev && prev > 0 ? ((row.nav - prev) / prev) * 100 : null;
                            return (
                              <tr key={row.date}>
                                <td>{fmtDate(row.date)}</td>
                                <td className={d.tdMono}>{fmtNav(row.nav)}</td>
                                <td className={`${d.tdMono} ${ret != null ? (ret >= 0 ? d.valUp : d.valDown) : ''}`}>
                                  {ret != null ? fmtPct(ret) : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {totalTablePages > 1 && (
                      <div className={d.pagination}>
                        <button className={d.pageBtn} disabled={tablePage <= 1} onClick={() => setTablePage(1)}>First</button>
                        <button className={d.pageBtn} disabled={tablePage <= 1} onClick={() => setTablePage(p => p - 1)}>Prev</button>
                        <span className={d.pageInfo}>Page {tablePage} / {totalTablePages}</span>
                        <button className={d.pageBtn} disabled={tablePage >= totalTablePages} onClick={() => setTablePage(p => p + 1)}>Next</button>
                        <button className={d.pageBtn} disabled={tablePage >= totalTablePages} onClick={() => setTablePage(totalTablePages)}>Last</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* BOTTOM ROW: VaNi (half) + Action cards (half, stacked) */}
          <div className={s.bottomRow}>

            {/* VaNi panel */}
            <div className={s.vaniPanel}>
              <div className={s.vaniLabel}>VaNi · Scheme Analysis</div>
              <div className={s.vaniLines}>
                {nav.total_records === 0 && (
                  <p>No NAV history available for this scheme. Download from MFAPI to begin tracking performance.</p>
                )}
                {nav.total_records > 0 && !metrics && (
                  <p>NAV history is loaded ({nav.total_records.toLocaleString()} records). Calculate metrics to unlock returns, volatility, and risk analysis.</p>
                )}
                {metrics?.cagr != null && (
                  <p>
                    CAGR of <strong>{fmtPct(metrics.cagr)}</strong> —{' '}
                    {metrics.cagr >= 15 ? 'strong long-term growth, outpacing most benchmarks.'
                      : metrics.cagr >= 10 ? 'moderate growth, broadly in line with category.'
                      : metrics.cagr >= 0 ? 'below-benchmark growth — consider reviewing allocation.'
                      : 'negative returns over the tracking period.'}
                  </p>
                )}
                {metrics?.sharpe_ratio != null && (
                  <p>
                    Sharpe ratio of <strong>{metrics.sharpe_ratio.toFixed(2)}</strong> ({sharpeLabel}) —{' '}
                    {metrics.sharpe_ratio > 2 ? 'exceptional risk-adjusted return.'
                      : metrics.sharpe_ratio > 1 ? 'good risk-adjusted return relative to volatility.'
                      : metrics.sharpe_ratio > 0 ? 'positive but modest risk-adjusted return.'
                      : 'returns not compensating for risk taken.'}
                  </p>
                )}
                {gaps.length > 0 && (
                  <p>{gaps.length} gap{gaps.length !== 1 ? 's' : ''} in NAV history — period returns may be understated until repaired.</p>
                )}
                {nav.total_records > 0 && metrics && gaps.length === 0 && scheme.active && (
                  <p>Data is complete — {nav.total_records.toLocaleString()} records, no gaps, metrics current as of {metrics.metrics_date ? fmtDate(metrics.metrics_date) : '—'}.</p>
                )}
                {!scheme.active && (
                  <p>Scheme closed {scheme.closure_date ? `on ${fmtDate(scheme.closure_date)}` : ''}. Historical data remains available for analysis.</p>
                )}
              </div>
            </div>

            {/* Action cards — stacked vertically */}
            <div className={s.actionCol}>

              <div className={`${s.actionCard} ${s.actionCardGreen}`}>
                <div className={s.actionCardTitle}>NAV History</div>
                <div className={s.actionCardBtns}>
                  <button className={`${s.actionBtnFull} ${s.actionBtnPrimary}`} onClick={() => handleDownload('all')} disabled={!!downloading}>
                    {downloading === 'all' ? 'Downloading…' : 'Download Full History'}
                  </button>
                  <div className={s.quickBtns}>
                    <span className={s.quickLabel}>Quick</span>
                    {(['1y', '6m', '3m'] as const).map(r => (
                      <button key={r} className={s.quickBtn} onClick={() => handleDownload(r)} disabled={!!downloading}>
                        {downloading === r ? '…' : r.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  {showCustom ? (
                    <div className={s.customRange}>
                      <input type="date" className={s.dateInput} value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
                      <span className={s.dateSep}>→</span>
                      <input type="date" className={s.dateInput} value={customTo} onChange={e => setCustomTo(e.target.value)} />
                      <button className={s.quickBtn} onClick={() => handleDownload('custom')} disabled={!!downloading || !customFrom}>
                        {downloading === 'custom' ? '…' : 'Go'}
                      </button>
                    </div>
                  ) : (
                    <button className={`${s.actionBtnFull} ${s.actionBtnOutline}`} onClick={() => setShowCustom(true)}>
                      Custom Date Range
                    </button>
                  )}
                  {gaps.length > 0 ? (
                    <button className={`${s.actionBtnFull} ${s.actionBtnWarn}`} onClick={handleRepairGaps} disabled={!!downloading}>
                      {downloading === 'gap' ? 'Repairing…' : `Repair ${gaps.length} Gap${gaps.length !== 1 ? 's' : ''}`}
                    </button>
                  ) : nav.total_records > 0 ? (
                    <div className={s.noGaps}>No gaps detected</div>
                  ) : null}
                </div>
              </div>

              <div className={`${s.actionCard} ${s.actionCardBlue}`}>
                <div className={s.actionCardTitle}>Performance Analytics</div>
                <div className={s.actionCardBtns}>
                  <button
                    className={`${s.actionBtnFull} ${metrics ? s.actionBtnOutline : s.actionBtnPrimary}`}
                    onClick={handleCalculate}
                    disabled={calculating || nav.total_records === 0}
                  >
                    {calculating ? 'Calculating…' : metrics ? 'Recalculate Metrics' : 'Calculate Metrics'}
                  </button>
                  {nav.total_records === 0 && <div className={s.actionHint}>Download NAV history first</div>}
                </div>
                {metrics?.metrics_calculated_at && (
                  <div className={s.actionHint}>Last calculated: {metrics.metrics_date ? fmtDate(metrics.metrics_date) : '—'}</div>
                )}
              </div>

            </div>
          </div>
        </div>

        {/* ── RIGHT: Sticky metrics sidebar ─────────────── */}
        <div className={s.rightCol}>

          {/* METRICS PANEL */}
          <div className={s.metricsPanel}>
            {!metrics ? (
              <div className={s.noMetrics}>
                <div className={s.noMetricsIcon}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32">
                    <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
                  </svg>
                </div>
                <div className={s.noMetricsTitle}>No Performance Data</div>
                <div className={s.noMetricsDesc}>
                  {nav.total_records > 0
                    ? 'NAV history is ready. Calculate metrics to see returns, volatility, and risk analysis.'
                    : 'Download NAV history first, then calculate performance metrics.'}
                </div>
                {nav.total_records > 0 && (
                  <button className={s.noMetricsCta} onClick={handleCalculate} disabled={calculating}>
                    {calculating ? 'Calculating…' : 'Calculate Metrics'}
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Returns */}
                <div className={s.metricSection}>
                  <div className={s.metricSectionTitle}>Returns</div>
                  {[
                    { label: 'Daily',    v: metrics.daily_return },
                    { label: '1 Week',   v: metrics.return_1w },
                    { label: '1 Month',  v: metrics.return_1m },
                    { label: '3 Months', v: metrics.return_3m },
                    { label: '6 Months', v: metrics.return_6m },
                    { label: '1 Year',   v: metrics.return_1y },
                    { label: 'YTD',      v: metrics.return_ytd },
                    { label: 'All-Time', v: metrics.return_all },
                  ].map(({ label, v }) => (
                    <div key={label} className={s.metricRow}>
                      <span className={s.metricLabel}>{label}</span>
                      <span className={`${s.metricValue} ${v == null ? s.metricMuted : v >= 0 ? s.metricPos : s.metricNeg}`}>
                        {v == null ? '—' : fmtPct(v)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Volatility */}
                <div className={s.metricSection}>
                  <div className={s.metricSectionTitle}>Volatility (Std Dev)</div>
                  {[
                    { label: '7-Day',   v: metrics.sd_7d },
                    { label: '21-Day',  v: metrics.sd_21d },
                    { label: '42-Day',  v: metrics.sd_42d },
                    { label: '3-Month', v: metrics.sd_3m },
                    { label: '6-Month', v: metrics.sd_6m },
                  ].map(({ label, v }) => (
                    <div key={label} className={s.metricRow}>
                      <span className={s.metricLabel}>{label}</span>
                      <span className={`${s.metricValue} ${v == null ? s.metricMuted : ''}`}>
                        {v == null ? '—' : `${Number(v).toFixed(2)}%`}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Key Metrics */}
                <div className={s.metricSection}>
                  <div className={s.metricSectionTitle}>Key Metrics</div>
                  <div className={s.keyMetricRow}>
                    <span className={s.keyMetricLabel}>CAGR</span>
                    <span className={`${s.keyMetricValue} ${metrics.cagr == null ? s.metricMuted : metrics.cagr >= 0 ? s.metricPos : s.metricNeg}`}>
                      {metrics.cagr == null ? '—' : fmtPct(metrics.cagr)}
                    </span>
                  </div>
                  <div className={s.keyMetricRow}>
                    <span className={s.keyMetricLabel}>
                      Sharpe Ratio
                      {sharpeLabel && (
                        <span className={`${s.sharpeBadge} ${metrics.sharpe_ratio! > 1 ? s.sharpeBadgeGood : s.sharpeBadgePoor}`}>
                          {sharpeLabel}
                        </span>
                      )}
                    </span>
                    <span className={`${s.keyMetricValue} ${metrics.sharpe_ratio == null ? s.metricMuted : ''}`}>
                      {metrics.sharpe_ratio == null ? '—' : metrics.sharpe_ratio.toFixed(2)}
                    </span>
                  </div>
                  <div className={s.keyMetricRow}>
                    <span className={s.keyMetricLabel}>Max Drawdown</span>
                    <span className={`${s.keyMetricValue} ${metrics.max_drawdown == null ? s.metricMuted : s.metricNeg}`}>
                      {metrics.max_drawdown == null ? '—' : fmtPct(metrics.max_drawdown)}
                    </span>
                  </div>
                  {metrics.max_drawdown != null && (
                    <div className={s.progressTrack}>
                      <div className={s.progressFill} style={{ width: `${Math.min(100, Math.abs(metrics.max_drawdown) * 3)}%` }} />
                    </div>
                  )}
                </div>

                <div className={s.metricsTimestamp}>Calculated {metrics.metrics_date ? fmtDate(metrics.metrics_date) : '—'}</div>
              </>
            )}
          </div>

          {/* DATA AUDIT */}
          <div className={s.auditPanel}>
            <div className={s.auditTitle}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="13" height="13">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              Data Lineage
            </div>
            <div className={s.auditRow}>
              <div className={`${s.auditDot} ${s.auditDotBlue}`} />
              <span className={s.auditText}>AMFI master imported</span>
            </div>
            {nav.total_records > 0 ? (
              <div className={s.auditRow}>
                <div className={`${s.auditDot} ${s.auditDotGreen}`} />
                <span className={s.auditText}>MFAPI fetch — {nav.total_records.toLocaleString()} records</span>
              </div>
            ) : (
              <div className={s.auditRow}>
                <div className={`${s.auditDot} ${s.auditDotAmber}`} />
                <span className={s.auditText}>No NAV history fetched yet</span>
              </div>
            )}
            {gaps.length > 0 && (
              <div className={s.auditRow}>
                <div className={`${s.auditDot} ${s.auditDotAmber}`} />
                <span className={s.auditText}>{gaps.length} gap{gaps.length !== 1 ? 's' : ''} detected</span>
              </div>
            )}
            {gaps.length === 0 && nav.total_records > 0 && (
              <div className={s.auditRow}>
                <div className={`${s.auditDot} ${s.auditDotGreen}`} />
                <span className={s.auditText}>No gaps — history complete</span>
              </div>
            )}
            {metrics?.metrics_calculated_at && (
              <div className={s.auditRow}>
                <div className={`${s.auditDot} ${s.auditDotGreen}`} />
                <span className={s.auditText}>Metrics calculated — {metrics.metrics_date ? fmtDate(metrics.metrics_date) : '—'}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ FULLSCREEN CHART OVERLAY ═════════════════════ */}
      {isFullscreen && (
        <div className={s.fullscreenOverlay}>
          <div className={s.fullscreenHeader}>
            <div className={s.fullscreenTitle}>
              <span className={s.heroName} style={{ fontSize: '1rem' }}>{scheme.scheme_name}</span>
              <span className={s.typeBadge}>{scheme.scheme_type}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Period pills */}
              <div className={s.periodToggle}>
                {(['1m', '6m', '1y', '3y', '5y', 'max'] as Period[]).map(p => (
                  <button key={p} className={`${s.periodBtn} ${period === p ? s.periodBtnActive : ''}`} onClick={() => setPeriod(p)}>
                    {PERIOD_LABELS[p]}
                  </button>
                ))}
              </div>
              {/* Granularity */}
              <div className={s.segmentGroup}>
                {(['daily', 'weekly', 'monthly'] as Granularity[]).map(g => (
                  <button key={g} className={`${s.segBtn} ${granularity === g ? s.segBtnActive : ''}`} onClick={() => setGranularity(g)}>
                    {g[0].toUpperCase() + g.slice(1, 3)}
                  </button>
                ))}
              </div>
              {/* Price / Returns */}
              <div className={s.segmentGroup}>
                <button className={`${s.segBtn} ${dataMode === 'price' ? s.segBtnActive : ''}`} onClick={() => setDataMode('price')}>₹</button>
                <button className={`${s.segBtn} ${dataMode === 'returns' ? s.segBtnActive : ''}`} onClick={() => setDataMode('returns')}>%</button>
              </div>
              {/* Chart type */}
              <div className={s.segmentGroup}>
                {dataMode === 'price' ? <>
                  <button className={`${s.segBtn} ${chartType === 'line' ? s.segBtnActive : ''}`} onClick={() => setChartType('line')} title="Line">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="12" height="12"><polyline points="1,12 5,6 9,9 15,3"/></svg>
                  </button>
                  <button className={`${s.segBtn} ${chartType === 'area' ? s.segBtnActive : ''}`} onClick={() => setChartType('area')} title="Area">
                    <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12"><path d="M1 13 L5 6 L9 9 L15 3 L15 13 Z" opacity="0.55"/><path d="M1 13 L5 6 L9 9 L15 3" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
                  </button>
                </> : <>
                  <button className={`${s.segBtn} ${chartType === 'line' ? s.segBtnActive : ''}`} onClick={() => setChartType('line')} title="Line">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="12" height="12"><polyline points="1,12 5,6 9,9 15,3"/></svg>
                  </button>
                  <button className={`${s.segBtn} ${chartType === 'bar' ? s.segBtnActive : ''}`} onClick={() => setChartType('bar')} title="Bar">
                    <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12"><rect x="1" y="5" width="3" height="8" opacity="0.9"/><rect x="6" y="3" width="3" height="10" opacity="0.9"/><rect x="11" y="7" width="3" height="6" opacity="0.9"/></svg>
                  </button>
                </>}
              </div>
              <button className={s.toolBtn} onClick={handleExportPNG} disabled={exportingPng}>
                {exportingPng ? '…' : 'PNG'}
              </button>
              <button className={`${s.toolBtn} ${s.closeFullscreen}`} onClick={() => setIsFullscreen(false)} title="Exit full page">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
                </svg>
                Exit
              </button>
            </div>
          </div>
          {periodStats && (
            <div className={s.statsStrip} style={{ margin: '0 0 12px' }}>
              {dataMode === 'returns' ? <>
                <span className={s.statItem}><span className={s.statLabel}>Return</span><span className={`${s.statVal} ${periodStats.current >= 0 ? s.statUp : s.statDown}`}>{fmtPct(periodStats.current)}</span></span>
                <span className={s.statSep}>·</span>
                <span className={s.statItem}><span className={s.statLabel}>Min</span><span className={`${s.statVal} ${periodStats.min >= 0 ? s.statUp : s.statDown}`}>{fmtPct(periodStats.min)}</span></span>
                <span className={s.statSep}>·</span>
                <span className={s.statItem}><span className={s.statLabel}>Peak</span><span className={`${s.statVal} ${periodStats.max >= 0 ? s.statUp : s.statDown}`}>{fmtPct(periodStats.max)}</span></span>
              </> : <>
                <span className={s.statItem}><span className={s.statLabel}>Current</span><span className={s.statVal}>{fmtNav(periodStats.current)}</span></span>
                <span className={s.statSep}>·</span>
                <span className={s.statItem}><span className={s.statLabel}>Min</span><span className={s.statVal}>{fmtNav(periodStats.min)}</span></span>
                <span className={s.statSep}>·</span>
                <span className={s.statItem}><span className={s.statLabel}>Max</span><span className={s.statVal}>{fmtNav(periodStats.max)}</span></span>
                <span className={s.statSep}>·</span>
                <span className={s.statItem}><span className={s.statLabel}>Change</span><span className={`${s.statVal} ${periodStats.change >= 0 ? s.statUp : s.statDown}`}>{fmtChange(periodStats.change)} ({fmtPct(periodStats.changePct)})</span></span>
              </>}
            </div>
          )}
          <div className={s.fullscreenChart} id="nav-chart-container" style={{ display: 'flex', flexDirection: 'column' }}>
            {chartData.length >= 2 ? (
              <VdfLineChart
                data={chartData.map(p => ({ date: p.date, value: p.nav }))}
                height={typeof window !== 'undefined' ? Math.max(360, window.innerHeight - 160) : 600}
                color={chartColor || undefined}
                formatValue={dataMode === 'returns' ? v => fmtPct(v) : v => fmtNav(v)}
                baseline={dataMode === 'returns' ? 0 : undefined}
                chartType={chartType}
                className={s.fullscreenChartInner}
              />
            ) : (
              <div className={s.chartEmpty}>Not enough data for this period</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
