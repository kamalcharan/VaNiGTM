'use client';

import { type ReactNode } from 'react';
import s from './VdfDashPanel.module.css';

export interface VdfDashPanelProps {
  /** Panel title shown top-left */
  title: string;
  /** If provided, renders a "View all →" link top-right */
  href?: string;
  /** Optional small muted text rendered at the bottom of the panel */
  footer?: string;
  /** Panel body content */
  children: ReactNode;
  className?: string;
}

/**
 * VdfDashPanel — standard dashboard panel container.
 *
 * Provides the consistent chrome used across every dashboard section:
 * glassmorphic card shell, title / view-all header row, body slot,
 * and an optional footer line. Internal content is fully flexible.
 *
 * Usage:
 *   <VdfDashPanel title="Goals Overview" href="/goals" footer="Last calc 6:00 AM">
 *     <GoalsBody />
 *   </VdfDashPanel>
 */
export function VdfDashPanel({ title, href, footer, children, className }: VdfDashPanelProps) {
  return (
    <div className={`${s.panel} ${className ?? ''}`}>
      <div className={s.header}>
        <span className={s.title}>{title}</span>
        {href && (
          <a href={href} className={s.viewAll}>
            View all →
          </a>
        )}
      </div>

      <div className={s.body}>{children}</div>

      {footer && (
        <p className={s.footer}>{footer}</p>
      )}
    </div>
  );
}
