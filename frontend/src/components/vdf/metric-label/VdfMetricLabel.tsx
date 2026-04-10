'use client';

/**
 * VdfMetricLabel — stacked label + value pair for summary displays.
 *
 * Used on the populated snapshot view (net worth breakdown, health
 * ring annotations, pulse sidebar values) and anywhere a metric
 * needs a consistent label + value presentation.
 *
 * variant="mono"  → value in JetBrains Mono (financial figures)
 * variant="default" → value in body font
 *
 * size="sm" → compact (inline, dense grids)
 * size="md" → default (sidebar, cards)
 * size="lg" → prominent (net worth hero)
 */

import s from './VdfMetricLabel.module.css';

export interface VdfMetricLabelProps {
  label: string;
  value: string | number;
  /** mono = JetBrains Mono for financial figures; default = body font */
  variant?: 'default' | 'mono';
  size?: 'sm' | 'md' | 'lg';
  /** Semantic colour override for the value */
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'muted';
  className?: string;
}

export function VdfMetricLabel({
  label,
  value,
  variant = 'mono',
  size = 'md',
  tone = 'default',
  className,
}: VdfMetricLabelProps) {
  return (
    <div className={`${s.wrap} ${s[size]} ${className || ''}`}>
      <span className={s.label}>{label}</span>
      <span className={`${s.value} ${s[variant]} ${s[`tone_${tone}`]}`}>
        {value}
      </span>
    </div>
  );
}

export default VdfMetricLabel;
