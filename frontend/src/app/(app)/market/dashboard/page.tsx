'use client';

/**
 * Market Dashboard — /market/dashboard
 *
 * Performance heatmap + KPI cards for all NSE market indices.
 * Data: GET /api/v1/market-analysis/dashboard-statistics?time_period=1y
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { VdfLoader, VdfEmptyState, VdfKpiCard, VdfButton, VdfInsightsCard, type Insight } from '@/components/vdf';
import f from '@/styles/forms.module.css';
import s from './market-dashboard.module.css';

/* ── Types ──────────────────────────────────────────────── */

type TimePeriod = '1m' | '3m' | '6m' | '1y';
type CategoryFilter = 'all' | 'broad' | 'sectoral' | 'thematic';

interface KpiStat {
  index_id: number;
  index_name: string;
  index_code: string;
  return_value?: number;
  volatility_value?: number;
}

interface HeatmapCell {
  index_id: number;
  index_name: string;
  index_code: string;
  category: 'broad' | 'sectoral' | 'thematic';
  return_value: number | null;
  volatility_value: number | null;
}

interface DashboardStats {
  time_period: string;
  best_performer: KpiStat | null;
  worst_performer: KpiStat | null;
  most_volatile: KpiStat | null;
  market_breadth: number;
  total_indices_analyzed: number;
  indices_up: number;
  indices_down: number;
  heatmap: HeatmapCell[];
}

/* ── Color scale ─────────────────────────────────────────── */

function heatColor(v: number | null): { bg: string; fg: string; border: string } {
  if (v == null) return { bg: 'var(--color-surface)', fg: 'var(--color-muted)', border: 'var(--glass-border)' };
  if (v >=  15) return { bg: 'rgba(16,185,129,0.30)', fg: '#10b981', border: 'rgba(16,185,129,0.45)' };
  if (v >=   8) return { bg: 'rgba(16,185,129,0.18)', fg: '#10b981', border: 'rgba(16,185,129,0.28)' };
  if (v >=   3) return { bg: 'rgba(16,185,129,0.09)', fg: 'var(--color-success)', border: 'rgba(16,185,129,0.16)' };
  if (v >=   0) return { bg: 'rgba(16,185,129,0.04)', fg: 'var(--color-fg)', border: 'rgba(16,185,129,0.10)' };
  if (v >=  -3) return { bg: 'rgba(239,68,68,0.04)',  fg: 'var(--color-fg)', border: 'rgba(239,68,68,0.10)' };
  if (v >=  -8) return { bg: 'rgba(239,68,68,0.09)',  fg: 'var(--color-danger)', border: 'rgba(239,68,68,0.16)' };
  if (v >= -15) return { bg: 'rgba(239,68,68,0.18)',  fg: 'var(--color-danger)', border: 'rgba(239,68,68,0.28)' };
  return           { bg: 'rgba(239,68,68,0.30)',  fg: '#ef4444', border: 'rgba(239,68,68,0.45)' };
}

/* ── Formatters ─────────────────────────────────────────── */

