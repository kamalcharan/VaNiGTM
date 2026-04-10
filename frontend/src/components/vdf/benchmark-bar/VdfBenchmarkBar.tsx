'use client';

/**
 * VdfBenchmarkBar — single benchmark metric row for the Pulse sidebar.
 *
 * Renders: label (with accent dot) + current value, a filled progress bar
 * with an optional peer-median marker, and a percentile + note footer.
 *
 * State colours map:
 *   'empty' → muted / no data yet
 *   'low'   → danger (below peer median)
 *   'mid'   → warning (approaching benchmark)
 *   'good'  → success (above peer median)
 *
 * Usage:
 *   <VdfBenchmarkBar
 *     label="Savings Rate"
 *     value="52.4%"
 *     fillPercent={82}
 *     state="good"
 *     markerPercent={50}
 *     rangeMin="0%"  rangeMax="100%"
 *     percentile="p95"
 *     percentileTone="ok"
 *     note="Top quartile for income bracket"
 *     dotColor="var(--color-primary)"
 *   />
 */

import s from './VdfBenchmarkBar.module.css';

export type BenchmarkState = 'empty' | 'low' | 'mid' | 'good';
export type PercentileTone = 'ok' | 'mid' | 'bad';

export interface VdfBenchmarkBarProps {
  /** Uppercase metric label, e.g. "Savings Rate" */
  label: string;
  /** Formatted current value, e.g. "52.4%" or "—" (awaiting data) */
  value?: string;
  /** Bar fill width 0–100. Default: 0 (empty) */
  fillPercent?: number;
  /** State controls bar fill colour. Default: 'empty' */
  state?: BenchmarkState;
  /** Left edge of the bar scale, e.g. "0%" */
  rangeMin?: string;
  /** Right edge of the bar scale, e.g. "100%" */
  rangeMax?: string;
  /** Position of the peer-median marker line (0–100). Omit to hide. */
  markerPercent?: number;
  /** Formatted percentile text, e.g. "p78" or "—" */
  percentile?: string;
  /** Colour tone of the percentile text */
  percentileTone?: PercentileTone;
  /** Short mono note below the bar, e.g. "Top quartile for bracket" */
  note?: string;
  /**
   * CSS colour for the small square accent dot beside the label.
   * Pass a CSS variable string: "var(--color-primary)" or a hex value.
   */
  dotColor?: string;
  className?: string;
}

export function VdfBenchmarkBar({
  label,
  value,
  fillPercent = 0,
  state = 'empty',
  rangeMin,
  rangeMax,
  markerPercent,
  percentile,
  percentileTone,
  note,
  dotColor,
  className,
}: VdfBenchmarkBarProps) {
  const clamped = Math.min(100, Math.max(0, fillPercent));
  const hasValue = value && value !== '—';

  return (
    <div className={`${s.metric} ${className || ''}`}>
      {/* ── Row 1: label + current value ─────────────────── */}
      <div className={s.row1}>
        <div className={s.labelWrap}>
          {dotColor && (
            <span
              className={s.dot}
              style={{ background: dotColor }}
              aria-hidden
            />
          )}
          <span className={s.label}>{label}</span>
        </div>
        <span className={`${s.value} ${!hasValue ? s.valueEmpty : ''}`}>
          {value ?? '—'}
        </span>
      </div>

      {/* ── Scale bar ────────────────────────────────────── */}
      <div className={s.scale}>
        <div
          className={`${s.scaleFill} ${s[`state_${state}`]}`}
          style={{ width: `${clamped}%` }}
        />
        {markerPercent != null && (
          <div
            className={s.marker}
            style={{ left: `${markerPercent}%` }}
            aria-hidden
          />
        )}
      </div>

      {/* ── Row 2: range labels + percentile ─────────────── */}
      {(rangeMin != null || rangeMax != null || percentile != null) && (
        <div className={s.bottom}>
          <span>{rangeMin ?? 'p0'}</span>
          {percentile != null && (
            <span
              className={`${s.percentile} ${percentileTone ? s[`pct_${percentileTone}`] : ''}`}
            >
              {percentile}
            </span>
          )}
          <span>{rangeMax ?? 'p100'}</span>
        </div>
      )}

      {/* ── Note ─────────────────────────────────────────── */}
      {note && <div className={s.note}>{note}</div>}
    </div>
  );
}
