'use client';

import { type ReactNode } from 'react';
import s from './VdfNavRail.module.css';

interface VdfNavItem {
  id: string;
  icon: ReactNode;
  label: string;
  href?: string;
}

export interface VdfNavRailProps {
  items: VdfNavItem[];
  activeId: string;
  onNavigate: (id: string) => void;
  logo?: ReactNode;
  footer?: ReactNode;
}

export function VdfNavRail({ items, activeId, onNavigate, logo, footer }: VdfNavRailProps) {
  return (
    <nav className={s.rail}>
      {logo && <div className={s.logo}>{logo}</div>}

      <div className={s.items}>
        {items.map((item) => (
          <button
            key={item.id}
            className={`${s.item} ${activeId === item.id ? s.active : ''}`}
            onClick={() => onNavigate(item.id)}
            title={item.label}
            aria-label={item.label}
          >
            <span className={s.icon}>{item.icon}</span>
          </button>
        ))}
      </div>

      {footer && <div className={s.footer}>{footer}</div>}
    </nav>
  );
}
