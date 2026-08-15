/**
 * VaNi-GTM — Centralized Navigation Config
 *
 * Single source of truth for the sidebar. Consumed by VdfSidebar.
 *
 * ── PATHWAYS, NOT DESTINATIONS ─────────────────────────────────────────────
 *
 * The nav used to be eleven flat destinations — places you could go, in no
 * particular order, with no indication of which one you needed. It is now five
 * groups, and inside them two DIFFERENT KINDS of item:
 *
 *   kind: 'pathway'    something you DO. Reads as a verb phrase. Has an order,
 *                      a progress indicator and a next step. "Build the
 *                      audience", "Run a campaign".
 *
 *   kind: 'reference'  something you LOOK AT. Reads as a noun. No order, no
 *                      completion. "People", "Journeys".
 *
 * The distinction has to be VISIBLE, not just modelled — a reader should see
 * which items are work and which are lookups without being told. VdfSidebar
 * renders reference items indented, smaller, and under a divider.
 *
 * `coming: true` marks a pathway that has a route and a nav entry but is not
 * built. Nova is deliberately present while empty: an empty group that shows
 * what is coming beats a surprise reorganisation later, and it forces the
 * hierarchy to be right from the start.
 */

import { type ReactNode } from 'react';

export type NavKind = 'pathway' | 'reference';

export interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  href: string;
  kind: NavKind;
  /** Route and nav entry exist; the surface does not. Rendered as "coming". */
  coming?: boolean;
  /** If true, item is only shown to users with isAdmin = true */
  adminOnly?: boolean;
  /** Skill to execute when this item is activated */
  skill?: string;
  /** Default function to call on the skill */
  fn?: string;
  /** Recipe to render the result */
  recipe?: string;
}

