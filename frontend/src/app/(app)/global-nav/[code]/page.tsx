'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { useSkillQuery } from '@/hooks';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { VdfLineChart } from '@/components/vdf';
import { FullPageLoader } from '@/components/loader';
import s from './scheme-dashboard.module.css';

/* ── Types ─────────────────────────────────────────── */

interface SchemeDetail {
  scheme: {
    scheme_code: string; scheme_name: string; amc: string; category: string;
    scheme_type: string; active: boolean; launch_date: string | null;
    closure_date: string | null; isin_growth: string | null;
    isin_dividend: string | null; nav_name: string | null;
    min_amount: number | null; risk_grade: string | null;
  };
  nav: {
    total_records: number; earliest_date: string | null;
    latest_date: string | null; latest_nav: number | null;
    latest_nav_date: string | null;
  };
  metrics: {
    daily_return: number | null; return_1w: number | null; return_1m: number | null;
    return_3m: number | null; return_6m: number | null; return_1y: number | null;
    return_ytd: number | null; return_all: number | null;
    sd_7d: number | null; sd_14d: number | null; sd_21d: number | null;
    sd_42d: number | null; sd_3m: number | null; sd_6m: number | null;
    sharpe_ratio: number | null; max_drawdown: number | null;
    cagr: number | null; metrics_calculated_at: string | null;
    metrics_date: string | null;
  } | null;
  gaps: { gap_after: string; gap_before: string; gap_days: number }[];
  bookmark: { id: number; daily_download_enabled: boolean; alias_name: string | null } | null;
}

interface NavHistoryData {
  data: { date: string; nav: number }[];
}

/* ── Helpers ───────────────────────────────────────── */

