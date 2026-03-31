'use client';

import s from './tabs.module.css';

interface Tab {
  id: string;
  label: string;
  icon?: string;
}

interface TabsProps {
  tabs: Tab[];
  activeId: string;
  onChange: (id: string) => void;
  orientation?: 'horizontal' | 'vertical';
}

export default function Tabs({ tabs, activeId, onChange, orientation = 'horizontal' }: TabsProps) {
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
