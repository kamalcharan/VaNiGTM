'use client';

import { type ReactNode } from 'react';
import s from './VdfPageHeader.module.css';

export interface VdfPageHeaderProps {
  /** Small-caps label above the title, e.g. "CLIENT REGISTRY" */
  eyebrow?: string;
  title: string;
  /** Italic suffix on the title, e.g. titleEm="Overview" → "Dashboard — Overview" */
  titleEm?: string;
  /** Line below the title — count text, stat pills, etc. */
  meta?: ReactNode;
  /** Right side of the title row — action buttons */
  actions?: ReactNode;
  className?: string;
}

export function VdfPageHeader({
  eyebrow,
  title,
  titleEm,
  meta,
  actions,
  className,
}: VdfPageHeaderProps) {
  return (
    <header className={`${s.header} ${className ?? ''}`}>
      <div className={s.headerRow}>
        <div className={s.titleArea}>
          {eyebrow && <p className={s.eyebrow}>{eyebrow}</p>}
          <h1 className={s.title}>
            {title}
            {titleEm && <em> {titleEm}</em>}
          </h1>
          {meta && <div className={s.meta}>{meta}</div>}
        </div>
        {actions && <div className={s.actions}>{actions}</div>}
      </div>
    </header>
  );
}
