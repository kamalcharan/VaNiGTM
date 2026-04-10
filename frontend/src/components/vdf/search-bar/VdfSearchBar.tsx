'use client';

import { type ReactNode } from 'react';
import s from './VdfSearchBar.module.css';

export interface VdfSearchPill {
  id: string;
  label: string;
  color?: string; /* CSS var e.g. var(--color-info) — used when active */
}

export interface VdfSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch?: () => void;   /* called on Enter key or icon click — if omitted, searches on every change */
  placeholder?: string;
  pills?: VdfSearchPill[];
  activePill?: string;
  onPillChange?: (id: string) => void;
  addon?: ReactNode; /* right-side slot: bookmark toggle, icon buttons, etc. */
  className?: string;
}

export function VdfSearchBar({
  value,
  onChange,
  onSearch,
  placeholder = 'Search…',
  pills,
  activePill,
  onPillChange,
  addon,
  className,
}: VdfSearchBarProps) {
  return (
    <div className={`${s.bar} ${className || ''}`}>
      {/* Search input */}
      <div className={s.searchWrap}>
        <button
          type="button"
          className={s.searchIconBtn}
          onClick={onSearch}
          tabIndex={onSearch ? 0 : -1}
          aria-label="Search"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </button>
        <input
          className={s.searchInput}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onSearch?.()}
          placeholder={placeholder}
        />
      </div>

      {/* Filter pills */}
      {pills && pills.length > 0 && (
        <div className={s.pills}>
          {pills.map(pill => {
            const isActive = activePill === pill.id;
            return (
              <button
                key={pill.id}
                className={`${s.pill} ${isActive ? s.pillActive : ''}`}
                style={isActive && pill.color ? { borderColor: pill.color, color: pill.color } : undefined}
                onClick={() => onPillChange?.(pill.id)}
              >
                {pill.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Right-side addon slot */}
      {addon && <div className={s.addon}>{addon}</div>}
    </div>
  );
}
