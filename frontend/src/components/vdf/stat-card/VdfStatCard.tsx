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
  /** Makes the card a clickable filter button */
  onClick?: () => void;
  /** Highlights the card as the active filter */
  active?: boolean;
}

export function VdfStatCard({ value, label, accent = 'default', pct, className, onClick, active }: VdfStatCardProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      className={`${s.card} ${s[`a_${accent}`]} ${onClick ? s.clickable : ''} ${active ? s.activeFilter : ''} ${className || ''}`}
      {...(onClick ? { onClick, type: 'button' as const } : {})}
    >
      <span className={s.value}>{typeof value === 'number' ? value.toLocaleString() : value}</span>
      <span className={s.label}>{label}</span>
      {pct && <span className={s.pct}>{pct}</span>}
    </Tag>
  );
}