export interface NavGroup {
  id: string;
  /** Group heading — TODAY, BRAIN, GTM, NOVA, SETTINGS. */
  label: string;
  /** One-line gloss under the heading. Omitted for self-evident groups. */
  caption?: string;
  /**
   * When a group IS itself a destination (TODAY), this is where it goes and
   * the group renders as a single clickable row rather than a heading.
   */
  href?: string;
  items: NavItem[];
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

/* ── The five groups ─────────────────────────────────── */

export const NAV_GROUPS: NavGroup[] = [

  /* ── TODAY ─────────────────────────────────────────── */
  // A group with no children: it is one row that goes somewhere. Lands on the
  // existing dashboard for now; the daily queue (G3) drops in here later
  // without the navigation moving again.
  {
    id: 'today',
    label: 'Today',
    href: '/today',
    items: [
      {
        id: 'today',
        label: 'Today',
        icon: <Icon><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>,
        href: '/today',
        kind: 'pathway',
      },
    ],
  },

  /* ── BRAIN ─────────────────────────────────────────── */
  {
    id: 'brain',
    label: 'Brain',
    caption: 'what VaNi knows about this tenant',
    items: [
      {
        id: 'brain-mission',
        label: 'Mission Wizard',
        icon: <Icon><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" /></Icon>,
        href: '/brain/mission',
        kind: 'pathway',
      },
      {
        id: 'brain-teach',
        label: 'Teach VaNi',
        icon: <Icon><path d="M12 2a7 7 0 00-7 7c0 2.4 1.2 4.4 3 5.7V17a2 2 0 002 2h4a2 2 0 002-2v-2.3c1.8-1.3 3-3.3 3-5.7a7 7 0 00-7-7z" /><line x1="10" y1="22" x2="14" y2="22" /></Icon>,
        href: '/brain/teach',
        kind: 'pathway',
      },
      {
        // The group's own caption describes a surface that does not exist yet:
        // somewhere to SEE what VaNi knows, as opposed to feeding it more.
        // Marked coming rather than pointed at Teach VaNi — two entries landing
        // on one page reads as a bug.
        id: 'brain-knowledge',
        label: 'Knowledge',
        icon: <Icon><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></Icon>,
        href: '/brain/knowledge',
        kind: 'reference',
        coming: true,
      },
      {
        // A Brain object (Intelligent Add Offers, 2026-08-15), not a step
        // inside the mission stepper — no fixed order, no single "done": a
        // tenant maintains N offers, each confirmed independently. Same
        // shape as Knowledge, not Mission Wizard.
        id: 'brain-offers',
        label: 'Offers',
        icon: <Icon><path d="M20.59 13.41 12 22l-9-9V4a1 1 0 011-1h9l9 9a2 2 0 010 2.83z" /><circle cx="7.5" cy="7.5" r="1.5" /></Icon>,
        href: '/brain/offers',
        kind: 'reference',
      },
    ],
  },

  /* ── GTM ───────────────────────────────────────────── */
  {
    id: 'gtm',
    label: 'GTM',
    caption: 'Aria',
    items: [
      {
        id: 'gtm-audience',
        label: 'Build the audience',
        icon: <Icon><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Icon>,
        href: '/gtm/audience',
        kind: 'pathway',
      },
      {
        id: 'gtm-motion',
        label: 'Put them in motion',
        icon: <Icon><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></Icon>,
        href: '/gtm/motion',
        kind: 'pathway',
        skill: 'campaign-skill',
        fn: 'get_campaigns',
        recipe: 'campaign-list',
      },
      // ── Reference surfaces ──────────────────────────────────────────
      // Research, Prospects and VaNi Leads are ALSO steps of the audience
      // pathway, and they are listed here as well. That is deliberate.
      //
      // The brief mapped them to G1 steps 1-3 ("Find", "Qualify", "Find
      // people"), which flattens what they actually are. Research is three
      // workflows — what you sell, research a cohort, read the briefs.
      // Prospects is the tenant's imported record set. VaNi Leads is the
      // assessment funnel's console, whose leads arrive from LinkedIn traffic
      // and have nothing to do with researching companies.
      //
      // Reachable ONLY as pathway steps, they became invisible: three
      // substantial surfaces with no entry of their own. By this file's own
      // model they are reference — nouns you look at — so they are listed as
      // reference, exactly like People and Journeys. The pathway keeps the
      // ordered walk; these give the direct route back.
      {
        id: 'gtm-research',
        label: 'Research',
        icon: <Icon><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /><path d="M11 8v6M8 11h6" /></Icon>,
        href: '/gtm/audience/find',
        kind: 'reference',
        skill: 'research-skill',
        fn: 'get_briefs',
        recipe: 'brief-list',
      },
      {
        id: 'gtm-prospects',
        label: 'Prospects',
        icon: <Icon><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" /></Icon>,
        href: '/gtm/audience/qualify',
        kind: 'reference',
        skill: 'prospect-skill',
        fn: 'get_records',
        recipe: 'record-list',
      },
      {
        id: 'gtm-leads',
        label: 'VaNi Leads',
        icon: <Icon><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 2" /></Icon>,
        href: '/gtm/audience/people',
        kind: 'reference',
        skill: 'assessment-skill',
        fn: 'get_leads',
        recipe: 'lead-list',
      },
      {
        id: 'gtm-people',
        label: 'People',
        icon: <Icon><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></Icon>,
        href: '/gtm/people',
        kind: 'reference',
        skill: 'contact-skill',
        fn: 'get_contacts',
        recipe: 'contact-list',
      },
      {
        id: 'gtm-journeys',
        label: 'Journeys',
        icon: <Icon><path d="M3 12h4l3 8 4-16 3 8h4" /></Icon>,
        href: '/gtm/journeys',
        kind: 'reference',
        skill: 'journey-skill',
        fn: 'list_journeys',
        recipe: 'journey-board',
      },
    ],
  },

  /* ── NOVA ──────────────────────────────────────────── */
  // Present while empty, on purpose. See the header note.
  {
    id: 'nova',
    label: 'Nova',
    caption: 'Digital',
    items: [
      {
        id: 'nova-estate',
        label: 'Fix the digital estate',
        icon: <Icon><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 18v3" /></Icon>,
        href: '/nova/estate',
        kind: 'pathway',
        coming: true,
      },
      {
        id: 'nova-campaign',
        label: 'Run a campaign',
        icon: <Icon><path d="M3 11l18-8-8 18-2-8-8-2z" /></Icon>,
        href: '/nova/campaign',
        kind: 'pathway',
        coming: true,
      },
    ],
  },

  /* ── SETTINGS ──────────────────────────────────────── */
  // Settings itself, plus the operational surfaces the five-group structure
  // has no other home for. They keep their URLs and stay reachable — a page
  // with no way to navigate to it is a page nobody finds, which this project
  // has already been bitten by once.
  {
    id: 'settings',
    label: 'Settings',
    caption: 'Integrations · Profile · Team',
    items: [
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
        kind: 'reference',
      },
      {
        id: 'import',
        label: 'Import Data',
        icon: <Icon><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></Icon>,
        href: '/import',
        kind: 'reference',
        skill: 'etl-skill',
        fn: 'start_import',
        recipe: 'import-wizard',
      },
      {
        id: 'import-dashboard',
        label: 'Import Dashboard',
        icon: <Icon><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></Icon>,
        href: '/import-dashboard',
        kind: 'reference',
        skill: 'etl-skill',
        fn: 'get_import_sessions',
        recipe: 'data-table',
      },
      {
        id: 'common-pool',
        label: 'Common Pool',
        icon: <Icon><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 010 18a15 15 0 010-18z" /></Icon>,
        href: '/common-pool',
        kind: 'reference',
        adminOnly: true,
        skill: 'prospect-skill',
        fn: 'get_records',
        recipe: 'record-list',
      },
      {
        id: 'reports',
        label: 'Reports',
        icon: <Icon><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></Icon>,
        href: '/reports',
        kind: 'reference',
        skill: 'report-skill',
        fn: 'list_reports',
        recipe: 'data-table',
      },
      {
        id: 'demo-data',
        label: 'Demo Data',
        icon: <Icon><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></Icon>,
        href: '/demo-data',
        kind: 'reference',
        skill: 'campaign-skill',
        fn: 'seed_demo_data',
      },
    ],
  },
];

