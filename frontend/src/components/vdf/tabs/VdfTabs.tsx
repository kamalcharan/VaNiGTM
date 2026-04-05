'use client';

import s from './VdfTabs.module.css';

export interface VdfTab {
  id: string;
  label: string;
  icon?: string;
  badge?: string | number;
}

export interface VdfTabsProps {
  tabs: VdfTab[];
  activeId: string;
  onChange: (id: string) => void;
  orientation?: 'horizontal' | 'vertical';
  /** pill — glass container, filled active tab (page-level navigation)
   *  underline — border-bottom style (settings/detail panels) */
  variant?: 'underline' | 'pill';
}

export function VdfTabs({ tabs, activeId, onChange, orientation = 'horizontal', variant = 'underline' }: VdfTabsProps) {
  return (
    <nav
      className={`${s.tabs} ${variant === 'pill' ? s.pill : s[orientation]}`}
      role="tablist"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeId === tab.id}
          className={`${s.tab} ${activeId === tab.id ? s.active : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.icon && <span className={s.icon}>{tab.icon}</span>}
          <span>{tab.label}</span>
          {tab.badge !== undefined && (
            <span className={s.badge}>{tab.badge}</span>
          )}
        </button>
      ))}
    </nav>
  );
}
