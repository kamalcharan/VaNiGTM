'use client';

/**
 * Market Index Detail — /market/indices/[id]
 *
 * Full-screen detail view for a single NSE market index.
 * Shows OHLCV chart (candlestick / line / area) with period selector,
 * key metrics sidebar, and Calculate Metrics CTA.
 *
 * Data sources:
 *   - GET /api/v1/market/indices/:id          — index metadata
 *   - GET /api/v1/market-analysis/metrics/:indexId — latest metrics
 *   - GET /api/v1/market-analysis/index-returns/:indexId — OHLCV time series
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { VdfLoader, VdfEmptyState, VdfStatusBadge, VdfButton, VdfInsightsCard, type Insight } from '@/components/vdf';
import { VdfLineChart } from '@/components/vdf/line-chart/VdfLineChart';
import type { OhlcPoint, ChartType } from '@/components/vdf/line-chart/VdfLineChart';
import s from './market-index-detail.module.css';

/* ── Types ──────────────────────────────────────────────── */

interface MarketIndexMeta {
  id: number;
  index_code: string;
  index_name: string;
  yahoo_symbol: string;
  category: 'broad' | 'sectoral' | 'thematic';
  description: string | null;
  total_records: number;
  earliest_date: string | null;
  latest_date: string | null;
  historical_data_available: boolean;
  last_download_status: 'pending' | 'running' | 'success' | 'failed';
  last_download_at: string | null;
}

interface LatestMetrics {
  trade_date: string;
  last_price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  daily_return: number | null;
  return_1w: number | null;
  return_1m: number | null;
  return_3m: number | null;
  return_6m: number | null;
  return_1y: number | null;
  return_ytd: number | null;
  return_all: number | null;
  sd_7d: number | null;
  sd_21d: number | null;
  sd_6m: number | null;
  sharpe_ratio: number | null;
  max_drawdown: number | null;
  cagr: number | null;
  total_risk: number | null;
  metrics_calculated_at: string | null;
  index_name: string;
  index_code: string;
}

interface OhlcRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adj_close: number | null;
  volume: number | null;
  return_1m: number | null;
  return_1y: number | null;
  daily_return: number | null;
  return_1w: number | null;
}

interface ReturnsResponse {
  index_id: number;
  granularity: string;
  total_records: number;
  data: OhlcRow[];
}

/* ── Period config ──────────────────────────────────────── */

type Period = '1W' | '1M' | '3M' | '6M' | '1Y' | 'YTD' | 'ALL';

function periodToQueryParams(period: Period, earliestDate: string | null): Record<string, string> {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const sub = (months: number) => {
    const d = new Date(today);
    d.setMonth(d.getMonth() - months);
    return d;
  };
  switch (period) {
    case '1W': return { start_date: fmt(new Date(today.getTime() - 7 * 86400_000)), end_date: fmt(today) };
    case '1M': return { start_date: fmt(sub(1)),  end_date: fmt(today) };
    case '3M': return { start_date: fmt(sub(3)),  end_date: fmt(today) };
    case '6M': return { start_date: fmt(sub(6)),  end_date: fmt(today) };
    case '1Y': return { start_date: fmt(sub(12)), end_date: fmt(today) };
    case 'YTD': return { start_date: `${today.getFullYear()}-01-01`, end_date: fmt(today) };
    case 'ALL': return earliestDate ? { start_date: earliestDate, end_date: fmt(today) } : {};
    default: return {};
  }
}

/* ── Formatters ─────────────────────────────────────────── */

