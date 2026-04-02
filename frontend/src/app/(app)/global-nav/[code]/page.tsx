'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { useSkillQuery } from '@/hooks';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { VdfLineChart, VdfStatusBadge, VdfInsightsCard, type Insight } from '@/components/vdf';
import { FullPageLoader } from '@/components/loader';
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
    sd_7d: number | null; sd_21d: number | null; sd_42d: number | null;
    sharpe_ratio: number | null; max_drawdown: number | null; cagr: number | null;
    metrics_calculated_at: string | null; metrics_date: string | null;
  } | null;
  gaps: { gap_after: string; gap_before: string; gap_days: number }[];
  bookmark: { id: number; daily_download_enabled: boolean } | null;
}

interface NavHistoryData { data: { date: string; nav: number }[]; }

type Period = '1y' | '3y' | '5y' | 'max';

function fmtPct(v: number | null): string { return v == null ? '\u2014' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`; }

/* ── Component ─────────────────────────────────────── */

export default function SchemeDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const code = params.code as string;

  const [detail, setDetail] = useState<SchemeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [period, setPeriod] = useState<Period>('1y');
  const [tablePage, setTablePage] = useState(1);
  const PAGE_SIZE = 50;

  const fetchDetail = useCallback(async () => {
    try {
      const data = await apiFetch<SchemeDetail>({ ...API.nav.schemeDetail, path: API.nav.schemeDetail.path.replace(':code', code) });
      setDetail(data);
    } catch { /* fail silently */ }
    finally { setLoading(false); }
  }, [code]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  // Compute date range from period
  const dateFrom = period === 'max' ? '2000-01-01'
    : new Date(Date.now() - ({ '1y': 365, '3y': 1095, '5y': 1825 }[period] || 365) * 86400000).toISOString().split('T')[0];

  const { data: navHistory } = useSkillQuery<NavHistoryData>(
    'market-skill', 'get_nav_history',
    { scheme_code: code, from_date: dateFrom, to_date: new Date().toISOString().split('T')[0] },
    { enabled: !!code },
  );
  const navData = navHistory?.data?.data || [];

  // Paginated table
  const tableData = [...navData].reverse();
  const totalPages = Math.ceil(tableData.length / PAGE_SIZE);
  const pagedData = tableData.slice((tablePage - 1) * PAGE_SIZE, tablePage * PAGE_SIZE);
  useEffect(() => { setTablePage(1); }, [period]);

  // Actions
  async function handleDownloadFull() {
    if (downloading) return; setDownloading('full');
    try {
      const r = await apiFetch<any>({ ...API.nav.downloadScheme, path: API.nav.downloadScheme.path.replace(':code', code) });
      showToast({ message: `${r.records} records downloaded`, type: 'success' }); fetchDetail();
    } catch (err) { showToast({ message: (err as ApiError).message || 'Failed', type: 'error' }); }
    finally { setDownloading(null); }
  }

  async function handleFillGaps() {
    if (downloading) return; setDownloading('gap');
    try {
      const r = await apiFetch<any>({ ...API.nav.downloadGap, path: API.nav.downloadGap.path.replace(':code', code) });
      showToast({ message: r.status === 'no_gaps' ? 'No gaps' : `${r.records_filled} records filled`, type: 'success' }); fetchDetail();
    } catch (err) { showToast({ message: (err as ApiError).message || 'Failed', type: 'error' }); }
    finally { setDownloading(null); }
  }

  async function handleCalculate() {
    if (calculating) return; setCalculating(true);
    try {
      const r = await apiFetch<any>({ ...API.nav.calculateMetrics, path: API.nav.calculateMetrics.path.replace(':code', code) });
      showToast({ message: r.status === 'already_fresh' ? 'Up to date' : `${r.records_updated} updated (${r.execution_ms}ms)`, type: 'success' }); fetchDetail();
    } catch (err) { showToast({ message: (err as ApiError).message || 'Failed', type: 'error' }); }
    finally { setCalculating(false); }
  }

  function handleExport() {
    if (navData.length === 0) return;
    const csv = 'Date,NAV\n' + navData.map(d2 => `${d2.date},${d2.nav}`).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `NAV_${code}_${new Date().toISOString().split('T')[0]}.csv`; a.click();
  }

  if (loading) return <FullPageLoader overlay={false} message={`Loading ${code}...`} />;
  if (!detail) return <div className={s.error}>Scheme not found</div>;

  const { scheme, nav, metrics, gaps, bookmark } = detail;
  const change = metrics?.daily_return;
  const isUp = (change ?? 0) >= 0;

  // VaNi insights
  const insights: Insight[] = [];
  if (nav.total_records === 0) insights.push({ icon: '\u26A0\uFE0F', text: 'No NAV data. Click "Download Full History" to fetch from MFAPI.' });
  if (nav.total_records > 0 && !metrics?.metrics_calculated_at) insights.push({ icon: '\u{1F9EE}', text: 'NAV available but metrics not calculated. Click "Run RPC One-Pass".' });
  if (gaps.length > 0) insights.push({ icon: '\u{1F527}', text: `${gaps.length} data gap${gaps.length !== 1 ? 's' : ''} detected. Click "Fill Gaps" to download missing dates.` });
  if (metrics?.cagr != null) insights.push({ icon: metrics.cagr >= 15 ? '\u{1F4C8}' : '\u{1F4C9}', text: `CAGR: ${fmtPct(metrics.cagr)} \u2014 ${metrics.cagr >= 15 ? 'Strong' : metrics.cagr >= 10 ? 'Moderate' : 'Below benchmark'}.` });
  if (!scheme.active) insights.push({ icon: '\u{1F6D1}', text: `Ended scheme (closure: ${scheme.closure_date}). Daily downloads disabled.` });
  if (nav.total_records > 0 && metrics?.metrics_calculated_at && gaps.length === 0 && scheme.active) insights.push({ icon: '\u2705', text: 'Fully tracked — data complete, metrics calculated, no gaps.' });

  return (
    <div className={s.page}>
      {/* ═══ HEADER ═══ */}
      <div className={s.topRow}>
        <div className={s.topLeft}>
          <button className={s.backBtn} onClick={() => router.push('/global-nav')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 className={s.heroName}>{scheme.scheme_name}</h1>
              <span className={s.typeBadge}>{scheme.scheme_type}</span>
            </div>
            <p className={s.heroMeta}>
              ISIN: <span className={s.heroCode}>{scheme.isin_growth || '\u2014'}</span>
              {' \u00B7 '}Code: <span className={s.heroCode}>{scheme.scheme_code}</span>
              {' \u00B7 '}{scheme.amc}
            </p>
          </div>
        </div>
        <div className={s.topRight}>
          {nav.latest_nav && (
            <>
              <div className={s.navDateLabel}>Latest NAV ({nav.latest_nav_date})</div>
              <div className={s.navBig}>
                {'\u20B9'}{Number(nav.latest_nav).toFixed(4)}
                {change != null && <span className={`${s.navChange} ${isUp ? s.changeUp : s.changeDown}`}>{fmtPct(change)}</span>}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ═══ 2-COLUMN LAYOUT ═══ */}
      <div className={s.columns}>
        {/* LEFT: Chart + Actions */}
        <div className={s.leftCol}>
          {/* Chart panel */}
          <div className={s.chartPanel}>
            <div className={s.chartControls}>
              <div className={s.periodToggle}>
                {(['1y', '3y', '5y', 'max'] as Period[]).map(p => (
                  <button key={p} className={`${s.periodBtn} ${period === p ? s.periodBtnActive : ''}`} onClick={() => setPeriod(p)}>
                    {p === 'max' ? 'Max' : p.toUpperCase()}
                  </button>
                ))}
              </div>
              <div className={s.chartActions}>
                <button className={d.pageBtn} onClick={handleExport} disabled={navData.length === 0}>
                  {'\u{1F4E5}'} Export CSV
                </button>
              </div>
            </div>
            {navData.length >= 2 ? (
              <VdfLineChart data={navData.map(dd => ({ date: dd.date, value: dd.nav }))} height={260} />
            ) : (
              <div className={s.chartEmpty}>No NAV data for this period</div>
            )}
          </div>

          {/* Action cards (2-col) */}
          <div className={s.actionCards}>
            <div className={`${s.actionCard} ${s.actionCardGreen}`}>
              <div className={s.actionCardTitle}>Sync Operations</div>
              <div className={s.actionCardBtns}>
                <button className={`${s.actionBtnFull} ${s.actionBtnPrimary}`} onClick={handleDownloadFull} disabled={!!downloading}>
                  {downloading === 'full' ? 'Downloading...' : '\u{1F4E5} Download Full History'}
                </button>
                <button className={`${s.actionBtnFull} ${s.actionBtnWarn}`} onClick={handleFillGaps} disabled={!!downloading || gaps.length === 0}>
                  {downloading === 'gap' ? 'Filling...' : `\u{1F527} Fill ${gaps.length} Missing Gap${gaps.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
            <div className={`${s.actionCard} ${s.actionCardBlue}`}>
              <div className={s.actionCardTitle}>Compute Metrics</div>
              <div className={s.actionCardBtns}>
                <button className={`${s.actionBtnFull} ${s.actionBtnOutline}`} onClick={handleCalculate} disabled={calculating || nav.total_records === 0}>
                  {calculating ? 'Calculating...' : '\u{1F9EE} Run RPC One-Pass'}
                </button>
              </div>
              {metrics?.metrics_calculated_at && (
                <div className={s.actionHint}>Last calculated: {metrics.metrics_date}</div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Risk Sidebar */}
        <div className={s.rightCol}>
          {/* Risk & Performance */}
          <div className={s.riskPanel}>
            <div className={s.riskTitle}>Risk & Performance</div>

            {/* Sharpe */}
            <div className={s.riskItem}>
              <div className={s.riskItemHeader}>
                <span className={s.riskItemLabel}>Sharpe Ratio</span>
                <span className={s.riskItemTag} style={{ color: 'var(--color-success)' }}>
                  {metrics?.sharpe_ratio != null && metrics.sharpe_ratio > 1 ? 'High Efficiency' : metrics?.sharpe_ratio != null ? 'Moderate' : ''}
                </span>
              </div>
              <div className={s.riskItemBigValue}>
                {metrics?.sharpe_ratio != null ? metrics.sharpe_ratio.toFixed(2) : '\u2014'}
                <span className={s.riskItemSmall}>vs 1.10 Cat. Avg</span>
              </div>
            </div>

            <div className={s.riskDivider} />

            {/* Max Drawdown */}
            <div className={s.riskItem}>
              <div className={s.riskItemHeader}>
                <span className={s.riskItemLabel}>Max Drawdown</span>
                <span className={s.riskItemTag} style={{ color: 'var(--color-danger)' }}>
                  {metrics?.max_drawdown != null ? fmtPct(metrics.max_drawdown) : ''}
                </span>
              </div>
              <div className={s.progressTrack}>
                <div className={s.progressFill} style={{ width: `${Math.min(100, Math.abs(metrics?.max_drawdown ?? 0) * 3)}%` }} />
              </div>
            </div>

            <div className={s.riskDivider} />

            {/* SD + CAGR grid */}
            <div className={s.riskGrid}>
              <div>
                <div className={s.riskGridLabel}>Std Deviation</div>
                <div className={s.riskGridValue}>{metrics?.sd_21d != null ? metrics.sd_21d.toFixed(2) : '\u2014'}</div>
              </div>
              <div>
                <div className={s.riskGridLabel}>CAGR</div>
                <div className={s.riskGridValue}>{metrics?.cagr != null ? fmtPct(metrics.cagr) : '\u2014'}</div>
              </div>
            </div>
          </div>

          {/* Data Audit Trail */}
          <div className={s.auditPanel}>
            <div className={s.auditTitle}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              Data Audit
            </div>
            <div className={s.auditRow}>
              <div className={`${s.auditDot} ${s.auditDotBlue}`} />
              <span className={s.auditText}>Admin imported master from AMFI Excel</span>
            </div>
            {nav.total_records > 0 && (
              <div className={s.auditRow}>
                <div className={`${s.auditDot} ${s.auditDotGreen}`} />
                <span className={s.auditText}>MFAPI historical fetch ({nav.total_records.toLocaleString()} records)</span>
              </div>
            )}
            {gaps.length > 0 && (
              <div className={s.auditRow}>
                <div className={`${s.auditDot} ${s.auditDotAmber}`} />
                <span className={s.auditText}>Gap detected: {gaps.length} missing range{gaps.length !== 1 ? 's' : ''}</span>
              </div>
            )}
            {metrics?.metrics_calculated_at && (
              <div className={s.auditRow}>
                <div className={`${s.auditDot} ${s.auditDotGreen}`} />
                <span className={s.auditText}>Metrics calculated ({metrics.metrics_date})</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ NAV TABLE (below columns) ═══ */}
      {tableData.length > 0 && (
        <div className={s.tableSection}>
          <div className={s.tableHeader}>
            <h3 className={d.sectionTitle}>NAV Data</h3>
            <span className={s.tableCount}>
              {((tablePage - 1) * PAGE_SIZE) + 1}\u2013{Math.min(tablePage * PAGE_SIZE, tableData.length)} of {tableData.length.toLocaleString()}
            </span>
          </div>
          <div className={d.tableWrap} style={{ maxHeight: 400 }}>
            <table className={d.table}>
              <thead><tr><th>Date</th><th>NAV</th><th>Daily Return</th></tr></thead>
              <tbody>
                {pagedData.map((dd, i) => {
                  const prev = i < pagedData.length - 1 ? pagedData[i + 1].nav : null;
                  const ret = prev && prev > 0 ? ((dd.nav - prev) / prev) * 100 : null;
                  return (
                    <tr key={dd.date}>
                      <td>{dd.date}</td>
                      <td className={d.tdMono}>{'\u20B9'}{dd.nav.toFixed(4)}</td>
                      <td className={`${d.tdMono} ${ret != null ? (ret >= 0 ? d.valUp : d.valDown) : ''}`}>{ret != null ? fmtPct(ret) : '\u2014'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className={d.pagination}>
              <button className={d.pageBtn} disabled={tablePage <= 1} onClick={() => setTablePage(1)}>First</button>
              <button className={d.pageBtn} disabled={tablePage <= 1} onClick={() => setTablePage(p => p - 1)}>Prev</button>
              <span className={d.pageInfo}>Page {tablePage} / {totalPages}</span>
              <button className={d.pageBtn} disabled={tablePage >= totalPages} onClick={() => setTablePage(p => p + 1)}>Next</button>
              <button className={d.pageBtn} disabled={tablePage >= totalPages} onClick={() => setTablePage(totalPages)}>Last</button>
            </div>
          )}
        </div>
      )}

      {/* VaNi */}
      <div className={s.vaniSection}>
        <VdfInsightsCard title="VaNi Analysis" insights={insights} />
      </div>
    </div>
  );
}
