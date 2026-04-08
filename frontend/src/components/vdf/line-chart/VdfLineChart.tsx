'use client';

import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import s from './VdfLineChart.module.css';

export type ChartType = 'line' | 'area' | 'bar' | 'candlestick';

export interface OhlcPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface VdfLineChartProps {
  /** Array of { date, value } sorted ascending by date */
  data: { date: string; value: number }[];
  /** OHLC data for candlestick mode — if provided, overrides data for candlestick */
  ohlcData?: OhlcPoint[];
  /** Height in pixels (default 200) */
  height?: number;
  /** Show tooltip on hover (default true) */
  showTooltip?: boolean;
  /** Format the value for display (default: ₹{value.toFixed(2)}) */
  formatValue?: (v: number) => string;
  /** CSS class for the container */
  className?: string;
  /** Override line color (default: auto — green if up, red if down) */
  color?: string;
  /** ID for the container div (used for PNG export targeting) */
  containerId?: string;
  /**
   * When provided, renders an area-baseline chart (line/area modes):
   * fill is green above this value, red below.
   * Typical usage: baseline={0} in returns (%) mode.
   * In bar mode: used as the zero reference line.
   */
  baseline?: number;
  /**
   * Chart rendering type:
   * - 'line': line with subtle gradient fill (default)
   * - 'area': line with prominent gradient fill
   * - 'bar': vertical bars, green ≥ baseline, red < baseline
   * - 'candlestick': OHLC candlestick with optional volume sub-panel
   */
  chartType?: ChartType;
  /** Show volume sub-panel below candlestick chart (only in candlestick mode) */
  showVolume?: boolean;
}

const PAD = { top: 16, right: 20, bottom: 28, left: 70 };
/** Fraction of total height used for the volume sub-panel */
const VOL_HEIGHT_RATIO = 0.22;
/** Gap in pixels between main chart and volume panel */
const VOL_GAP = 8;

