'use client';

/**
 * VdfPulseRing — SVG arc ring showing a percentage / percentile score.
 *
 * Used in two places:
 *   1. Contact profile header — "snapshot readiness" ring (large)
 *   2. Populated snapshot "Pulse rings" card — per-metric health rings (small)
 *
 * Usage:
 *   <VdfPulseRing percent={78} label="78" tone="success" size={58} />
 *   <VdfPulseRing percent={42} label="42" tone="warning" size={36} strokeWidth={4} />
 */

import s from './VdfPulseRing.module.css';

export interface VdfPulseRingProps {
  /** Fill percentage 0–100 */
  percent: number;
  /** Text rendered at the center of the ring, e.g. "78" or "78%" */
  label?: string;
  /** Ring outer diameter in px. Default: 58 */
  size?: number;
  /** SVG stroke width in px. Default: 3 */
  strokeWidth?: number;
  /** Color of the filled arc. Default: 'primary' */
  tone?: 'primary' | 'success' | 'warning' | 'danger';
  className?: string;
}

export function VdfPulseRing({
  percent,
  label,
  size = 58,
  strokeWidth = 3,
  tone = 'primary',
  className,
}: VdfPulseRingProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  const r = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - clamped / 100);
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div
      className={`${s.ring} ${className || ''}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ? `${label} — ${clamped}%` : `${clamped}%`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)' }}
        aria-hidden
      >
        {/* Background track */}
        <circle
          className={s.track}
          cx={cx}
          cy={cy}
          r={r}
          strokeWidth={strokeWidth}
        />
        {/* Filled arc */}
        <circle
          className={`${s.fill} ${s[`tone_${tone}`]}`}
          cx={cx}
          cy={cy}
          r={r}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>

      {label && (
        <span className={s.label} aria-hidden>
          {label}
        </span>
      )}
    </div>
  );
}
