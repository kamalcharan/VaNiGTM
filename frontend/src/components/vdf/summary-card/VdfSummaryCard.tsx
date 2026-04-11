'use client';

import s from './VdfSummaryCard.module.css';

export type SummaryAccent = 'primary' | 'success' | 'warning' | 'info' | 'danger';

export interface VdfSummaryCardProps {
  /** Small-caps mono eyebrow label, e.g. "TOTAL AUM" */
  eyebrow: string;
  /** Large display value, e.g. "₹12.4 Cr" or "147" */
  value: string | number;
  /** Secondary line below value, e.g. "+2.3% MTD" or "of 163 total" */
  sub?: string;
  /** Left-accent bar colour */
  accent?: SummaryAccent;
  /** Mark sub text as positive/negative for colour coding */
  subTone?: 'up' | 'down' | 'neutral';
  /** Optional click handler */
  onClick?: () => void;
  className?: string;
}

export function VdfSummaryCard({
  eyebrow,
  value,
  sub,
  accent = 'primary',
  subTone = 'neutral',
  onClick,
  className,
}: VdfSummaryCardProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      className={`${s.card} ${s[`accent_${accent}`]} ${onClick ? s.clickable : ''} ${className ?? ''}`}
      {...(onClick ? { onClick, type: 'button' as const } : {})}
    >
      <div className={s.accentBar} />
      <p className={s.eyebrow}>{eyebrow}</p>
      <p className={s.value}>{typeof value === 'number' ? value.toLocaleString('en-IN') : value}</p>
      {sub && (
        <p className={`${s.sub} ${s[`sub_${subTone}`]}`}>{sub}</p>
      )}
    </Tag>
  );
}