export function VdfLineChart({
  data,
  ohlcData,
  height = 200,
  showTooltip = true,
  formatValue = (v) => `\u20B9${v.toFixed(2)}`,
  className,
  color,
  containerId,
  baseline,
  chartType = 'line',
  showVolume = false,
}: VdfLineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragStateRef = useRef<{ startX: number; window: [number, number] } | null>(null);
  const zoomWindowRef = useRef<[number, number] | null>(null);

  const [containerWidth, setContainerWidth] = useState(800);
  const [zoomWindow, setZoomWindow] = useState<[number, number] | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; date: string; value: number } | null>(null);
  const [ohlcHover, setOhlcHover] = useState<(OhlcPoint & { x: number }) | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Keep ref in sync for wheel handler (avoids stale closure)
  zoomWindowRef.current = zoomWindow;

  // Container width via ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth || 800);
    const ro = new ResizeObserver(entries => setContainerWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset zoom when data changes (period/mode switch)
  useEffect(() => { setZoomWindow(null); }, [data, ohlcData]);

  // Merged OHLC source (prefer ohlcData when in candlestick mode)
  const mergedOhlc: OhlcPoint[] = useMemo(() => {
    if (chartType === 'candlestick') {
      if (ohlcData && ohlcData.length > 0) return ohlcData;
      // Fallback: synthesize from data[] (open=close=value, no wicks)
      return data.map(d => ({ date: d.date, open: d.value, high: d.value, low: d.value, close: d.value }));
    }
    return [];
  }, [chartType, ohlcData, data]);

  // The data source used for zoom indexing in candlestick mode
  const zoomSource = chartType === 'candlestick' ? mergedOhlc : data;

  // Wheel zoom — non-passive to prevent page scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el || zoomSource.length < 2) return;
    const chartW = containerWidth - PAD.left - PAD.right;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left - PAD.left) / chartW));

      const cur = zoomWindowRef.current;
      const ws = cur ? cur[0] : 0;
      const we = cur ? cur[1] : zoomSource.length - 1;
      const range = we - ws;

      const factor = e.deltaY > 0 ? 1.25 : 0.8;
      let newRange = Math.max(10, Math.min(zoomSource.length - 1, Math.round(range * factor)));

      let newStart = Math.round(ws + ratio * range - ratio * newRange);
      let newEnd = newStart + newRange;
      if (newStart < 0) { newStart = 0; newEnd = Math.min(zoomSource.length - 1, newRange); }
      if (newEnd > zoomSource.length - 1) { newEnd = zoomSource.length - 1; newStart = Math.max(0, newEnd - newRange); }

      const next: [number, number] | null =
        newStart === 0 && newEnd === zoomSource.length - 1 ? null : [newStart, newEnd];
      zoomWindowRef.current = next;
      setZoomWindow(next);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomSource.length, containerWidth]);

  // ── Derived dimensions ───────────────────────────────────────
  const chartW = Math.max(1, containerWidth - PAD.left - PAD.right);
  const hasVolume = chartType === 'candlestick' && showVolume && mergedOhlc.some(d => (d.volume ?? 0) > 0);
  const volH     = hasVolume ? Math.round((height - PAD.top - PAD.bottom) * VOL_HEIGHT_RATIO) : 0;
  const mainH    = Math.max(1, height - PAD.top - PAD.bottom - (hasVolume ? volH + VOL_GAP : 0));
  // Legacy alias for line/area/bar code paths
  const chartH   = mainH;

  // ── Visible slices ───────────────────────────────────────────
  const visibleData = useMemo(() => {
    if (!zoomWindow || chartType === 'candlestick') return data;
    return data.slice(zoomWindow[0], zoomWindow[1] + 1);
  }, [data, zoomWindow, chartType]);

  const visibleOhlc = useMemo(() => {
    if (chartType !== 'candlestick') return mergedOhlc;
    if (!zoomWindow) return mergedOhlc;
    return mergedOhlc.slice(zoomWindow[0], zoomWindow[1] + 1);
  }, [mergedOhlc, zoomWindow, chartType]);

  // ── Scale for line/area/bar ──────────────────────────────────
  const chartScale = useMemo(() => {
    if (chartType === 'candlestick') return null;
    if (visibleData.length < 2) return null;
    const vals = visibleData.map(d => d.value);
    let minVal = Math.min(...vals);
    let maxVal = Math.max(...vals);
    if (baseline !== undefined) { minVal = Math.min(minVal, baseline); maxVal = Math.max(maxVal, baseline); }
    const range = maxVal - minVal || 1;
    const pad = range * 0.06;
    return { yMin: minVal - pad, yRange: (maxVal - minVal + 2 * pad) || 1 };
  }, [visibleData, baseline, chartType]);

  // ── Scale for candlestick ────────────────────────────────────
  const ohlcScale = useMemo(() => {
    if (chartType !== 'candlestick' || visibleOhlc.length < 1) return null;
    const highs  = visibleOhlc.map(d => d.high);
    const lows   = visibleOhlc.map(d => d.low);
    const minVal = Math.min(...lows);
    const maxVal = Math.max(...highs);
    const range  = maxVal - minVal || 1;
    const pad    = range * 0.06;
    return { yMin: minVal - pad, yRange: (maxVal - minVal + 2 * pad) || 1 };
  }, [visibleOhlc, chartType]);

  // ── Volume scale ─────────────────────────────────────────────
  const volScale = useMemo(() => {
    if (!hasVolume || visibleOhlc.length < 1) return null;
    const vols = visibleOhlc.map(d => d.volume ?? 0);
    const maxVol = Math.max(...vols) || 1;
    return { maxVol };
  }, [hasVolume, visibleOhlc]);

  // ── xOf for line/area/bar ────────────────────────────────────
  const xOf = useCallback((i: number) =>
    visibleData.length <= 1 ? PAD.left : PAD.left + (i / (visibleData.length - 1)) * chartW,
  [visibleData.length, chartW]);

  // ── xOf for candlestick (slot-based) ────────────────────────
  const candleXOf = useCallback((i: number) => {
    if (visibleOhlc.length <= 1) return PAD.left + chartW / 2;
    const slotW = chartW / visibleOhlc.length;
    return PAD.left + slotW * i + slotW / 2;
  }, [visibleOhlc.length, chartW]);

  const candleSlotW = useMemo(() => {
    if (visibleOhlc.length === 0) return 8;
    return Math.max(2, (chartW / visibleOhlc.length) * 0.7);
  }, [visibleOhlc.length, chartW]);

  const yOf = useCallback((v: number) =>
    chartScale ? PAD.top + chartH - ((v - chartScale.yMin) / chartScale.yRange) * chartH : PAD.top,
  [chartScale, chartH]);

  const ohlcYOf = useCallback((v: number) =>
    ohlcScale ? PAD.top + mainH - ((v - ohlcScale.yMin) / ohlcScale.yRange) * mainH : PAD.top,
  [ohlcScale, mainH]);

  const volOffsetY = PAD.top + mainH + VOL_GAP;
  const volYOf = useCallback((v: number) =>
    volScale ? volOffsetY + volH - (v / volScale.maxVol) * volH : volOffsetY + volH,
  [volScale, volOffsetY, volH]);

  // SVG paths for line/area/bar
  const { pathD, fillD, baselineFillD } = useMemo(() => {
    if (chartType === 'candlestick' || !chartScale || visibleData.length < 2)
      return { pathD: '', fillD: '', baselineFillD: '' };
    const pts = visibleData
      .map((d, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(d.value).toFixed(1)}`)
      .join(' ');
    const lastX = xOf(visibleData.length - 1).toFixed(1);
    const bottomY = (PAD.top + chartH).toFixed(1);
    const bY = baseline !== undefined ? yOf(baseline).toFixed(1) : bottomY;
    return {
      pathD: pts,
      fillD: `${pts} L${lastX},${bottomY} L${PAD.left.toFixed(1)},${bottomY} Z`,
      baselineFillD: `${pts} L${lastX},${bY} L${PAD.left.toFixed(1)},${bY} Z`,
    };
  }, [visibleData, chartScale, xOf, yOf, chartH, baseline, chartType]);

  // Baseline Y position
  const baselineY = baseline !== undefined && chartScale ? yOf(baseline) : null;

  // Y-axis labels — candlestick uses ohlcScale, others use chartScale
  const yLabels = useMemo(() => {
    if (chartType === 'candlestick') {
      if (!ohlcScale) return [];
      return Array.from({ length: 5 }, (_, i) => {
        const v = ohlcScale.yMin + (ohlcScale.yRange * i) / 4;
        return { v, y: ohlcYOf(v) };
      });
    }
    if (!chartScale) return [];
    return Array.from({ length: 5 }, (_, i) => {
      const v = chartScale.yMin + (chartScale.yRange * i) / 4;
      return { v, y: yOf(v) };
    });
  }, [chartScale, ohlcScale, yOf, ohlcYOf, chartType]);

  // X-axis labels
  const xLabels = useMemo(() => {
    if (chartType === 'candlestick') {
      if (visibleOhlc.length < 2) return [];
      const N = visibleOhlc.length - 1;
      const indices = [...new Set([0, Math.round(N * 0.25), Math.round(N * 0.5), Math.round(N * 0.75), N])];
      return indices.map(i => ({ x: candleXOf(i), label: visibleOhlc[i].date.slice(5, 10) }));
    }
    if (visibleData.length < 2) return [];
    const N = visibleData.length - 1;
    const indices = [...new Set([0, Math.round(N * 0.25), Math.round(N * 0.5), Math.round(N * 0.75), N])];
    return indices.map(i => ({ x: xOf(i), label: visibleData[i].date.slice(5, 10) }));
  }, [visibleData, visibleOhlc, xOf, candleXOf, chartType]);

  // Bar chart geometry (density-adaptive width, matching kewalinvest)
  const barWidth = useMemo(() => {
    if (chartType !== 'bar' || visibleData.length === 0) return 0;
    const slotW = chartW / visibleData.length;
    const ratio = visibleData.length > 100 ? 0.55 : visibleData.length > 50 ? 0.65 : 0.75;
    return Math.max(1, slotW * ratio);
  }, [chartType, visibleData.length, chartW]);

  // Colors
  const isPositive = visibleData.length >= 2 && visibleData[visibleData.length - 1].value >= visibleData[0].value;
  const lineColor = color || (baseline !== undefined || chartType === 'bar'
    ? 'var(--color-primary)'
    : isPositive ? 'var(--color-success)' : 'var(--color-danger)');

  // Unique IDs per instance
  const uid = containerId || 'default';
  const gradId      = `navFill_${uid}`;
  const greenGradId = `greenFill_${uid}`;
  const redGradId   = `redFill_${uid}`;
  const clipId      = `navClip_${uid}`;
  const clipAboveId = `clipAbove_${uid}`;
  const clipBelowId = `clipBelow_${uid}`;
  const candleClipId = `candleClip_${uid}`;
  const volClipId   = `volClip_${uid}`;

  // ── Mouse handlers ────────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const cur = zoomWindowRef.current;
    const len = zoomSource.length;
    dragStateRef.current = { startX: e.clientX, window: [cur ? cur[0] : 0, cur ? cur[1] : len - 1] };
  }, [zoomSource.length]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const ds = dragStateRef.current;
    if (ds) {
      const dx = e.clientX - ds.startX;
      if (Math.abs(dx) > 4 && !isDragging) setIsDragging(true);
      if (Math.abs(dx) <= 4) return;
      setHover(null);
      setOhlcHover(null);
      const [ws, we] = ds.window;
      const range = we - ws;
      const delta = Math.round(-(dx * range) / chartW);
      const len = zoomSource.length;
      let ns = Math.max(0, Math.min(len - 1 - range, ws + delta));
      const ne = ns + range;
      const next: [number, number] | null = ns === 0 && ne === len - 1 ? null : [ns, ne];
      zoomWindowRef.current = next;
      setZoomWindow(next);
    } else {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left - PAD.left;
      if (mx < 0 || mx > chartW) { setHover(null); setOhlcHover(null); return; }

      if (chartType === 'candlestick' && visibleOhlc.length >= 1) {
        const idx = Math.max(0, Math.min(visibleOhlc.length - 1, Math.round((mx / chartW) * (visibleOhlc.length - 1))));
        const d = visibleOhlc[idx];
        setOhlcHover({ ...d, x: candleXOf(idx) });
        setHover(null);
      } else if (chartScale && visibleData.length >= 2) {
        const idx = Math.max(0, Math.min(visibleData.length - 1, Math.round((mx / chartW) * (visibleData.length - 1))));
        const d = visibleData[idx];
        setHover({ x: xOf(idx), y: yOf(d.value), date: d.date, value: d.value });
        setOhlcHover(null);
      }
    }
  }, [zoomSource.length, isDragging, chartW, chartScale, visibleData, visibleOhlc, xOf, yOf, candleXOf, chartType]);

  const handleMouseUp    = useCallback(() => { dragStateRef.current = null; setIsDragging(false); }, []);
  const handleMouseLeave = useCallback(() => {
    setHover(null); setOhlcHover(null); dragStateRef.current = null; setIsDragging(false);
  }, []);
  const handleDoubleClick = useCallback(() => { setZoomWindow(null); zoomWindowRef.current = null; }, []);

  // Not enough data guard
  const hasEnoughData = chartType === 'candlestick' ? mergedOhlc.length >= 1 : data.length >= 2;
  if (!hasEnoughData) {
    return <div className={`${s.empty} ${className || ''}`} style={{ height }}>Not enough data</div>;
  }

  return (
    <div
      ref={containerRef}
      id={containerId}
      className={`${s.container} ${className || ''}`}
      style={{ height }}
    >
      <svg
        ref={svgRef}
        className={s.svg}
        width={containerWidth}
        height={height}
        viewBox={`0 0 ${containerWidth} ${height}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onDoubleClick={handleDoubleClick}
        style={{ cursor: isDragging ? 'grabbing' : 'crosshair', display: 'block' }}
      >
        <defs>
          {/* Single-color gradient — area mode uses higher opacity */}
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity={chartType === 'area' ? '0.48' : '0.22'} />
            <stop offset="100%" stopColor={lineColor} stopOpacity={chartType === 'area' ? '0.06' : '0.02'} />
          </linearGradient>

          {/* Baseline dual-color gradients */}
          {baselineY !== null && <>
            <linearGradient id={greenGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-success)" stopOpacity="0.26" />
              <stop offset="100%" stopColor="var(--color-success)" stopOpacity="0.03" />
            </linearGradient>
            <linearGradient id={redGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-danger)" stopOpacity="0.04" />
              <stop offset="100%" stopColor="var(--color-danger)" stopOpacity="0.26" />
            </linearGradient>
            <clipPath id={clipAboveId}>
              <rect x={PAD.left} y={PAD.top} width={chartW} height={Math.max(0, (baselineY ?? 0) - PAD.top)} />
            </clipPath>
            <clipPath id={clipBelowId}>
              <rect x={PAD.left} y={(baselineY ?? 0)} width={chartW}
                height={Math.max(0, PAD.top + chartH - (baselineY ?? 0))} />
            </clipPath>
          </>}

          {/* Chart area clip */}
          <clipPath id={clipId}>
            <rect x={PAD.left} y={PAD.top - 4} width={chartW} height={chartH + 8} />
          </clipPath>

          {/* Candlestick clip */}
          <clipPath id={candleClipId}>
            <rect x={PAD.left} y={PAD.top - 4} width={chartW} height={mainH + 8} />
          </clipPath>

          {/* Volume clip */}
          {hasVolume && (
            <clipPath id={volClipId}>
              <rect x={PAD.left} y={volOffsetY} width={chartW} height={volH} />
            </clipPath>
          )}
        </defs>

        {/* Y-axis grid + labels */}
        {yLabels.map((l, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={l.y} x2={PAD.left + chartW} y2={l.y} className={s.gridLine} />
            <text x={PAD.left - 8} y={l.y} fontSize="10" textAnchor="end" dominantBaseline="middle" className={s.yLabel}>
              {chartType === 'candlestick'
                ? (l.v >= 1000 ? `${(l.v / 1000).toFixed(1)}K` : l.v.toFixed(0))
                : baseline !== undefined
                  ? `${l.v >= 0 ? '+' : ''}${l.v.toFixed(1)}%`
                  : l.v >= 1000 ? `${(l.v / 1000).toFixed(1)}K` : l.v.toFixed(2)}
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {xLabels.map((l, i) => (
          <text key={i} x={l.x} y={height - 6} fontSize="9" textAnchor="middle" className={s.xLabel}>
            {l.label}
          </text>
        ))}

        {/* ── Candlestick chart ── */}
        {chartType === 'candlestick' && (
          <g clipPath={`url(#${candleClipId})`}>
            {visibleOhlc.map((d, i) => {
              const isUp   = d.close >= d.open;
              const fill   = isUp ? 'var(--color-success)' : 'var(--color-danger)';
              const cx     = candleXOf(i);
              const hw     = Math.max(1, candleSlotW / 2);
              const wickX1 = cx;
              const wickY1 = ohlcYOf(d.high);
              const wickY2 = ohlcYOf(d.low);
              const bodyY  = ohlcYOf(Math.max(d.open, d.close));
              const bodyH  = Math.max(1, Math.abs(ohlcYOf(d.open) - ohlcYOf(d.close)));
              const isHov  = ohlcHover?.date === d.date;
              return (
                <g key={d.date} opacity={isHov ? 1 : 0.85}>
                  {/* Wick */}
                  <line x1={wickX1} y1={wickY1} x2={wickX1} y2={wickY2}
                    stroke={fill} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                  {/* Body */}
                  <rect x={cx - hw} y={bodyY} width={candleSlotW} height={bodyH}
                    fill={fill} rx="0.5" />
                </g>
              );
            })}
          </g>
        )}

        {/* ── Volume sub-panel ── */}
        {hasVolume && volScale && (
          <>
            {/* Separator line */}
            <line x1={PAD.left} y1={volOffsetY - 4} x2={PAD.left + chartW} y2={volOffsetY - 4}
              stroke="var(--color-border)" strokeWidth="1" opacity="0.3" />
            <g clipPath={`url(#${volClipId})`}>
              {visibleOhlc.map((d, i) => {
                const vol    = d.volume ?? 0;
                const isUp   = d.close >= d.open;
                const fill   = isUp ? 'var(--color-success)' : 'var(--color-danger)';
                const cx     = candleXOf(i);
                const hw     = Math.max(1, candleSlotW / 2);
                const barTop = volYOf(vol);
                const barH   = Math.max(1, volOffsetY + volH - barTop);
                return (
                  <rect key={d.date} x={cx - hw} y={barTop} width={candleSlotW} height={barH}
                    fill={fill} opacity="0.55" />
                );
              })}
            </g>
            {/* Volume label */}
            <text x={PAD.left - 8} y={volOffsetY + volH / 2} fontSize="9"
              textAnchor="end" dominantBaseline="middle" className={s.yLabel}>
              Vol
            </text>
          </>
        )}

        {/* ── Bar chart ── */}
        {chartType === 'bar' && (
          <g clipPath={`url(#${clipId})`}>
            {visibleData.map((d, i) => {
              const refY = baselineY ?? PAD.top + chartH;
              const dY   = yOf(d.value);
              const isPos = baseline !== undefined ? d.value >= baseline : d.value >= 0;
              const barY  = isPos ? dY : refY;
              const barH  = Math.max(1, Math.abs(dY - refY));
              return (
                <rect key={i} x={xOf(i) - barWidth / 2} y={barY} width={barWidth} height={barH}
                  fill={isPos ? 'var(--color-success)' : 'var(--color-danger)'}
                  opacity={hover?.date === d.date ? '0.92' : '0.68'} />
              );
            })}
          </g>
        )}

        {/* ── Line / Area chart ── */}
        {(chartType === 'line' || chartType === 'area') && (
          <g clipPath={`url(#${clipId})`}>
            {baselineY !== null ? (
              <>
                <g clipPath={`url(#${clipAboveId})`}>
                  <path d={baselineFillD} fill={`url(#${greenGradId})`} />
                </g>
                <g clipPath={`url(#${clipBelowId})`}>
                  <path d={baselineFillD} fill={`url(#${redGradId})`} />
                </g>
              </>
            ) : (
              <path d={fillD} fill={`url(#${gradId})`} />
            )}
            <path d={pathD} fill="none" stroke={lineColor} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </g>
        )}

        {/* Baseline / zero reference line */}
        {baselineY !== null && (
          <line x1={PAD.left} y1={baselineY} x2={PAD.left + chartW} y2={baselineY}
            stroke="var(--color-muted)" strokeWidth="1" strokeDasharray="4 4" opacity="0.45"
            vectorEffect="non-scaling-stroke" />
        )}

        {/* Zoom hint */}
        {zoomWindow && (
          <text x={PAD.left + chartW - 4} y={PAD.top + 10} fontSize="9" textAnchor="end" className={s.zoomHint}>
            zoomed · dbl-click to reset
          </text>
        )}

        {/* Hover crosshair — line/area/bar */}
        {hover && chartType !== 'candlestick' && (
          <>
            <line x1={hover.x} y1={PAD.top} x2={hover.x} y2={PAD.top + chartH} className={s.hoverLine} />
            {chartType !== 'bar' && (
              <circle cx={hover.x} cy={hover.y} r="3.5" className={s.hoverDot} style={{ fill: lineColor }} />
            )}
          </>
        )}

        {/* Hover crosshair — candlestick */}
        {ohlcHover && chartType === 'candlestick' && (
          <line x1={ohlcHover.x} y1={PAD.top} x2={ohlcHover.x} y2={PAD.top + mainH} className={s.hoverLine} />
        )}
      </svg>

      {/* Tooltip — line/area/bar */}
      {hover && showTooltip && !isDragging && chartType !== 'candlestick' && (
        <div className={s.tooltip} style={{ left: hover.x, top: Math.max(8, hover.y - 44) }}>
          <div className={s.tooltipValue}>{formatValue(hover.value)}</div>
          <div className={s.tooltipDate}>{hover.date.slice(0, 10)}</div>
        </div>
      )}

      {/* Tooltip — candlestick OHLC */}
      {ohlcHover && showTooltip && !isDragging && chartType === 'candlestick' && (
        <div
          className={s.ohlcTooltip}
          style={{
            left: Math.min(ohlcHover.x + 12, containerWidth - 160),
            top: PAD.top + 8,
          }}
        >
          <div className={s.ohlcDate}>{ohlcHover.date.slice(0, 10)}</div>
          <div className={s.ohlcRow}><span className={s.ohlcLabel}>O</span><span>{formatValue(ohlcHover.open)}</span></div>
          <div className={s.ohlcRow}><span className={s.ohlcLabel}>H</span><span className={s.ohlcHigh}>{formatValue(ohlcHover.high)}</span></div>
          <div className={s.ohlcRow}><span className={s.ohlcLabel}>L</span><span className={s.ohlcLow}>{formatValue(ohlcHover.low)}</span></div>
          <div className={s.ohlcRow}><span className={s.ohlcLabel}>C</span><span className={ohlcHover.close >= ohlcHover.open ? s.ohlcUp : s.ohlcDown}>{formatValue(ohlcHover.close)}</span></div>
          {(ohlcHover.volume ?? 0) > 0 && (
            <div className={s.ohlcRow}><span className={s.ohlcLabel}>V</span><span className={s.ohlcVol}>
              {ohlcHover.volume! >= 1_000_000
                ? `${(ohlcHover.volume! / 1_000_000).toFixed(2)}M`
                : ohlcHover.volume! >= 1_000
                ? `${(ohlcHover.volume! / 1_000).toFixed(1)}K`
                : `${ohlcHover.volume}`}
            </span></div>
          )}
        </div>
      )}
    </div>
  );
}
