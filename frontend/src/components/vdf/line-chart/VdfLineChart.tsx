'use client';

import { useMemo, useState, useRef, useCallback } from 'react';
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
  /** Override line/fill color (default: auto — green if up, red if down) */
  color?: string;
  /** ID for the container div (used for PNG export targeting) */
  containerId?: string;
}

const PADDING = { top: 12, right: 12, bottom: 24, left: 56 };

export function VdfLineChart({
  data,
  height = 200,
  showTooltip = true,
  formatValue = (v) => `\u20B9${v.toFixed(2)}`,
  className,
  color,
  containerId,
}: VdfLineChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; date: string; value: number } | null>(null);

  // Compute chart dimensions and scales
  const chart = useMemo(() => {
    if (data.length < 2) return null;

    const values = data.map((d) => d.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;
    const padding = range * 0.05;

    const yMin = minVal - padding;
    const yMax = maxVal + padding;
    const yRange = yMax - yMin;

    return { yMin, yMax, yRange };
  }, [data]);

  // Build SVG path
  const pathD = useMemo(() => {
    if (!chart || data.length < 2) return '';

    const w = 100; // viewBox width percentage
    const h = height - PADDING.top - PADDING.bottom;
    const xStep = w / (data.length - 1);

    return data.map((d, i) => {
      const x = i * xStep;
      const y = h - ((d.value - chart.yMin) / chart.yRange) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');
  }, [data, chart, height]);

  // Gradient fill path (same line + close to bottom)
  const fillD = useMemo(() => {
    if (!pathD || data.length < 2) return '';
    const w = 100;
    const h = height - PADDING.top - PADDING.bottom;
    return `${pathD} L${w},${h} L0,${h} Z`;
  }, [pathD, data, height]);

  // Y-axis labels
  const yLabels = useMemo(() => {
    if (!chart) return [];
    const steps = 4;
    const labels: { value: number; y: number }[] = [];
    const h = height - PADDING.top - PADDING.bottom;
    for (let i = 0; i <= steps; i++) {
      const value = chart.yMin + (chart.yRange * i) / steps;
      const y = h - (i / steps) * h;
      labels.push({ value, y });
    }
    return labels;
  }, [chart, height]);

  // Handle mouse move for tooltip
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || !chart || data.length < 2) return;

    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - PADDING.left;
    const chartWidth = rect.width - PADDING.left - PADDING.right;

    if (mouseX < 0 || mouseX > chartWidth) { setHover(null); return; }

    const ratio = mouseX / chartWidth;
    const idx = Math.round(ratio * (data.length - 1));
    const d = data[Math.max(0, Math.min(idx, data.length - 1))];

    const h = height - PADDING.top - PADDING.bottom;
    const x = (idx / (data.length - 1)) * chartWidth + PADDING.left;
    const y = PADDING.top + h - ((d.value - chart.yMin) / chart.yRange) * h;

    setHover({ x, y, date: d.date, value: d.value });
  }, [data, chart, height]);

  // Color: user override → auto-detect from trend
  const isPositive = data.length >= 2 && data[data.length - 1].value >= data[0].value;
  const lineColor = color || (isPositive ? 'var(--color-success)' : 'var(--color-danger)');

  if (data.length < 2) {
    return <div className={`${s.empty} ${className || ''}`}>Not enough data for chart</div>;
  }

  const chartH = height - PADDING.top - PADDING.bottom;
  const viewBox = `0 0 100 ${chartH}`;

  return (
    <div id={containerId} className={`${s.container} ${className || ''}`} style={{ height }}>
      <svg
        ref={svgRef}
        className={s.svg}
        viewBox={`0 0 ${100 + PADDING.left + PADDING.right} ${height}`}
        preserveAspectRatio="none"
        onMouseMove={showTooltip ? handleMouseMove : undefined}
        onMouseLeave={() => setHover(null)}
      >
        {/* Y-axis labels */}
        {yLabels.map((l, i) => (
          <g key={i}>
            <line
              x1={PADDING.left} y1={PADDING.top + l.y}
              x2={PADDING.left + 100} y2={PADDING.top + l.y}
              className={s.gridLine}
            />
            <text
              x={PADDING.left - 6} y={PADDING.top + l.y + 1}
              className={s.yLabel}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {l.value >= 1000 ? `${(l.value / 1000).toFixed(0)}K` : l.value.toFixed(1)}
            </text>
          </g>
        ))}

        {/* Chart area */}
        <g transform={`translate(${PADDING.left}, ${PADDING.top})`}>
          {/* Gradient fill */}
          <defs>
            <linearGradient id={`navFill_${containerId || 'default'}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.2" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={fillD} fill={`url(#navFill_${containerId || 'default'})`} />
          <path
            d={pathD}
            fill="none"
            stroke={lineColor}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </g>

        {/* X-axis labels (first, middle, last) */}
        {data.length > 2 && [0, Math.floor(data.length / 2), data.length - 1].map((idx) => {
          const x = PADDING.left + (idx / (data.length - 1)) * 100;
          return (
            <text key={idx} x={x} y={height - 4} className={s.xLabel} textAnchor="middle">
              {data[idx].date.slice(5)} {/* MM-DD */}
            </text>
          );
        })}

        {/* Hover indicator */}
        {hover && (
          <>
            <line x1={hover.x} y1={PADDING.top} x2={hover.x} y2={height - PADDING.bottom} className={s.hoverLine} />
            <circle cx={hover.x} cy={hover.y} r="3" className={s.hoverDot} />
          </>
        )}
      </svg>

      {/* Tooltip */}
      {hover && showTooltip && (
        <div className={s.tooltip} style={{ left: hover.x, top: hover.y - 36 }}>
          <div className={s.tooltipValue}>{formatValue(hover.value)}</div>
          <div className={s.tooltipDate}>{hover.date}</div>
        </div>
      )}
    </div>
  );
}
