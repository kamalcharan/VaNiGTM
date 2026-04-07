/**
 * KI-Prime — Centralized Navigation Config
 *
 * Single source of truth for all sidebar navigation items.
 * Each item maps to a skill + function + recipe.
 * Used by VdfSidebar. Ordered by user workflow priority.
 */

import { type ReactNode } from 'react';

export interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  href: string;
  section: 'main' | 'data' | 'system';
  /** If true, item is only shown to users with isAdmin = true */
  adminOnly?: boolean;
  /** Skill to execute when this item is activated */
  skill?: string;
  /** Default function to call on the skill */
  fn?: string;
  /** Recipe to render the result */
  recipe?: string;
}

/* ── SVG icon helpers ────────────────────────────────── */

function Icon({ children, ...props }: { children: ReactNode } & React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" width="20" height="20" {...props}>
      {children}
    </svg>
  );
}

/* ── Navigation Items ────────────────────────────────── */

export const NAV_ITEMS: NavItem[] = [

  /* ── MAIN (core advisory workflow) ─────────────────── */

  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <Icon><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></Icon>,
    href: '/dashboard',
    section: 'main',
    skill: 'alert-skill',
    fn: 'generate_daily_briefing',
    recipe: 'daily-briefing',
  },
  {
    id: 'contacts',
    label: 'Contacts',
    icon: <Icon><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></Icon>,
    href: '/contacts',
    section: 'main',
    skill: 'contact-skill',
    fn: 'get_contacts',
    recipe: 'contact-list',
  },
  {
    id: 'clients',
    label: 'Clients',
    icon: <Icon><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></Icon>,
    href: '/clients',
    section: 'main',
    skill: 'client-skill',
    fn: 'get_clients',
    recipe: 'client-list',
  },
  {
    id: 'portfolio',
    label: 'Portfolio',
    icon: <Icon><path d="M21 12V7H5a2 2 0 010-4h14v4" /><path d="M3 5v14a2 2 0 002 2h16v-5" /><circle cx="18" cy="14" r="2" /></Icon>,
    href: '/portfolio',
    section: 'main',
    skill: 'portfolio-skill',
    fn: 'get_holdings',
    recipe: 'portfolio-view',
  },
  {
    id: 'transactions',
    label: 'Transactions',
    icon: <Icon><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></Icon>,
    href: '/transactions',
    section: 'main',
    skill: 'transaction-skill',
    fn: 'get_transactions',
    recipe: 'data-table',
  },
  {
    id: 'goals',
    label: 'Goals',
    icon: <Icon><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></Icon>,
    href: '/goals',
    section: 'main',
    skill: 'planning-skill',
    fn: 'get_goals',
    recipe: 'goal-dashboard',
  },
  {
    id: 'planning',
    label: 'Planning',
    icon: <Icon><path d="M2 20h20" /><path d="M5 20V10l4-5 4 3 4-6 3 4v14" /></Icon>,
    href: '/planning',
    section: 'main',
    skill: 'planning-skill',
    fn: 'run_projection',
    recipe: 'planning-playground',
  },
  {
    id: 'my-nav',
    label: 'My NAV',
    icon: <Icon><path d="M5 12h14" /><path d="M12 5l7 7-7 7" /></Icon>,
    href: '/my-nav',
    section: 'main',
    skill: 'market-skill',
    fn: 'get_bookmarks',
    recipe: 'my-nav',
  },

  /* ── DATA (import, ETL, operations) ────────────────── */

  {
    id: 'market-dashboard',
    label: 'Market',
    icon: <Icon><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 10l3 3 3-3 4 4" /></Icon>,
    href: '/market/dashboard',
    section: 'data',
    skill: 'market-skill',
    fn: 'get_market_stats',
    recipe: 'market-dashboard',
  },
  {
    id: 'market-history',
    label: 'Market Data',
    icon: <Icon><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></Icon>,
    href: '/market/history',
    section: 'data',
    adminOnly: true,
    skill: 'market-skill',
    fn: 'get_market_indices',
    recipe: 'market-history',
  },
  {
    id: 'global-nav',
    label: 'Global NAV',
    icon: <Icon><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></Icon>,
    href: '/global-nav',
    section: 'data',
    adminOnly: true,
    skill: 'market-skill',
    fn: 'search_schemes',
    recipe: 'scheme-explorer',
  },
  {
    id: 'import-dashboard',
    label: 'Import Dashboard',
    icon: <Icon><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></Icon>,
    href: '/import-dashboard',
    section: 'data',
    skill: 'etl-skill',
    fn: 'get_import_sessions',
    recipe: 'data-table',
  },
  {
    id: 'import',
    label: 'Import Data',
    icon: <Icon><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></Icon>,
    href: '/import',
    section: 'data',
    skill: 'etl-skill',
    fn: 'start_import',
    recipe: 'import-wizard',
  },
  {
    id: 'cruise-control',
    label: 'Cruise Control',
    icon: <Icon><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></Icon>,
    href: '/cruise-control',
    section: 'data',
    skill: 'etl-skill',
    fn: 'get_system_status',
    recipe: 'cruise-control',
  },
  {
    id: 'course-correction',
    label: 'Course Correction',
    icon: <Icon><line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 01-9 9" /></Icon>,
    href: '/course-correction',
    section: 'data',
    skill: 'etl-skill',
    fn: 'get_corrections',
    recipe: 'course-correction',
  },
  {
    id: 'master-data',
    label: 'Master Data',
    icon: <Icon><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></Icon>,
    href: '/master-data',
    section: 'data',
    adminOnly: true,
  },

  /* ── SYSTEM (alerts, reports, settings) ─────────────── */

  {
    id: 'alerts',
    label: 'Alerts',
    icon: <Icon><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></Icon>,
    href: '/alerts',
    section: 'system',
    skill: 'alert-skill',
    fn: 'get_alerts',
    recipe: 'briefing-panel',
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: <Icon><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></Icon>,
    href: '/reports',
    section: 'system',
    skill: 'report-skill',
    fn: 'list_reports',
    recipe: 'data-table',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <Icon>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </Icon>
    ),
    href: '/settings',
    section: 'system',
  },
];

/**
 * Resolve the active nav item from the current pathname.
 */
export function getActiveNavId(pathname: string): string {
  const exact = NAV_ITEMS.find((item) => item.href === pathname);
  if (exact) return exact.id;

  // Market sub-routes: /market/dashboard → market-dashboard, /market/history|indices → market-history
  if (pathname.startsWith('/market/dashboard')) return 'market-dashboard';
  if (pathname.startsWith('/market/')) return 'market-history';

  // Contact/client profile pages
  if (pathname.startsWith('/contacts')) return 'contacts';
  if (pathname.startsWith('/clients'))  return 'clients';

  const prefix = NAV_ITEMS.find((item) => item.href !== '/' && pathname.startsWith(item.href));
  if (prefix) return prefix.id;

  return 'dashboard';
}
