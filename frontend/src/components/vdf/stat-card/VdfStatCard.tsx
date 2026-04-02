'use client';

import s from './VdfStatCard.module.css';

export type StatAccent = 'default' | 'success' | 'danger' | 'warning' | 'info';

export interface VdfStatCardProps {
  value: string | number;
  label: string;
  accent?: StatAccent;
  /** Optional percentage shown top-right */
  pct?: string;
  className?: string;
}

export function VdfStatCard({ value, label, accent = 'default', pct, className }: VdfStatCardProps) {
  return (
    <div className={`${s.card} ${s[`a_${accent}`]} ${className || ''}`}>
      <span className={s.value}>{typeof value === 'number' ? value.toLocaleString() : value}</span>
      <span className={s.label}>{label}</span>
      {pct && <span className={s.pct}>{pct}</span>}
    </div>
  );
}
