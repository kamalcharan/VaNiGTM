/**
 * KI-Prime — Centralized Navigation Config
 *
 * Single source of truth for all sidebar navigation items.
 * Maps to recipes and routes. Used by VdfSidebar.
 */

import { type ReactNode } from 'react';

export interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  href: string;
  section: 'main' | 'settings';
}

/* ── SVG icon helper ─────────────────────────────────── */

function Icon({ d, ...props }: { d: string } & React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="20" height="20" {...props}>
      <path d={d} />
    </svg>
  );
}

/* ── Navigation Items ────────────────────────────────── */

export const NAV_ITEMS: NavItem[] = [
  // Main features
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <Icon d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10" />,
    href: '/dashboard',
    section: 'main',
  },
  {
    id: 'clients',
    label: 'Clients',
    icon: <Icon d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75 M9 7a4 4 0 100-8 4 4 0 000 8z" />,
    href: '/clients',
    section: 'main',
  },
  {
    id: 'portfolio',
    label: 'Portfolio',
    icon: <Icon d="M21 12V7H5a2 2 0 010-4h14v4 M3 5v14a2 2 0 002 2h16v-5 M18 12a2 2 0 100 4 2 2 0 000-4z" />,
    href: '/portfolio',
    section: 'main',
  },
  {
    id: 'goals',
    label: 'Goals',
    icon: <Icon d="M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5" />,
    href: '/goals',
    section: 'main',
  },
  {
    id: 'planning',
    label: 'Planning',
    icon: <Icon d="M2 20h20 M5 20V10l4-5 4 3 4-6 3 4v14" />,
    href: '/planning',
    section: 'main',
  },
  {
    id: 'market',
    label: 'Market',
    icon: <Icon d="M18 20V10 M12 20V4 M6 20v-6" />,
    href: '/market',
    section: 'main',
  },

  // Settings (below separator)
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    ),
    href: '/settings',
    section: 'settings',
  },
];

/**
 * Resolve the active nav item from the current pathname.
 */
export function getActiveNavId(pathname: string): string {
  // Exact match first
  const exact = NAV_ITEMS.find((item) => item.href === pathname);
  if (exact) return exact.id;

  // Prefix match (e.g. /clients/123 → clients)
  const prefix = NAV_ITEMS.find((item) => item.href !== '/' && pathname.startsWith(item.href));
  if (prefix) return prefix.id;

  return 'dashboard';
}
