'use client';

import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import s from './VdfLineChart.module.css';

export interface VdfLineChartProps {
  /** Array of { date, value } sorted ascending by date */
  data: { date: string; value: number }[];
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
   * When provided, renders an area-baseline chart:
   * fill is green above this value, red below.
   * Typical usage: baseline={0} in returns (%) mode.
   */
  baseline?: number;
}

const PAD = { top: 16, right: 20, bottom: 28, left: 70 };

export function VdfLineChart({
  data,
  height = 200,
  showTooltip = true,
  formatValue = (v) => `\u20B9${v.toFixed(2)}`,
  className,
  color,
  containerId,
  baseline,
}: VdfLineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragStateRef = useRef<{ startX: number; window: [number, number] } | null>(null);
  const zoomWindowRef = useRef<[number, number] | null>(null);

  const [containerWidth, setContainerWidth] = useState(800);
  const [zoomWindow, setZoomWindow] = useState<[number, number] | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; date: string; value: number } | null>(null);
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
  useEffect(() => { setZoomWindow(null); }, [data]);

  // Wheel zoom — non-passive to prevent page scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el || data.length < 2) return;
    const chartW = containerWidth - PAD.left - PAD.right;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left - PAD.left) / chartW));

      const cur = zoomWindowRef.current;
      const ws = cur ? cur[0] : 0;
      const we = cur ? cur[1] : data.length - 1;
      const range = we - ws;

      const factor = e.deltaY > 0 ? 1.25 : 0.8;
      let newRange = Math.max(10, Math.min(data.length - 1, Math.round(range * factor)));

      let newStart = Math.round(ws + ratio * range - ratio * newRange);
      let newEnd = newStart + newRange;
      if (newStart < 0) { newStart = 0; newEnd = Math.min(data.length - 1, newRange); }
      if (newEnd > data.length - 1) { newEnd = data.length - 1; newStart = Math.max(0, newEnd - newRange); }

      const next: [number, number] | null =
        newStart === 0 && newEnd === data.length - 1 ? null : [newStart, newEnd];
      zoomWindowRef.current = next;
      setZoomWindow(next);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [data, containerWidth]);

  // ── Derived dimensions ───────────────────────────────────────
  const chartW = Math.max(1, containerWidth - PAD.left - PAD.right);
  const chartH = Math.max(1, height - PAD.top - PAD.bottom);

  const visibleData = useMemo(() => {
    if (!zoomWindow) return data;
    return data.slice(zoomWindow[0], zoomWindow[1] + 1);
  }, [data, zoomWindow]);

  const chartScale = useMemo(() => {
    if (visibleData.length < 2) return null;
    const vals = visibleData.map(d => d.value);
    let minVal = Math.min(...vals);
    let maxVal = Math.max(...vals);
    // Include baseline in Y range if provided
    if (baseline !== undefined) { minVal = Math.min(minVal, baseline); maxVal = Math.max(maxVal, baseline); }
    const range = maxVal - minVal || 1;
    const pad = range * 0.06;
    return { yMin: minVal - pad, yRange: (maxVal - minVal + 2 * pad) || 1 };
  }, [visibleData, baseline]);

  const xOf = useCallback((i: number) =>
    visibleData.length <= 1 ? PAD.left : PAD.left + (i / (visibleData.length - 1)) * chartW,
  [visibleData.length, chartW]);

  const yOf = useCallback((v: number) =>
    chartScale ? PAD.top + chartH - ((v - chartScale.yMin) / chartScale.yRange) * chartH : PAD.top,
  [chartScale, chartH]);

  // SVG paths
  const { pathD, fillD, baselineFillD } = useMemo(() => {
    if (!chartScale || visibleData.length < 2) return { pathD: '', fillD: '', baselineFillD: '' };
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
  }, [visibleData, chartScale, xOf, yOf, chartH, baseline]);

  // Baseline Y position
  const baselineY = baseline !== undefined && chartScale ? yOf(baseline) : null;

  // Y-axis labels
  const yLabels = useMemo(() => {
    if (!chartScale) return [];
    return Array.from({ length: 5 }, (_, i) => {
      const v = chartScale.yMin + (chartScale.yRange * i) / 4;
      return { v, y: yOf(v) };
    });
  }, [chartScale, yOf]);

  // X-axis labels
  const xLabels = useMemo(() => {
    if (visibleData.length < 2) return [];
    const N = visibleData.length - 1;
    const indices = [...new Set([0, Math.round(N * 0.25), Math.round(N * 0.5), Math.round(N * 0.75), N])];
    return indices.map(i => ({ x: xOf(i), label: visibleData[i].date.slice(5, 10) }));
  }, [visibleData, xOf]);

  // Colors
  const isPositive = visibleData.length >= 2 && visibleData[visibleData.length - 1].value >= visibleData[0].value;
  // With baseline: line is neutral primary (fill shows green/red). Without: line auto-colors.
  const lineColor = color || (baseline !== undefined ? 'var(--color-primary)' : isPositive ? 'var(--color-success)' : 'var(--color-danger)');

  // Unique IDs per instance
  const uid = containerId || 'default';
  const gradId      = `navFill_${uid}`;
  const greenGradId = `greenFill_${uid}`;
  const redGradId   = `redFill_${uid}`;
  const clipId      = `navClip_${uid}`;
  const clipAboveId = `clipAbove_${uid}`;
  const clipBelowId = `clipBelow_${uid}`;

  // ── Mouse handlers ────────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const cur = zoomWindowRef.current;
    dragStateRef.current = { startX: e.clientX, window: [cur ? cur[0] : 0, cur ? cur[1] : data.length - 1] };
  }, [data.length]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const ds = dragStateRef.current;
    if (ds) {
      const dx = e.clientX - ds.startX;
      if (Math.abs(dx) > 4 && !isDragging) setIsDragging(true);
      if (Math.abs(dx) <= 4) return;
      setHover(null);
      const [ws, we] = ds.window;
      const range = we - ws;
      const delta = Math.round(-(dx * range) / chartW);
      let ns = Math.max(0, Math.min(data.length - 1 - range, ws + delta));
      const ne = ns + range;
      const next: [number, number] | null = ns === 0 && ne === data.length - 1 ? null : [ns, ne];
      zoomWindowRef.current = next;
      setZoomWindow(next);
    } else {
      if (!containerRef.current || !chartScale || visibleData.length < 2) return;
      const rect = containerRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left - PAD.left;
      if (mx < 0 || mx > chartW) { setHover(null); return; }
      const idx = Math.max(0, Math.min(visibleData.length - 1, Math.round((mx / chartW) * (visibleData.length - 1))));
      const d = visibleData[idx];
      setHover({ x: xOf(idx), y: yOf(d.value), date: d.date, value: d.value });
    }
  }, [data.length, isDragging, chartW, chartScale, visibleData, xOf, yOf]);

  const handleMouseUp    = useCallback(() => { dragStateRef.current = null; setIsDragging(false); }, []);
  const handleMouseLeave = useCallback(() => { setHover(null); dragStateRef.current = null; setIsDragging(false); }, []);
  const handleDoubleClick = useCallback(() => { setZoomWindow(null); zoomWindowRef.current = null; }, []);

  if (data.length < 2) {
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
          {/* Single-color gradient (price mode) */}
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.22" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
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
            {/* Above baseline clip (positive) — y < baselineY in SVG coords */}
            <clipPath id={clipAboveId}>
              <rect x={PAD.left} y={PAD.top} width={chartW} height={Math.max(0, (baselineY ?? 0) - PAD.top)} />
            </clipPath>
            {/* Below baseline clip (negative) */}
            <clipPath id={clipBelowId}>
              <rect
                x={PAD.left}
                y={(baselineY ?? 0)}
                width={chartW}
                height={Math.max(0, PAD.top + chartH - (baselineY ?? 0))}
              />
            </clipPath>
          </>}

          {/* Chart area clip (prevents overflow into padding) */}
          <clipPath id={clipId}>
            <rect x={PAD.left} y={PAD.top - 4} width={chartW} height={chartH + 8} />
          </clipPath>
        </defs>

        {/* Y-axis grid + labels */}
        {yLabels.map((l, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={l.y} x2={PAD.left + chartW} y2={l.y} className={s.gridLine} />
            <text x={PAD.left - 8} y={l.y} fontSize="10" textAnchor="end" dominantBaseline="middle" className={s.yLabel}>
              {baseline !== undefined
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

        {/* ── Chart fill area ── */}
        <g clipPath={`url(#${clipId})`}>
          {baselineY !== null ? (
            /* Dual-color baseline fill */
            <>
              <g clipPath={`url(#${clipAboveId})`}>
                <path d={baselineFillD} fill={`url(#${greenGradId})`} />
              </g>
              <g clipPath={`url(#${clipBelowId})`}>
                <path d={baselineFillD} fill={`url(#${redGradId})`} />
              </g>
            </>
          ) : (
            /* Single-color gradient fill */
            <path d={fillD} fill={`url(#${gradId})`} />
          )}

          {/* Chart line */}
          <path d={pathD} fill="none" stroke={lineColor} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </g>

        {/* Baseline reference line */}
        {baselineY !== null && (
          <line
            x1={PAD.left} y1={baselineY}
            x2={PAD.left + chartW} y2={baselineY}
            stroke="var(--color-muted)" strokeWidth="1"
            strokeDasharray="4 4" opacity="0.45"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Zoom hint */}
        {zoomWindow && (
          <text x={PAD.left + chartW - 4} y={PAD.top + 10} fontSize="9" textAnchor="end" className={s.zoomHint}>
            zoomed · dbl-click to reset
          </text>
        )}

        {/* Hover crosshair */}
        {hover && (
          <>
            <line x1={hover.x} y1={PAD.top} x2={hover.x} y2={PAD.top + chartH} className={s.hoverLine} />
            <circle cx={hover.x} cy={hover.y} r="3.5" className={s.hoverDot} style={{ fill: lineColor }} />
          </>
        )}
      </svg>

      {/* Tooltip */}
      {hover && showTooltip && !isDragging && (
        <div className={s.tooltip} style={{ left: hover.x, top: Math.max(8, hover.y - 44) }}>
          <div className={s.tooltipValue}>{formatValue(hover.value)}</div>
          <div className={s.tooltipDate}>{hover.date.slice(0, 10)}</div>
        </div>
      )}
    </div>
  );
}
