'use client';

import type { ReactNode } from 'react';
import s from './VdfErrorScreen.module.css';

export interface VdfErrorScreenProps {
  /** HTTP-style code shown above the title — e.g. "403", "404", "500" */
  code?: string | number;
  /** Emoji or icon character */
  icon?: string;
  title: string;
  description?: string;
  /** Action button(s) rendered below the description */
  action?: ReactNode;
  /** Extra class for the root element */
  className?: string;
}

/**
 * VdfErrorScreen — centered error state for 403, 404, 500, etc.
 *
 * Renders as a flex-centered block within its container.
 * Use inside the app shell (has sidebar) for 403 / render errors.
 * Use as a standalone full-viewport page for 404.
 */
export function VdfErrorScreen({
  code,
  icon,
  title,
  description,
  action,
  className,
}: VdfErrorScreenProps) {
  return (
    <div className={`${s.wrap} ${className || ''}`}>
      <div className={s.card}>
        {icon && <div className={s.icon}>{icon}</div>}
        {code && <div className={s.code}>{code}</div>}
        <h1 className={s.title}>{title}</h1>
        {description && <p className={s.description}>{description}</p>}
        {action && <div className={s.actions}>{action}</div>}
      </div>
    </div>
  );
}