function fmtNum(v: number | null, decimals = 2): string {
  if (v == null) return '—';
  return v.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPct(v: number | null): string {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function returnClass(v: number | null): string {
  if (v == null) return '';
  return v >= 0 ? s.positive : s.negative;
}

/* ── VaNi: rule-based insights from calculated metrics ─── */

function deriveVaNiInsights(m: LatestMetrics): Insight[] {
  const insights: Insight[] = [];

  // 1. Short-term vs long-term momentum
  if (m.return_1m != null && m.return_1y != null) {
    const r1m = Number(m.return_1m);
    const r1y = Number(m.return_1y);
    if (r1m > 0 && r1y > 0 && r1m > r1y / 8) {
      insights.push({ icon: '📈', text: `Strong monthly momentum: ${fmtPct(r1m)} (1M) vs ${fmtPct(r1y)} annual` });
    } else if (r1m < 0 && r1y > 0) {
      insights.push({ icon: '⚠️', text: `Short-term pullback (${fmtPct(r1m)} 1M) within a positive annual trend (${fmtPct(r1y)})` });
    } else if (r1m > 0 && r1y < 0) {
      insights.push({ icon: '🔄', text: `Recent recovery (${fmtPct(r1m)} 1M) from an annual loss (${fmtPct(r1y)})` });
    } else if (r1m < 0 && r1y < 0) {
      insights.push({ icon: '📉', text: `Continued weakness: ${fmtPct(r1m)} this month, ${fmtPct(r1y)} over 1Y` });
    }
  }

  // 2. Sharpe ratio — risk-adjusted return quality
  if (m.sharpe_ratio != null) {
    const s = Number(m.sharpe_ratio);
    if (s > 1.5) {
      insights.push({ icon: '⭐', text: `Excellent risk-adjusted return — Sharpe ${s.toFixed(2)} (>1.5 is strong alpha)` });
    } else if (s > 0.5) {
      insights.push({ icon: '✅', text: `Adequate risk-adjusted return — Sharpe ${s.toFixed(2)}` });
    } else if (s < 0) {
      insights.push({ icon: '🔴', text: `Return below risk-free rate — Sharpe ${s.toFixed(2)}, reconsider allocation` });
    } else {
      insights.push({ icon: '🟡', text: `Below-average risk-adjusted return — Sharpe ${s.toFixed(2)} (target >0.5)` });
    }
  }

  // 3. Max drawdown — downside risk signal
  if (m.max_drawdown != null) {
    const dd = Math.abs(Number(m.max_drawdown)) * 100;
    if (dd > 40) {
      insights.push({ icon: '🌪️', text: `High historical risk: max drawdown ${dd.toFixed(1)}% — significant tail risk present` });
    } else if (dd > 20) {
      insights.push({ icon: '📐', text: `Moderate drawdown history: ${dd.toFixed(1)}% peak-to-trough` });
    } else if (dd > 0) {
      insights.push({ icon: '🛡️', text: `Historically resilient: max drawdown only ${dd.toFixed(1)}%` });
    }
  }

  // 4. CAGR — long-term compounding power
  if (m.cagr != null) {
    const cagr = Number(m.cagr) * 100;
    if (cagr > 15) {
      insights.push({ icon: '🚀', text: `Strong long-term compounder: CAGR ${fmtPct(cagr)} — beats typical equity benchmarks` });
    } else if (cagr > 10) {
      insights.push({ icon: '📈', text: `Solid long-run performance: CAGR ${fmtPct(cagr)}` });
    } else if (cagr > 0) {
      insights.push({ icon: '🟡', text: `Modest CAGR ${fmtPct(cagr)} — verify real returns after inflation` });
    } else {
      insights.push({ icon: '🔴', text: `Negative CAGR (${fmtPct(cagr)}) — long-term wealth erosion at this level` });
    }
  }

  // 5. Volatility vs return trade-off
  if (m.total_risk != null && m.return_1y != null) {
    const vol = Number(m.total_risk) * 100;
    const r1y = Number(m.return_1y);
    if (vol > 30 && r1y < 5) {
      insights.push({ icon: '⚠️', text: `Poor risk/reward: ${vol.toFixed(1)}% ann. volatility for only ${fmtPct(r1y)} 1Y return` });
    } else if (vol < 12 && r1y > 10) {
      insights.push({ icon: '💎', text: `Efficient index: low volatility (${vol.toFixed(1)}%) with strong 1Y return (${fmtPct(r1y)})` });
    }
  }

  return insights.slice(0, 4);
}

/* ─────────────────────────────────────────────────────────
   PAGE COMPONENT
   ───────────────────────────────────────────────────────── */

export default function MarketIndexDetailPage() {
  const router  = useRouter();
  const params  = useParams();
  const indexId = params.id as string;
  const { showToast } = useToast();

  /* ── State ───────────────────────────────────────────── */
  const [meta,    setMeta]    = useState<MarketIndexMeta | null>(null);
  const [metrics, setMetrics] = useState<LatestMetrics | null>(null);
  const [series,  setSeries]  = useState<OhlcRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [period,  setPeriod]  = useState<Period>('1Y');
  const [chartType, setChartType] = useState<ChartType>('candlestick');
  const [showVolume, setShowVolume] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [seriesLoading, setSeriesLoading] = useState(false);

  /* ── Load index meta + latest metrics ────────────────── */
  const loadMeta = useCallback(async () => {
    try {
      const [metaRes, metricsRes] = await Promise.allSettled([
        apiFetch<MarketIndexMeta>(API.market.indexDetail, { pathParams: { id: indexId } }),
        apiFetch<LatestMetrics>(API.marketAnalysis.metrics, { pathParams: { indexId } }),
      ]);

      if (metaRes.status === 'fulfilled') setMeta(metaRes.value);
      else {
        showToast({ message: 'Index not found', type: 'error' });
        router.push('/market/history');
        return;
      }

      if (metricsRes.status === 'fulfilled') setMetrics(metricsRes.value);
      // metrics may not exist yet — not an error
    } catch (err: any) {
      showToast({ message: err.message || 'Failed to load index', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [indexId, router, showToast]);

  /* ── Load chart series for the selected period ────────── */
  const loadSeries = useCallback(async (p: Period, m: MarketIndexMeta) => {
    setSeriesLoading(true);
    try {
      const qp = periodToQueryParams(p, m.earliest_date);
      const granularity = p === '1W' || p === '1M' ? 'daily' : p === 'ALL' ? 'weekly' : 'daily';
      const res = await apiFetch<ReturnsResponse>(
        API.marketAnalysis.indexReturns,
        { pathParams: { indexId }, queryParams: { ...qp, granularity } },
      );
      setSeries(res.data);
    } catch (err: any) {
      showToast({ message: err.message || 'Failed to load chart data', type: 'error' });
    } finally {
      setSeriesLoading(false);
    }
  }, [indexId, showToast]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => {
    if (meta) loadSeries(period, meta);
  }, [meta, period, loadSeries]);

  /* ── Calculate metrics ────────────────────────────────── */
  const handleCalculate = useCallback(async () => {
    if (!meta) return;
    setCalculating(true);
    try {
      const res = await apiFetch<any>(
        API.marketAnalysis.calculate,
        { pathParams: { indexId }, body: { force: true } },
      );
      if (res.skipped) {
        showToast({ message: 'Metrics are fresh (< 1 hour). Pass force to recalculate.', type: 'info' });
      } else {
        showToast({ message: `Metrics calculated: ${res.records_updated} records`, type: 'success' });
        // Reload metrics
        const metricsRes = await apiFetch<LatestMetrics>(
          API.marketAnalysis.metrics, { pathParams: { indexId } },
        );
        setMetrics(metricsRes);
      }
    } catch (err: any) {
      showToast({ message: err.message || 'Calculation failed', type: 'error' });
    } finally {
      setCalculating(false);
    }
  }, [meta, indexId, showToast]);

  /* ── Derived chart data ───────────────────────────────── */
  const ohlcPoints: OhlcPoint[] = series.map((d: OhlcRow) => ({
    date:   d.date,
    open:   Number(d.open),
    high:   Number(d.high),
    low:    Number(d.low),
    close:  Number(d.close),
    volume: d.volume != null ? Number(d.volume) : undefined,
  }));

  const lineData = series.map((d: OhlcRow) => ({ date: d.date, value: Number(d.close) }));

  /* ── Price change ─────────────────────────────────────── */
  const priceChange = series.length >= 2
    ? Number(series[series.length - 1].close) - Number(series[0].close)
    : null;
  const priceChangePct = series.length >= 2 && Number(series[0].close) !== 0
    ? (priceChange! / Number(series[0].close)) * 100
    : null;

  /* ── Status ───────────────────────────────────────────── */
  function metaStatus(): 'success' | 'warning' | 'danger' | 'muted' {
    if (!meta?.historical_data_available) return 'muted';
    if (meta.last_download_status === 'failed') return 'danger';
    if (!metrics) return 'warning';
    return 'success';
  }

  /* ── Render ───────────────────────────────────────────── */
  if (loading) return <VdfLoader message="Loading index detail..." />;
  if (!meta) return (
    <VdfEmptyState icon="📊" title="Index not found" description="This index does not exist."
      action={<button className={s.calcBtnSm} onClick={() => router.push('/market/history')}>Back to Market History</button>} />
  );

  const PERIODS: Period[] = ['1W', '1M', '3M', '6M', '1Y', 'YTD', 'ALL'];
  const CHART_TYPES: { type: ChartType; label: string }[] = [
    { type: 'candlestick', label: 'Candle' },
    { type: 'line',        label: 'Line'   },
    { type: 'area',        label: 'Area'   },
  ];

  const latestClose = series.length > 0 ? Number(series[series.length - 1].close) : (metrics?.last_price ?? null);
  const latestOhlc  = series.length > 0 ? series[series.length - 1] : null;

  return (
    <div className={s.page}>

      {/* ── Back nav ──────────────────────────────────── */}
      <button className={s.backBtn} onClick={() => router.push('/market/history')}>
        ← Market History
      </button>

      {/* ── Header strip ──────────────────────────────── */}
      <div className={s.headerStrip}>
        <div className={s.headerMeta}>
          <div className={s.indexName}>{meta.index_name}</div>
          <div className={s.indexSub}>
            <span className={s.code}>{meta.index_code}</span>
            <span className={s.symbol}>{meta.yahoo_symbol}</span>
            <VdfStatusBadge variant={metaStatus()} label={
              !meta.historical_data_available ? 'No Data'
              : meta.last_download_status === 'failed' ? 'Download Failed'
              : !metrics ? 'Needs Metrics'
              : 'Ready'
            } />
          </div>
        </div>

        {latestClose != null && (
          <div className={s.priceBlock}>
            <div className={s.latestPrice}>₹{fmtNum(latestClose)}</div>
            {priceChange != null && (
              <div className={`${s.priceChange} ${returnClass(priceChangePct)}`}>
                {priceChange >= 0 ? '+' : ''}{fmtNum(priceChange)} ({fmtPct(priceChangePct)}) {period}
              </div>
            )}
          </div>
        )}

        <div className={s.headerActions}>
          <button
            className={s.calcBtn}
            disabled={calculating || !meta.historical_data_available}
            onClick={handleCalculate}
          >
            {calculating ? <span className={s.btnSpinner} /> : null}
            {calculating ? 'Calculating...' : metrics ? 'Recalculate Metrics' : 'Calculate Metrics'}
          </button>
        </div>
      </div>

      {/* ── OHLC bar (today's OHLCV) ──────────────────── */}
      {latestOhlc && (
        <div className={s.ohlcBar}>
          <span className={s.ohlcItem}><span className={s.ohlcKey}>O</span><span>{fmtNum(Number(latestOhlc.open))}</span></span>
          <span className={s.ohlcItem}><span className={s.ohlcKey}>H</span><span className={s.ohlcHigh}>{fmtNum(Number(latestOhlc.high))}</span></span>
          <span className={s.ohlcItem}><span className={s.ohlcKey}>L</span><span className={s.ohlcLow}>{fmtNum(Number(latestOhlc.low))}</span></span>
          <span className={s.ohlcItem}><span className={s.ohlcKey}>C</span><span className={Number(latestOhlc.close) >= Number(latestOhlc.open) ? s.ohlcUp : s.ohlcDown}>{fmtNum(Number(latestOhlc.close))}</span></span>
          {latestOhlc.volume != null && (
            <span className={s.ohlcItem}><span className={s.ohlcKey}>Vol</span>
              <span className={s.ohlcVol}>
                {Number(latestOhlc.volume) >= 1_000_000
                  ? `${(Number(latestOhlc.volume) / 1_000_000).toFixed(2)}M`
                  : Number(latestOhlc.volume) >= 1_000
                  ? `${(Number(latestOhlc.volume) / 1_000).toFixed(1)}K`
                  : String(latestOhlc.volume)}
              </span>
            </span>
          )}
          <span className={s.ohlcDate}>{fmtDate(latestOhlc.date)}</span>
        </div>
      )}

      {/* ── Main body: chart + sidebar ─────────────────── */}
      <div className={s.body}>

        {/* ── LEFT: Chart area (70%) ─────────────────── */}
        <div className={s.chartCol}>
          {/* Chart controls */}
          <div className={s.chartControls}>
            {/* Period selector */}
            <div className={s.periodStrip}>
              {PERIODS.map(p => (
                <button
                  key={p}
                  className={period === p ? s.periodBtnActive : s.periodBtn}
                  onClick={() => setPeriod(p)}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Chart type selector */}
            <div className={s.chartTypeStrip}>
              {CHART_TYPES.map(ct => (
                <button
                  key={ct.type}
                  className={chartType === ct.type ? s.chartTypeBtnActive : s.chartTypeBtn}
                  onClick={() => setChartType(ct.type)}
                >
                  {ct.label}
                </button>
              ))}
            </div>

            {/* Volume toggle — only for candlestick */}
            {chartType === 'candlestick' && (
              <button
                className={showVolume ? s.volToggleActive : s.volToggle}
                onClick={() => setShowVolume(v => !v)}
              >
                Vol
              </button>
            )}
          </div>

          {/* Chart */}
          <div className={s.chartWrap}>
            {seriesLoading ? (
              <div className={s.chartLoadingOverlay}>
                <span className={s.chartSpinner} />
              </div>
            ) : series.length < 2 ? (
              <VdfEmptyState
                icon="📉"
                title="No chart data"
                description={meta.historical_data_available
                  ? `No data in the selected period (${period})`
                  : 'Download historical data first'}
              />
            ) : (
              <VdfLineChart
                data={lineData}
                ohlcData={ohlcPoints}
                height={380}
                chartType={chartType}
                showVolume={showVolume}
                containerId={`market-chart-${indexId}`}
                formatValue={v => `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              />
            )}
          </div>

          {/* Data range info */}
          {meta.earliest_date && (
            <div className={s.rangeInfo}>
              Data: {fmtDate(meta.earliest_date)} — {fmtDate(meta.latest_date)} &middot; {meta.total_records.toLocaleString()} records
            </div>
          )}
        </div>

        {/* ── RIGHT: Metrics sidebar (30%) ──────────────── */}
        <div className={s.sidebar}>

          {/* Returns section */}
          <div className={s.metricSection}>
            <div className={s.metricSectionTitle}>Returns</div>
            <div className={s.metricsGrid}>
              <MetricRow label="1 Day"  value={fmtPct(metrics?.daily_return ?? null)} cls={returnClass(metrics?.daily_return ?? null)} />
              <MetricRow label="1 Week" value={fmtPct(metrics?.return_1w ?? null)}    cls={returnClass(metrics?.return_1w ?? null)} />
              <MetricRow label="1 Month" value={fmtPct(metrics?.return_1m ?? null)}   cls={returnClass(metrics?.return_1m ?? null)} />
              <MetricRow label="3 Months" value={fmtPct(metrics?.return_3m ?? null)}  cls={returnClass(metrics?.return_3m ?? null)} />
              <MetricRow label="6 Months" value={fmtPct(metrics?.return_6m ?? null)}  cls={returnClass(metrics?.return_6m ?? null)} />
              <MetricRow label="1 Year"  value={fmtPct(metrics?.return_1y ?? null)}   cls={returnClass(metrics?.return_1y ?? null)} />
              <MetricRow label="YTD"     value={fmtPct(metrics?.return_ytd ?? null)}  cls={returnClass(metrics?.return_ytd ?? null)} />
              <MetricRow label="All Time" value={fmtPct(metrics?.return_all ?? null)} cls={returnClass(metrics?.return_all ?? null)} />
            </div>
          </div>

          {/* Risk section */}
          <div className={s.metricSection}>
            <div className={s.metricSectionTitle}>Risk Metrics</div>
            <div className={s.metricsGrid}>
              <MetricRow label="SD 7d"   value={metrics?.sd_7d  != null ? `${Number(metrics.sd_7d).toFixed(4)}` : '—'} />
              <MetricRow label="SD 21d"  value={metrics?.sd_21d != null ? `${Number(metrics.sd_21d).toFixed(4)}` : '—'} />
              <MetricRow label="SD 6m"   value={metrics?.sd_6m  != null ? `${Number(metrics.sd_6m).toFixed(4)}` : '—'} />
              <MetricRow label="Ann. Volatility" value={metrics?.total_risk != null ? `${(Number(metrics.total_risk) * 100).toFixed(2)}%` : '—'} />
              <MetricRow label="Sharpe Ratio" value={metrics?.sharpe_ratio != null ? Number(metrics.sharpe_ratio).toFixed(3) : '—'} />
              <MetricRow
                label="Max Drawdown"
                value={metrics?.max_drawdown != null ? `${(Number(metrics.max_drawdown) * 100).toFixed(2)}%` : '—'}
                cls={metrics?.max_drawdown != null ? s.negative : ''}
              />
              <MetricRow label="CAGR" value={fmtPct(metrics?.cagr != null ? Number(metrics.cagr) * 100 : null)}
                cls={returnClass(metrics?.cagr != null ? Number(metrics.cagr) : null)} />
            </div>
          </div>

          {/* VaNi — rule-based inference from metrics */}
          {metrics && (() => {
            const insights = deriveVaNiInsights(metrics);
            return insights.length > 0
              ? <VdfInsightsCard title="VaNi Analysis" insights={insights} />
              : null;
          })()}

          {/* Last metrics calc timestamp */}
          {metrics?.metrics_calculated_at && (
            <div className={s.metricCalcInfo}>
              Metrics as of {fmtDate(metrics.metrics_calculated_at)}
            </div>
          )}

          {/* No metrics placeholder */}
          {!metrics && meta.historical_data_available && (
            <div className={s.noMetrics}>
              <div className={s.noMetricsIcon}>📐</div>
              <div className={s.noMetricsText}>Metrics not calculated yet</div>
              <button
                className={s.calcBtnSm}
                disabled={calculating}
                onClick={handleCalculate}
              >
                {calculating ? <span className={s.btnSpinner} /> : null}
                Calculate Now
              </button>
            </div>
          )}

          {/* Download info section */}
          <div className={s.metricSection}>
            <div className={s.metricSectionTitle}>Data Info</div>
            <div className={s.metricsGrid}>
              <MetricRow label="Category" value={meta.category.charAt(0).toUpperCase() + meta.category.slice(1)} />
              <MetricRow label="Records"  value={meta.total_records.toLocaleString()} />
              <MetricRow label="From"     value={fmtDate(meta.earliest_date)} />
              <MetricRow label="Latest"   value={fmtDate(meta.latest_date)} />
              <MetricRow label="Status"   value={meta.last_download_status} />
              {meta.last_download_at && (
                <MetricRow label="Last Download" value={fmtDate(meta.last_download_at)} />
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

/* ── Small helper component ──────────────────────────────── */

function MetricRow({ label, value, cls = '' }: { label: string; value: string; cls?: string }) {
  return (
    <div className={s.metricRow}>
      <span className={s.metricLabel}>{label}</span>
      <span className={`${s.metricValue} ${cls}`}>{value}</span>
    </div>
  );
}