function fmtPct(v: number | null | undefined): string {
  if (v == null) return '\u2014';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function fmtNum(v: number | null | undefined, decimals = 2): string {
  if (v == null) return '\u2014';
  return v.toFixed(decimals);
}

/* ── Main ──────────────────────────────────────────── */

export default function SchemeDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const code = params.code as string;

  const [detail, setDetail] = useState<SchemeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [bookmarking, setBookmarking] = useState(false);

  // Chart/table controls
  type Period = '1w' | '1m' | '6m' | '1y' | '2y' | 'all' | 'custom';
  type Granularity = 'daily' | 'monthly';
  const [period, setPeriod] = useState<Period>('1y');
  const [granularity, setGranularity] = useState<Granularity>('daily');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [tablePage, setTablePage] = useState(1);
  const TABLE_PAGE_SIZE = 50;

  // Fetch scheme detail
  const fetchDetail = useCallback(async () => {
    try {
      const data = await apiFetch<SchemeDetail>({
        ...API.nav.schemeDetail,
        path: API.nav.schemeDetail.path.replace(':code', code),
      });
      setDetail(data);
    } catch { /* fail silently */ }
    finally { setLoading(false); }
  }, [code]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  // Compute date range from period
  function getDateRange(): { from: string; to: string } {
    const to = new Date();
    const toStr = to.toISOString().split('T')[0];
    if (period === 'custom') return { from: customFrom || '2000-01-01', to: customTo || toStr };
    if (period === 'all') return { from: '2000-01-01', to: toStr };
    const from = new Date();
    const periodMap: Record<string, number> = { '1w': 7, '1m': 30, '6m': 180, '1y': 365, '2y': 730 };
    from.setDate(from.getDate() - (periodMap[period] || 365));
    return { from: from.toISOString().split('T')[0], to: toStr };
  }

  const dateRange = getDateRange();

  // NAV history for chart + table
  const { data: navHistory } = useSkillQuery<NavHistoryData>(
    'market-skill', 'get_nav_history',
    { scheme_code: code, from_date: dateRange.from, to_date: dateRange.to },
    { enabled: !!code },
  );
  const rawNavData = navHistory?.data?.data || [];

  // Apply granularity (monthly = last NAV per month)
  const navData = granularity === 'monthly' && rawNavData.length > 0
    ? rawNavData.reduce<{ date: string; nav: number }[]>((acc, d) => {
        const month = d.date.slice(0, 7); // YYYY-MM
        const last = acc[acc.length - 1];
        if (!last || last.date.slice(0, 7) !== month) acc.push(d);
        else acc[acc.length - 1] = d; // keep last day of each month
        return acc;
      }, [])
    : rawNavData;

  // Paginated table data
  const tableData = [...navData].reverse(); // newest first for table
  const totalTablePages = Math.ceil(tableData.length / TABLE_PAGE_SIZE);
  const pagedTableData = tableData.slice((tablePage - 1) * TABLE_PAGE_SIZE, tablePage * TABLE_PAGE_SIZE);

  // Reset table page when period/granularity changes
  useEffect(() => { setTablePage(1); }, [period, granularity]);

  // Actions
  async function handleDownloadFull() {
    if (downloading) return; setDownloading('full');
    try {
      const r = await apiFetch<any>({ ...API.nav.downloadScheme, path: API.nav.downloadScheme.path.replace(':code', code) });
      showToast({ message: `${r.records} NAV records downloaded (full history)`, type: 'success' });
      fetchDetail();
    } catch (err) { showToast({ message: (err as ApiError).message || 'Failed', type: 'error' }); }
    finally { setDownloading(null); }
  }

  async function handleDownloadGap() {
    if (downloading) return; setDownloading('gap');
    try {
      const r = await apiFetch<any>({ ...API.nav.downloadGap, path: API.nav.downloadGap.path.replace(':code', code) });
      showToast({ message: r.status === 'no_gaps' ? 'No gaps found' : `${r.records_filled} records filled across ${r.gaps_found} gaps`, type: 'success' });
      fetchDetail();
    } catch (err) { showToast({ message: (err as ApiError).message || 'Failed', type: 'error' }); }
    finally { setDownloading(null); }
  }

  async function handleCalculate() {
    if (calculating) return; setCalculating(true);
    try {
      const r = await apiFetch<any>({ ...API.nav.calculateMetrics, path: API.nav.calculateMetrics.path.replace(':code', code) });
      showToast({ message: r.status === 'already_fresh' ? 'Metrics already up to date' : `${r.records_updated} records updated (${r.execution_ms}ms)`, type: 'success' });
      fetchDetail();
    } catch (err) { showToast({ message: (err as ApiError).message || 'Failed', type: 'error' }); }
    finally { setCalculating(false); }
  }

  async function handleBookmark() {
    if (bookmarking) return; setBookmarking(true);
    try {
      await apiFetch<any>(API.nav.addBookmark, { body: { scheme_code: code } });
      showToast({ message: 'Bookmarked for daily tracking', type: 'success' });
      fetchDetail();
    } catch (err) { showToast({ message: (err as ApiError).message || 'Failed', type: 'error' }); }
    finally { setBookmarking(false); }
  }

  function handleExportCSV() {
    if (navData.length === 0) return;
    const csv = 'Date,NAV\n' + navData.map(d => `${d.date},${d.nav}`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `NAV_${code}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  }

  if (loading) return <FullPageLoader overlay={false} message={`Loading ${code}...`} />;
  if (!detail) return <div className={s.error}>Scheme not found</div>;

  const { scheme, nav, metrics, gaps, bookmark } = detail;
  const isEnded = !scheme.active;
  const hasData = nav.total_records > 0;
  const hasMetrics = !!metrics?.metrics_calculated_at;
  const change1d = metrics?.daily_return;
  const isPositive = (change1d ?? 0) >= 0;

  return (
    <div className={s.page}>
      {/* Back nav */}
      <button className={s.backBtn} onClick={() => router.push('/global-nav')}>
        {'\u2190'} Back to Global NAV
      </button>

      {/* ═══ HERO ═══ */}
      <div className={s.hero}>
        <div className={s.heroLeft}>
          <h1 className={s.heroName}>{scheme.scheme_name}</h1>
          <div className={s.heroMeta}>
            <span className={s.heroCode}>{scheme.scheme_code}</span>
            <span className={s.heroDot}>{'\u00B7'}</span>
            <span>{scheme.amc}</span>
            <span className={s.heroDot}>{'\u00B7'}</span>
            <span>{scheme.category}</span>
            {isEnded && <span className={s.endedBadge}>Ended</span>}
          </div>
          {scheme.nav_name && <div className={s.heroNavName}>{scheme.nav_name}</div>}
        </div>
        <div className={s.heroRight}>
          {nav.latest_nav && (
            <>
              <div className={s.heroNav}>{'\u20B9'}{Number(nav.latest_nav).toFixed(2)}</div>
              {change1d != null && (
                <div className={`${s.heroChange} ${isPositive ? s.changeUp : s.changeDown}`}>
                  {isPositive ? '\u25B2' : '\u25BC'} {fmtPct(change1d)}
                </div>
              )}
              <div className={s.heroDate}>{nav.latest_nav_date}</div>
            </>
          )}
        </div>
      </div>

      {/* ═══ STATS ROW ═══ */}
      <div className={s.statsRow}>
        <div className={s.stat}><span className={s.statNum}>{(nav.total_records ?? 0).toLocaleString()}</span><span className={s.statLabel}>NAV Records</span></div>
        <div className={s.stat}><span className={s.statNum}>{nav.earliest_date || '\u2014'}</span><span className={s.statLabel}>Earliest</span></div>
        <div className={s.stat}><span className={s.statNum}>{nav.latest_date || '\u2014'}</span><span className={s.statLabel}>Latest</span></div>
        <div className={s.stat}><span className={s.statNum}>{gaps.length}</span><span className={s.statLabel}>Data Gaps</span></div>
        <div className={s.stat}><span className={s.statNum}>{hasMetrics ? '\u2713' : '\u2717'}</span><span className={s.statLabel}>Metrics</span></div>
        <div className={s.stat}><span className={s.statNum}>{bookmark ? '\u{1F516}' : '\u2014'}</span><span className={s.statLabel}>Tracked</span></div>
      </div>

      {/* ═══ ACTIONS BAR ═══ */}
      <div className={s.actionsBar}>
        <button className={s.actionPrimary} onClick={handleDownloadFull} disabled={!!downloading}>
          {downloading === 'full' ? 'Downloading...' : '\u2B07 Download Full History'}
        </button>
        <button className={s.actionBtn} onClick={handleDownloadGap} disabled={!!downloading || gaps.length === 0}>
          {downloading === 'gap' ? 'Filling...' : `\u{1F527} Fill ${gaps.length} Gap${gaps.length !== 1 ? 's' : ''}`}
        </button>
        <button className={s.actionBtn} onClick={handleCalculate} disabled={calculating || !hasData}>
          {calculating ? 'Calculating...' : '\u{1F9EE} Calculate Metrics'}
        </button>
        <button className={s.actionBtnGreen} onClick={handleBookmark} disabled={bookmarking || !!bookmark}>
          {bookmark ? '\u2713 Tracked' : bookmarking ? '...' : '\u{1F516} Track Daily'}
        </button>
        {navData.length > 0 && (
          <button className={s.actionBtn} onClick={handleExportCSV}>{'\u{1F4E5}'} Export CSV</button>
        )}
      </div>

      {/* ═══ METRICS TABLE ═══ */}
      {hasMetrics && metrics && (
        <div className={s.metricsSection}>
          <h3 className={s.sectionTitle}>Performance & Risk</h3>
          <div className={s.metricsGrid}>
            {/* Returns */}
            <div className={s.metricsCard}>
              <div className={s.metricsCardTitle}>Returns</div>
              <div className={s.metricsTable}>
                {[
                  { label: '1 Day', value: metrics.daily_return },
                  { label: '1 Week', value: metrics.return_1w },
                  { label: '1 Month', value: metrics.return_1m },
                  { label: '3 Months', value: metrics.return_3m },
                  { label: '6 Months', value: metrics.return_6m },
                  { label: '1 Year', value: metrics.return_1y },
                  { label: 'YTD', value: metrics.return_ytd },
                  { label: 'All Time', value: metrics.return_all },
                ].map(r => (
                  <div key={r.label} className={s.metricsRow}>
                    <span className={s.metricsLabel}>{r.label}</span>
                    <span className={`${s.metricsValue} ${(r.value ?? 0) >= 0 ? s.valUp : s.valDown}`}>{fmtPct(r.value)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Volatility */}
            <div className={s.metricsCard}>
              <div className={s.metricsCardTitle}>Volatility (Std Dev)</div>
              <div className={s.metricsTable}>
                {[
                  { label: '7 Day', value: metrics.sd_7d },
                  { label: '14 Day', value: metrics.sd_14d },
                  { label: '21 Day', value: metrics.sd_21d },
                  { label: '42 Day', value: metrics.sd_42d },
                  { label: '3 Month', value: metrics.sd_3m },
                  { label: '6 Month', value: metrics.sd_6m },
                ].map(r => (
                  <div key={r.label} className={s.metricsRow}>
                    <span className={s.metricsLabel}>{r.label}</span>
                    <span className={s.metricsValue}>{fmtNum(r.value, 4)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Risk */}
            <div className={s.metricsCard}>
              <div className={s.metricsCardTitle}>Risk Metrics</div>
              <div className={s.metricsTable}>
                <div className={s.metricsRow}><span className={s.metricsLabel}>Sharpe Ratio</span><span className={s.metricsValue}>{fmtNum(metrics.sharpe_ratio, 4)}</span></div>
                <div className={s.metricsRow}><span className={s.metricsLabel}>Max Drawdown</span><span className={`${s.metricsValue} ${s.valDown}`}>{fmtPct(metrics.max_drawdown)}</span></div>
                <div className={s.metricsRow}><span className={s.metricsLabel}>CAGR</span><span className={`${s.metricsValue} ${(metrics.cagr ?? 0) >= 0 ? s.valUp : s.valDown}`}>{fmtPct(metrics.cagr)}</span></div>
                <div className={s.metricsRow}><span className={s.metricsLabel}>Calculated</span><span className={s.metricsValueMuted}>{metrics.metrics_date || '\u2014'}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ NAV CHART + CONTROLS ═══ */}
      <div className={s.chartSection}>
        <div className={s.chartHeader}>
          <h3 className={s.sectionTitle}>NAV History ({navData.length.toLocaleString()} records)</h3>
          <div className={s.chartControls}>
            {/* Granularity toggle */}
            <div className={s.toggleGroup}>
              <button className={`${s.toggleBtn} ${granularity === 'daily' ? s.toggleActive : ''}`} onClick={() => setGranularity('daily')}>Daily</button>
              <button className={`${s.toggleBtn} ${granularity === 'monthly' ? s.toggleActive : ''}`} onClick={() => setGranularity('monthly')}>Monthly</button>
            </div>
            {/* Period filters */}
            <div className={s.periodGroup}>
              {(['1w', '1m', '6m', '1y', '2y', 'all'] as Period[]).map(p => (
                <button key={p} className={`${s.periodBtn} ${period === p ? s.periodActive : ''}`} onClick={() => setPeriod(p)}>
                  {p === 'all' ? 'All' : p.toUpperCase()}
                </button>
              ))}
              <button className={`${s.periodBtn} ${period === 'custom' ? s.periodActive : ''}`} onClick={() => setPeriod('custom')}>Custom</button>
            </div>
          </div>
        </div>

        {/* Custom date range */}
        {period === 'custom' && (
          <div className={s.customRange}>
            <input type="date" className={s.dateInput} value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
            <span className={s.dateSep}>{'\u2192'}</span>
            <input type="date" className={s.dateInput} value={customTo} onChange={e => setCustomTo(e.target.value)} />
          </div>
        )}

        {/* Chart */}
        {navData.length >= 2 ? (
          <VdfLineChart data={navData.map(d => ({ date: d.date, value: d.nav }))} height={300} />
        ) : (
          <div className={s.chartEmpty}>No NAV data for selected period</div>
        )}
      </div>

      {/* ═══ NAV DATA TABLE ═══ */}
      {tableData.length > 0 && (
        <div className={s.tableSection}>
          <div className={s.tableHeader}>
            <h3 className={s.sectionTitle}>NAV Data</h3>
            <span className={s.tableCount}>
              Showing {((tablePage - 1) * TABLE_PAGE_SIZE) + 1}\u2013{Math.min(tablePage * TABLE_PAGE_SIZE, tableData.length)} of {tableData.length.toLocaleString()} records
            </span>
          </div>
          <div className={s.tableWrap}>
            <table className={s.dataTable}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>NAV</th>
                  <th>Daily Return</th>
                </tr>
              </thead>
              <tbody>
                {pagedTableData.map((d, i) => {
                  const prevNav = i < pagedTableData.length - 1 ? pagedTableData[i + 1].nav : null;
                  const dayReturn = prevNav && prevNav > 0 ? ((d.nav - prevNav) / prevNav) * 100 : null;
                  return (
                    <tr key={d.date}>
                      <td>{d.date}</td>
                      <td className={s.tdMono}>{'\u20B9'}{d.nav.toFixed(4)}</td>
                      <td className={`${s.tdMono} ${dayReturn != null ? (dayReturn >= 0 ? s.valUp : s.valDown) : ''}`}>
                        {dayReturn != null ? fmtPct(dayReturn) : '\u2014'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalTablePages > 1 && (
            <div className={s.tablePagination}>
              <button className={s.pgBtn} disabled={tablePage <= 1} onClick={() => setTablePage(1)}>First</button>
              <button className={s.pgBtn} disabled={tablePage <= 1} onClick={() => setTablePage(p => p - 1)}>Prev</button>
              <span className={s.pgInfo}>Page {tablePage} of {totalTablePages}</span>
              <button className={s.pgBtn} disabled={tablePage >= totalTablePages} onClick={() => setTablePage(p => p + 1)}>Next</button>
              <button className={s.pgBtn} disabled={tablePage >= totalTablePages} onClick={() => setTablePage(totalTablePages)}>Last</button>
            </div>
          )}
        </div>
      )}

      {/* ═══ GAPS ═══ */}
      {gaps.length > 0 && (
        <div className={s.gapsSection}>
          <h3 className={s.sectionTitle}>Data Gaps ({gaps.length})</h3>
          <div className={s.gapsGrid}>
            {gaps.map((g, i) => (
              <div key={i} className={s.gapCard}>
                <span className={s.gapDays}>{g.gap_days}d</span>
                <span className={s.gapRange}>{g.gap_after} {'\u2192'} {g.gap_before}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ SCHEME INFO ═══ */}
      <div className={s.infoSection}>
        <h3 className={s.sectionTitle}>Scheme Information</h3>
        <div className={s.infoGrid}>
          <div className={s.infoItem}><span className={s.infoLabel}>Scheme Code</span><span className={s.infoValue}>{scheme.scheme_code}</span></div>
          <div className={s.infoItem}><span className={s.infoLabel}>AMC</span><span className={s.infoValue}>{scheme.amc}</span></div>
          <div className={s.infoItem}><span className={s.infoLabel}>Category</span><span className={s.infoValue}>{scheme.category}</span></div>
          <div className={s.infoItem}><span className={s.infoLabel}>Type</span><span className={s.infoValue}>{scheme.scheme_type}</span></div>
          {scheme.launch_date && <div className={s.infoItem}><span className={s.infoLabel}>Launch Date</span><span className={s.infoValue}>{scheme.launch_date}</span></div>}
          {scheme.closure_date && <div className={s.infoItem}><span className={s.infoLabel}>Closure Date</span><span className={s.infoValue}>{scheme.closure_date}</span></div>}
          {scheme.isin_growth && <div className={s.infoItem}><span className={s.infoLabel}>ISIN Growth</span><span className={s.infoValueMono}>{scheme.isin_growth}</span></div>}
          {scheme.isin_dividend && <div className={s.infoItem}><span className={s.infoLabel}>ISIN Dividend</span><span className={s.infoValueMono}>{scheme.isin_dividend}</span></div>}
          {scheme.min_amount && <div className={s.infoItem}><span className={s.infoLabel}>Min Amount</span><span className={s.infoValue}>{'\u20B9'}{Number(scheme.min_amount).toLocaleString()}</span></div>}
        </div>
      </div>

      {/* ═══ VaNi ═══ */}
      <div className={s.vaniSection}>
        <div className={s.vaniHeader}><span>{'\u2728'}</span> VaNi Analysis</div>
        {!hasData && <div className={s.vaniRow}>{'\u26A0\uFE0F'} No NAV data. Click "Download Full History" to fetch all available data from MFAPI.</div>}
        {hasData && !hasMetrics && <div className={s.vaniRow}>{'\u{1F9EE}'} NAV data available but metrics not calculated. Click "Calculate Metrics" for returns, volatility, and risk analysis.</div>}
        {hasData && hasMetrics && metrics?.cagr != null && <div className={s.vaniRow}>{metrics.cagr >= 0 ? '\u{1F4C8}' : '\u{1F4C9}'} CAGR: {fmtPct(metrics.cagr)} — {metrics.cagr >= 15 ? 'Strong performer.' : metrics.cagr >= 10 ? 'Moderate growth.' : metrics.cagr >= 0 ? 'Below benchmark.' : 'Negative returns.'}</div>}
        {gaps.length > 0 && <div className={s.vaniRow}>{'\u{1F527}'} {gaps.length} data gap{gaps.length !== 1 ? 's' : ''} detected. Click "Fill Gaps" to download missing dates from MFAPI.</div>}
        {isEnded && <div className={s.vaniRow}>{'\u{1F6D1}'} This scheme has ended (closure: {scheme.closure_date}). Daily downloads are disabled.</div>}
        {hasData && hasMetrics && gaps.length === 0 && !isEnded && <div className={s.vaniRow}>{'\u2705'} Complete data, metrics calculated, no gaps. This scheme is fully tracked.</div>}
      </div>
    </div>
  );
}