/** Flat view, for lookups that do not care about grouping. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/**
 * Resolve the active nav item from the current pathname.
 *
 * Longest-prefix wins, so /gtm/audience/qualify activates "Build the
 * audience" rather than whichever shorter route happened to match first.
 */
export function getActiveNavId(pathname: string | null): string {
  if (!pathname) return 'today';

  const exact = NAV_ITEMS.find((item) => item.href === pathname);
  if (exact) return exact.id;

  const prefixed = NAV_ITEMS
    .filter((item) => item.href !== '/' && pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return prefixed?.id ?? 'today';
}

/* ── Breadcrumbs ─────────────────────────────────────── */

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Build a breadcrumb trail FROM THE URL, never from where the user clicked.
 *
 * `/gtm/audience/qualify` → GTM › Build the audience › Qualify
 *
 * Deriving from the route means a deep link, a refresh and a back-button all
 * produce the same trail as clicking through — which is the whole point, and
 * is not true of click-history breadcrumbs.
 *
 * The trailing segment is title-cased from the URL when it is not a known nav
 * item, so pathway steps get a sensible crumb without being registered here.
 */
export function breadcrumbsFor(pathname: string | null): Crumb[] {
  if (!pathname || pathname === '/') return [];

  const crumbs: Crumb[] = [];
  const group = NAV_GROUPS.find((g) =>
    g.items.some((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)),
  );
  if (!group) return [];

  // A group that is itself a destination contributes one crumb, not two.
  if (group.href) return [{ label: group.label, href: group.href }];

  crumbs.push({ label: group.label });

  const item = group.items
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (!item) return crumbs;

  crumbs.push({ label: item.label, href: item.href });

  const rest = pathname.slice(item.href.length).replace(/^\/+|\/+$/g, '');
  if (rest) {
    for (const seg of rest.split('/')) {
      crumbs.push({ label: titleCase(seg) });
    }
  }
  return crumbs;
}

function titleCase(segment: string): string {
  return segment
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
