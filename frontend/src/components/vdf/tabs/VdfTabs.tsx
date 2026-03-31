'use client';

import s from './VdfTabs.module.css';

interface VdfTab {
  id: string;
  label: string;
  icon?: string;
}

export interface VdfTabsProps {
  tabs: VdfTab[];
  activeId: string;
  onChange: (id: string) => void;
  orientation?: 'horizontal' | 'vertical';
}

export function VdfTabs({ tabs, activeId, onChange, orientation = 'horizontal' }: VdfTabsProps) {
  return (
    <nav className={`${s.tabs} ${s[orientation]}`} role="tablist">
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
        </button>
      ))}
    </nav>
  );
}
