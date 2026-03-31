'use client';

import { type ReactNode } from 'react';
import s from './nav-rail.module.css';

interface NavItem {
  id: string;
  icon: ReactNode;
  label: string;
  href?: string;
}

interface NavRailProps {
  items: NavItem[];
  activeId: string;
  onNavigate: (id: string) => void;
  logo?: ReactNode;
  footer?: ReactNode;
}

export default function NavRail({ items, activeId, onNavigate, logo, footer }: NavRailProps) {
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
