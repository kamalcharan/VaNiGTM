'use client';

import { type ReactNode } from 'react';
import s from './VdfEmptyState.module.css';

export interface VdfEmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function VdfEmptyState({ icon, title, description, action, className }: VdfEmptyStateProps) {
  return (
    <div className={`${s.empty} ${className || ''}`}>
      {icon && <div className={s.icon}>{icon}</div>}
      <h3 className={s.title}>{title}</h3>
      {description && <p className={s.desc}>{description}</p>}
      {action && <div className={s.action}>{action}</div>}
    </div>
  );
}
