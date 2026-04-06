'use client';

/**
 * Market Dashboard — /market/dashboard
 *
 * Performance heatmap + KPI cards for all NSE market indices.
 * Data: GET /api/v1/market-analysis/dashboard-statistics?time_period=1y
 *
 * Layout:
 *   - Time period selector (1M / 3M / 6M / 1Y)
 *   - 4 KPI cards: Best, Worst, Most Volatile, Market Breadth
 *   - Category tabs: All / Broad / Sectoral / Thematic
 *   - Performance heatmap: color-coded grid by return_value
 *   - Each cell → /market/indices/[id]
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { VdfLoader, VdfEmptyState } from '@/components/vdf';
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

function fmtPct(v: number | null): string {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function fmtVol(v: number | null): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(2)}%`;
}

function truncate(str: string, max: number): string {
  return str.length <= max ? str : str.slice(0, max - 1) + '…';
}

/* ─────────────────────────────────────────────────────────
   PAGE
   ───────────────────────────────────────────────────────── */

const PERIOD_LABELS: Record<TimePeriod, string> = {
  '1m': '1 Month', '3m': '3 Months', '6m': '6 Months', '1y': '1 Year',
};

export default function MarketDashboardPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<TimePeriod>('1y');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [periodLoading, setPeriodLoading] = useState(false);

  const load = useCallback(async (p: TimePeriod) => {
    if (!loading) setPeriodLoading(true);
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
  }, [showToast, loading]);

  useEffect(() => { load(period); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePeriod = (p: TimePeriod) => {
    setPeriod(p);
    load(p);
  };

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

  return (
    <div className={s.page}>

      {/* ── Header ────────────────────────────────────── */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <h1>Market Dashboard</h1>
          <p>NSE index performance heatmap &amp; KPIs</p>
        </div>

        {/* Period selector */}
        <div className={s.periodStrip}>
          {(['1m', '3m', '6m', '1y'] as TimePeriod[]).map(p => (
            <button
              key={p}
              className={period === p ? s.periodBtnActive : s.periodBtn}
              onClick={() => handlePeriod(p)}
              disabled={periodLoading}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI cards ─────────────────────────────────── */}
      <div className={s.kpiGrid}>
        <KpiCard
          title="Best Performer"
          icon="▲"
          iconColor="var(--color-success)"
          name={stats?.best_performer?.index_name ?? null}
          code={stats?.best_performer?.index_code ?? null}
          value={fmtPct(stats?.best_performer?.return_value ?? null)}
          valueColor={stats?.best_performer?.return_value != null && stats.best_performer.return_value >= 0
            ? 'var(--color-success)' : 'var(--color-danger)'}
          onClick={() => stats?.best_performer && router.push(`/market/indices/${stats.best_performer.index_id}`)}
        />
        <KpiCard
          title="Worst Performer"
          icon="▼"
          iconColor="var(--color-danger)"
          name={stats?.worst_performer?.index_name ?? null}
          code={stats?.worst_performer?.index_code ?? null}
          value={fmtPct(stats?.worst_performer?.return_value ?? null)}
          valueColor="var(--color-danger)"
          onClick={() => stats?.worst_performer && router.push(`/market/indices/${stats.worst_performer.index_id}`)}
        />
        <KpiCard
          title="Most Volatile"
          icon="⚡"
          iconColor="var(--color-warning)"
          name={stats?.most_volatile?.index_name ?? null}
          code={stats?.most_volatile?.index_code ?? null}
          value={fmtVol(stats?.most_volatile?.volatility_value ?? null)}
          valueLabel="Ann. Volatility"
          valueColor="var(--color-warning)"
          onClick={() => stats?.most_volatile && router.push(`/market/indices/${stats.most_volatile.index_id}`)}
        />
        <BreadthCard
          breadth={stats?.market_breadth ?? 0}
          up={stats?.indices_up ?? 0}
          down={stats?.indices_down ?? 0}
          total={stats?.total_indices_analyzed ?? 0}
        />
      </div>

      {/* ── Category breakdown ────────────────────────── */}
      <div className={s.categoryRow}>
        {categoryAvg.map(({ cat, avg, count }) => (
          <div key={cat} className={s.catCard} style={{ borderColor: heatColor(avg).border }}>
            <div className={s.catLabel}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</div>
            <div className={s.catValue} style={{ color: heatColor(avg).fg }}>
              {fmtPct(avg)}
            </div>
            <div className={s.catCount}>{count} indices</div>
          </div>
        ))}
      </div>

      {/* ── Heatmap ───────────────────────────────────── */}
      <div className={s.heatmapSection}>
        <div className={s.heatmapHeader}>
          <span className={s.heatmapTitle}>
            Performance Heatmap
            {periodLoading && <span className={s.refreshDot} />}
          </span>

          {/* Category filter tabs */}
          <div className={s.catTabs}>
            {(['all', 'broad', 'sectoral', 'thematic'] as CategoryFilter[]).map(c => (
              <button
                key={c}
                className={category === c ? s.catTabActive : s.catTab}
                onClick={() => setCategory(c)}
              >
                {c === 'all' ? 'All' : c.charAt(0).toUpperCase() + c.slice(1)}
                <span className={s.catTabCount}>
                  {c === 'all'
                    ? stats?.heatmap.length
                    : stats?.heatmap.filter(h => h.category === c).length}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Color legend */}
        <div className={s.legend}>
          {[
            { label: '< −15%', bg: 'rgba(239,68,68,0.30)',  fg: '#ef4444' },
            { label: '−15 to −8%', bg: 'rgba(239,68,68,0.18)', fg: 'var(--color-danger)' },
            { label: '−8 to −3%', bg: 'rgba(239,68,68,0.09)', fg: 'var(--color-danger)' },
            { label: '0%',       bg: 'var(--color-surface)',  fg: 'var(--color-muted)' },
            { label: '0 to +3%', bg: 'rgba(16,185,129,0.04)', fg: 'var(--color-fg)' },
            { label: '+3 to +8%', bg: 'rgba(16,185,129,0.09)', fg: 'var(--color-success)' },
            { label: '+8 to +15%', bg: 'rgba(16,185,129,0.18)', fg: '#10b981' },
            { label: '> +15%',   bg: 'rgba(16,185,129,0.30)', fg: '#10b981' },
          ].map(l => (
            <div key={l.label} className={s.legendItem} style={{ background: l.bg }}>
              <span style={{ color: l.fg, fontSize: '0.65rem', fontWeight: 600 }}>{l.label}</span>
            </div>
          ))}
        </div>

        {heatmap.length === 0 ? (
          <VdfEmptyState
            icon="📊"
            title="No metrics data"
            description="Calculate metrics for indices first to see the heatmap."
            action={{ label: 'Go to Market History', onClick: () => router.push('/market/history') }}
          />
        ) : (
          <div className={s.heatmap}>
            {heatmap.map(cell => {
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

      {/* ── Footer ────────────────────────────────────── */}
      <div className={s.footer}>
        <strong>Market Dashboard</strong> — Returns calculated from OHLCV data.
        Period: <strong>{PERIOD_LABELS[period]}</strong>.
        {stats?.total_indices_analyzed != null && (
          <> {stats.total_indices_analyzed} indices analyzed &middot; {stats.indices_up} up, {stats.indices_down} down.</>
        )}
        Data from Yahoo Finance.
      </div>
    </div>
  );
}

/* ── KPI card component ──────────────────────────────────── */

function KpiCard({
  title, icon, iconColor, name, code, value, valueLabel, valueColor, onClick,
}: {
  title: string;
  icon: string;
  iconColor: string;
  name: string | null;
  code: string | null;
  value: string;
  valueLabel?: string;
  valueColor?: string;
  onClick?: () => void;
}) {
  return (
    <button className={s.kpiCard} onClick={onClick} disabled={!name}>
      <div className={s.kpiHeader}>
        <span className={s.kpiIcon} style={{ color: iconColor }}>{icon}</span>
        <span className={s.kpiTitle}>{title}</span>
      </div>
      {name ? (
        <>
          <div className={s.kpiName}>{truncate(name, 36)}</div>
          <div className={s.kpiCode}>{code}</div>
          <div className={s.kpiValue} style={{ color: valueColor }}>{value}</div>
          {valueLabel && <div className={s.kpiValueLabel}>{valueLabel}</div>}
        </>
      ) : (
        <div className={s.kpiEmpty}>No data</div>
      )}
    </button>
  );
}

/* ── Market breadth card ─────────────────────────────────── */

function BreadthCard({ breadth, up, down, total }: {
  breadth: number; up: number; down: number; total: number;
}) {
  const pct = Math.max(0, Math.min(100, breadth));
  const color = pct >= 60 ? 'var(--color-success)' : pct >= 40 ? 'var(--color-warning)' : 'var(--color-danger)';
  return (
    <div className={s.kpiCard} style={{ cursor: 'default' }}>
      <div className={s.kpiHeader}>
        <span className={s.kpiIcon} style={{ color }}>◈</span>
        <span className={s.kpiTitle}>Market Breadth</span>
      </div>
      <div className={s.kpiBreadthValue} style={{ color }}>{pct}%</div>
      <div className={s.breadthBar}>
        <div className={s.breadthFill} style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className={s.breadthMeta}>
        <span style={{ color: 'var(--color-success)' }}>▲ {up}</span>
        <span style={{ color: 'var(--color-muted)', fontSize: '0.7rem' }}>{total} analyzed</span>
        <span style={{ color: 'var(--color-danger)' }}>{down} ▼</span>
      </div>
    </div>
  );
}
