'use client';

import { type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getActiveNavId } from '@/config/nav';
import s from './VdfBottomNav.module.css';

export interface VdfBottomNavProps {
  /** Called when the "More" tab is pressed — opens the sidebar */
  onMorePress: () => void;
}

interface BottomTab {
  id: string;
  label: string;
  href: string | null;
  icon: ReactNode;
}

const TABS: BottomTab[] = [
  {
    id: 'dashboard',
    label: 'Home',
    href: '/dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    id: 'contacts',
    label: 'Contacts',
    href: '/contacts',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    id: 'clients',
    label: 'Clients',
    href: '/clients',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87" />
        <path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    id: 'portfolio',
    label: 'Portfolio',
    href: '/portfolio',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
        <path d="M21 12V7H5a2 2 0 010-4h14v4" />
        <path d="M3 5v14a2 2 0 002 2h16v-5" />
        <circle cx="18" cy="14" r="2" />
      </svg>
    ),
  },
  {
    id: 'more',
    label: 'More',
    href: null,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
        <rect x="3"  y="3"  width="7" height="7" rx="1" />
        <rect x="14" y="3"  width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
        <rect x="3"  y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
];

export function VdfBottomNav({ onMorePress }: VdfBottomNavProps) {
  const pathname = usePathname();
  const router   = useRouter();
  const activeId = getActiveNavId(pathname);

  return (
    <nav className={s.nav} role="navigation" aria-label="Main navigation">
      {TABS.map(tab => {
        const isActive = tab.id !== 'more' && activeId === tab.id;
        return (
          <button
            key={tab.id}
            className={`${s.tab} ${isActive ? s.tabActive : ''}`}
            onClick={() => tab.href ? router.push(tab.href) : onMorePress()}
            aria-label={tab.label}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className={s.icon}>{tab.icon}</span>
            <span className={s.label}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
