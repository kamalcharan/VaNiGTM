'use client';

import s from './VdfReadinessRing.module.css';

export interface VdfReadinessRingProps {
  /** 0–100 */
  pct: number;
  size?: number;
  strokeWidth?: number;
  /** Override automatic color based on pct */
  color?: string;
  showLabel?: boolean;
  className?: string;
}

/** Colour: jade ≥70%, amber 35–69%, muted <35% */
function ringColor(pct: number): string {
  if (pct >= 70) return 'var(--color-success)';
  if (pct >= 35) return 'var(--color-warning)';
  return 'var(--color-muted)';
}

/**
 * VdfReadinessRing — circular SVG progress ring.
 *
 * Used on Contact cards and profile to show how complete a
 * prospect's profile is before client conversion.
 */
export function VdfReadinessRing({
  pct,
  size = 40,
  strokeWidth = 3,
  color,
  showLabel = true,
  className,
}: VdfReadinessRingProps) {
  const clamped   = Math.min(100, Math.max(0, Math.round(pct)));
  const radius    = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset    = circumference - (clamped / 100) * circumference;
  const stroke    = color ?? ringColor(clamped);
  const cx        = size / 2;
  const fontSize  = Math.round(size * 0.22);

  return (
    <div className={`${s.wrap} ${className ?? ''}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <circle
          cx={cx} cy={cx} r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={strokeWidth}
        />
        {/* Progress */}
        <circle
          cx={cx} cy={cx} r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cx})`}
          className={s.progress}
        />
      </svg>
      {showLabel && (
        <span className={s.label} style={{ fontSize, color: stroke }}>
          {clamped}
        </span>
      )}
    </div>
  );
}
