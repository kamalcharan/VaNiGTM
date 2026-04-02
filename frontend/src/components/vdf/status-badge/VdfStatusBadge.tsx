'use client';

import s from './VdfStatusBadge.module.css';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted';
export type BadgeSize = 'sm' | 'md';

export interface VdfStatusBadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
}

export function VdfStatusBadge({ label, variant = 'muted', size = 'md', className }: VdfStatusBadgeProps) {
  return (
    <span className={`${s.badge} ${s[`v_${variant}`]} ${s[`s_${size}`]} ${className || ''}`}>
      {label}
    </span>
  );
}