// PG returns NUMERIC as strings — coerce with Number()
function fmtPct(v: number | string | null | undefined): string {
  if (v == null) return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function fmtVol(v: number | string | null | undefined): string {
  if (v == null) return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  return `${(n * 100).toFixed(2)}%`;
}

function truncate(str: string, max: number): string {
  return str.length <= max ? str : str.slice(0, max - 1) + '…';
}

/* ── VaNi: market-level insights from dashboard stats ─── */

function deriveMarketInsights(stats: DashboardStats, period: TimePeriod): Insight[] {
  const insights: Insight[] = [];
  const breadth = stats.market_breadth;
  const total   = stats.total_indices_analyzed;
  const label   = PERIOD_LABELS[period];

  // 1. Breadth signal
  if (total > 0) {
    if (breadth >= 70) {
      insights.push({ icon: '🟢', text: `Broad market rally: ${breadth}% of ${total} indices positive over ${label}` });
    } else if (breadth >= 50) {
      insights.push({ icon: '🟡', text: `Mixed market: ${breadth}% of ${total} indices positive over ${label}` });
    } else if (breadth >= 30) {
      insights.push({ icon: '🔴', text: `Market weakness: only ${breadth}% of ${total} indices positive over ${label}` });
    } else {
      insights.push({ icon: '⚠️', text: `Broad decline: only ${breadth}% of ${total} indices positive over ${label}` });
    }
  }

  // 2. Best performer context
  if (stats.best_performer?.return_value != null) {
    const rv = Number(stats.best_performer.return_value);
    if (rv > 30) {
      insights.push({ icon: '🚀', text: `Standout: ${stats.best_performer.index_code} +${rv.toFixed(2)}% — strong sectoral outperformance` });
    } else if (rv > 15) {
      insights.push({ icon: '📈', text: `Top performer: ${stats.best_performer.index_code} +${rv.toFixed(2)}% over ${label}` });
    }
  }

  // 3. Worst performer signal
  if (stats.worst_performer?.return_value != null) {
    const rv = Number(stats.worst_performer.return_value);
    if (rv < -20) {
      insights.push({ icon: '🔻', text: `Significant laggard: ${stats.worst_performer.index_code} ${rv.toFixed(2)}% — watch for mean reversion or structural weakness` });
    } else if (rv < -10) {
      insights.push({ icon: '📉', text: `Underperformer: ${stats.worst_performer.index_code} ${rv.toFixed(2)}% over ${label}` });
    }
  }

  // 4. Divergence: up vs down count
  if (stats.indices_up > 0 && stats.indices_down > 0) {
    const ratio = stats.indices_up / Math.max(stats.indices_down, 1);
    if (ratio >= 3) {
      insights.push({ icon: '💹', text: `Strong advance/decline ratio: ${stats.indices_up} up vs ${stats.indices_down} down` });
    } else if (ratio <= 0.5) {
      insights.push({ icon: '⬇️', text: `Negative advance/decline ratio: ${stats.indices_up} up vs ${stats.indices_down} down` });
    }
  }

  return insights.slice(0, 4);
}

/* ─────────────────────────────────────────────────────────
   PAGE
   ───────────────────────────────────────────────────────── */

const PERIOD_LABELS: Record<TimePeriod, string> = {
  '1m': '1M', '3m': '3M', '6m': '6M', '1y': '1Y',
};

export default function MarketDashboardPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<TimePeriod>('1y');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [periodLoading, setPeriodLoading] = useState(false);

  const load = useCallback(async (p: TimePeriod, initial = false) => {
    if (!initial) setPeriodLoading(true);
    try {
      const res = await apiFetch<DashboardStats>(
        API.marketAnalysis.dashboardStatistics,
        { queryParams: { time_period: p } },
      );
      setStats(res);
    } catch (err: any) {
      showToast({ message: err.message || 'Failed to load market dashboard', type: 'error' });
    } finally {
      setLoading(false);
      setPeriodLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(period, true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePeriod = (p: TimePeriod) => { setPeriod(p); load(p); };

  /* ── Filtered heatmap ─────────────────────────────── */
  const heatmap = (stats?.heatmap ?? []).filter(
    (c: HeatmapCell) => category === 'all' || c.category === category,
  );

  /* ── Category averages ────────────────────────────── */
  const categoryAvg = (['broad', 'sectoral', 'thematic'] as const).map(cat => {
    const cells = (stats?.heatmap ?? []).filter(
      (c: HeatmapCell) => c.category === cat && c.return_value != null,
    );
    const avg = cells.length > 0
      ? cells.reduce((acc: number, c: HeatmapCell) => acc + (c.return_value ?? 0), 0) / cells.length
      : null;
    return { cat, avg, count: cells.length };
  });

  if (loading) return <VdfLoader message="Loading market dashboard..." />;

  const breadth = Math.max(0, Math.min(100, stats?.market_breadth ?? 0));
  const breadthColor = breadth >= 60
    ? 'var(--color-success)'
    : breadth >= 40 ? 'var(--color-warning)'
    : 'var(--color-danger)';

  return (
    <div className={s.page}>

      {/* ── Header ──────────────────────────────────── */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <h1>Market Dashboard</h1>
          <p>NSE index performance heatmap &amp; KPIs</p>
        </div>
        <div className={s.periodStrip}>
          {(['1m', '3m', '6m', '1y'] as TimePeriod[]).map(p => (
            <button
              key={p}
              className={period === p ? f.filterPillActive : f.filterPill}
              onClick={() => handlePeriod(p)}
              disabled={periodLoading}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI cards ─────────────────────────────── */}
      <div className={s.kpiGrid}>

        {/* Best performer */}
        <VdfKpiCard
          title="Best Performer"
          icon="▲"
          iconColor="var(--color-success)"
          onClick={stats?.best_performer ? () => router.push(`/market/indices/${stats!.best_performer!.index_id}`) : undefined}
        >
          {stats?.best_performer ? (
            <>
              <span className={s.kpiName}>{truncate(stats.best_performer.index_name, 36)}</span>
              <span className={s.kpiCode}>{stats.best_performer.index_code}</span>
              <span className={s.kpiValue} style={{ color: 'var(--color-success)' }}>
                {fmtPct(stats.best_performer.return_value)}
              </span>
            </>
          ) : <span className={s.kpiEmpty}>No data</span>}
        </VdfKpiCard>

        {/* Worst performer */}
        <VdfKpiCard
          title="Worst Performer"
          icon="▼"
          iconColor="var(--color-danger)"
          onClick={stats?.worst_performer ? () => router.push(`/market/indices/${stats!.worst_performer!.index_id}`) : undefined}
        >
          {stats?.worst_performer ? (
            <>
              <span className={s.kpiName}>{truncate(stats.worst_performer.index_name, 36)}</span>
              <span className={s.kpiCode}>{stats.worst_performer.index_code}</span>
              <span className={s.kpiValue} style={{ color: 'var(--color-danger)' }}>
                {fmtPct(stats.worst_performer.return_value)}
              </span>
            </>
          ) : <span className={s.kpiEmpty}>No data</span>}
        </VdfKpiCard>

        {/* Most volatile */}
        <VdfKpiCard
          title="Most Volatile"
          icon="⚡"
          iconColor="var(--color-warning)"
          onClick={stats?.most_volatile ? () => router.push(`/market/indices/${stats!.most_volatile!.index_id}`) : undefined}
        >
          {stats?.most_volatile ? (
            <>
              <span className={s.kpiName}>{truncate(stats.most_volatile.index_name, 36)}</span>
              <span className={s.kpiCode}>{stats.most_volatile.index_code}</span>
              <span className={s.kpiValue} style={{ color: 'var(--color-warning)' }}>
                {fmtVol(stats.most_volatile.volatility_value)}
              </span>
              <span className={s.kpiValueLabel}>Ann. Volatility</span>
            </>
          ) : <span className={s.kpiEmpty}>No data</span>}
        </VdfKpiCard>

        {/* Market breadth */}
        <VdfKpiCard title="Market Breadth" icon="◈" iconColor={breadthColor}>
          <span className={s.kpiValue} style={{ color: breadthColor, fontSize: '1.85rem' }}>
            {breadth}%
          </span>
          <div className={s.breadthBar}>
            <div className={s.breadthFill} style={{ width: `${breadth}%`, background: breadthColor }} />
          </div>
          <div className={s.breadthMeta}>
            <span style={{ color: 'var(--color-success)' }}>▲ {stats?.indices_up ?? 0}</span>
            <span style={{ color: 'var(--color-muted)', fontSize: '0.68rem' }}>{stats?.total_indices_analyzed ?? 0} analyzed</span>
            <span style={{ color: 'var(--color-danger)' }}>{stats?.indices_down ?? 0} ▼</span>
          </div>
        </VdfKpiCard>
      </div>

      {/* ── Category summary ─────────────────────── */}
      <div className={s.categoryRow}>
        {categoryAvg.map(({ cat, avg, count }) => {
          const col = heatColor(avg);
          return (
            <div key={cat} className={s.catCard} style={{ borderColor: col.border }}>
              <span className={s.catLabel}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
              <span className={s.catValue} style={{ color: col.fg }}>{fmtPct(avg)}</span>
              <span className={s.catCount}>{count} indices</span>
            </div>
          );
        })}
      </div>

      {/* ── VaNi market insights ─────────────────── */}
      {stats && (() => {
        const insights = deriveMarketInsights(stats, period);
        return insights.length > 0
          ? <VdfInsightsCard title="VaNi Market Pulse" insights={insights} />
          : null;
      })()}

      {/* ── Heatmap section ──────────────────────── */}
      <div className={s.heatmapSection}>
        <div className={s.heatmapHeader}>
          <span className={s.heatmapTitle}>
            Performance Heatmap
            {periodLoading && <span className={s.refreshDot} />}
          </span>

          {/* Category tabs */}
          <div className={s.catTabs}>
            {(['all', 'broad', 'sectoral', 'thematic'] as CategoryFilter[]).map(c => (
              <button
                key={c}
                className={category === c ? f.filterPillActive : f.filterPill}
                onClick={() => setCategory(c)}
              >
                {c === 'all' ? 'All' : c.charAt(0).toUpperCase() + c.slice(1)}
                {' '}
                <span style={{ opacity: 0.65, fontSize: '0.68rem' }}>
                  {c === 'all'
                    ? stats?.heatmap.length
                    : stats?.heatmap.filter((h: HeatmapCell) => h.category === c).length}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Color legend */}
        <div className={s.legend}>
          {[
            { label: '< −15%', bg: 'rgba(239,68,68,0.30)',  fg: '#ef4444' },
            { label: '−8%',    bg: 'rgba(239,68,68,0.18)',  fg: 'var(--color-danger)' },
            { label: '−3%',    bg: 'rgba(239,68,68,0.09)',  fg: 'var(--color-danger)' },
            { label: '0',      bg: 'var(--color-surface)',  fg: 'var(--color-muted)' },
            { label: '+3%',    bg: 'rgba(16,185,129,0.09)', fg: 'var(--color-success)' },
            { label: '+8%',    bg: 'rgba(16,185,129,0.18)', fg: '#10b981' },
            { label: '> +15%', bg: 'rgba(16,185,129,0.30)', fg: '#10b981' },
          ].map(l => (
            <div key={l.label} className={s.legendItem} style={{ background: l.bg }}>
              <span style={{ color: l.fg }}>{l.label}</span>
            </div>
          ))}
        </div>

        {/* Grid */}
        {heatmap.length === 0 ? (
          <VdfEmptyState
            icon="📊"
            title="No metrics data"
            description="Calculate metrics for indices first to see the heatmap."
            action={
              <VdfButton variant="primary" size="sm" onClick={() => router.push('/market/history')}>
                Go to Market History
              </VdfButton>
            }
          />
        ) : (
          <div className={s.heatmap}>
            {heatmap.map((cell: HeatmapCell) => {
              const col = heatColor(cell.return_value);
              return (
                <button
                  key={cell.index_id}
                  className={s.heatCell}
                  style={{ background: col.bg, borderColor: col.border }}
                  onClick={() => router.push(`/market/indices/${cell.index_id}`)}
                  title={`${cell.index_name}\n${fmtPct(cell.return_value)}`}
                >
                  <span className={s.cellCode}>{cell.index_code.replace(/^NIFTY\s*/i, '')}</span>
                  <span className={s.cellReturn} style={{ color: col.fg }}>
                    {fmtPct(cell.return_value)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Footer ───────────────────────────────── */}
      <div className={s.footer}>
        <strong>Market Dashboard</strong> — Returns calculated from OHLCV data.
        Period: <strong>{period.toUpperCase()}</strong>.
        {stats?.total_indices_analyzed != null && (
          <> {stats.total_indices_analyzed} indices &middot; {stats.indices_up} up, {stats.indices_down} down.</>
        )}
        {' '}Data from Yahoo Finance.
      </div>
    </div>
  );
}
