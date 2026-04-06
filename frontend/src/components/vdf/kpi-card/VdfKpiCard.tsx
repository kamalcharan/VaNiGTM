'use client';

import type { ReactNode } from 'react';
import s from './VdfKpiCard.module.css';

export interface VdfKpiCardProps {
  /** Section label shown top-left (e.g. "Best Performer") */
  title: string;
  /** Single character or emoji icon */
  icon: string;
  /** CSS color for the icon */
  iconColor?: string;
  /** Navigate on click */
  onClick?: () => void;
  /** Card body content */
  children: ReactNode;
  className?: string;
}

/**
 * VdfKpiCard — glass card with a labelled header, icon, and flexible body.
 * Used on data dashboard pages for KPI / performer highlights.
 * Internal content (name, value, breadth bar, etc.) is provided via children.
 */
export function VdfKpiCard({ title, icon, iconColor, onClick, children, className }: VdfKpiCardProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      className={`${s.card} ${onClick ? s.clickable : ''} ${className || ''}`}
      {...(onClick ? { onClick, type: 'button' as const } : {})}
    >
      <div className={s.header}>
        <span className={s.icon} style={iconColor ? { color: iconColor } : undefined}>{icon}</span>
        <span className={s.title}>{title}</span>
      </div>
      <div className={s.body}>{children}</div>
    </Tag>
  );
}
