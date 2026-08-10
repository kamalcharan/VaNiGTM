/**
 * VaNi GTM — the one place that records what moved, and why.
 *
 * The navigation restructure turned destinations into pathways. Every old URL
 * still resolves; nothing 404s. Deep links live in emails, docs, bookmarks and
 * browser history, and none of those get rewritten when we reorganise a menu.
 *
 * Plain JavaScript, not TypeScript, because next.config.js has to require() it
 * at build time to emit the redirects. `route-map.ts` re-exports it for
 * application code so there is still exactly one list.
 *
 * ── A CORRECTION TO THE WORK ORDER'S TABLE ─────────────────────────────────
 *
 * The brief's redirect table lists `/mission-wizard`, `/teach-vani`,
 * `/vani-leads` and `/follow-ups`. Those are the NAV LABELS, not the routes —
 * none of them exists in the app. The real paths are `/onboarding`,
 * `/knowledge`, `/console` and `/pulses`.
 *
 * Following the table literally would have produced redirects for URLs nobody
 * holds while leaving the four URLs people actually have bookmarked to 404 —
 * the precise opposite of the brief's own constraint. So both are here: the
 * real paths (which matter) and the brief's names (which cost nothing and
 * make the table true if anyone ever typed one).
 */

/** @type {{ from: string, to: string, why: string }[]} */
const ROUTE_REDIRECTS = [
  /* ── TODAY ── everything that was a "where do I start" surface ────────── */
  { from: '/dashboard',  to: '/today', why: 'Dashboard is the landing surface; /today is what it becomes.' },
  { from: '/war-room',   to: '/today', why: 'War Room is replaced by the daily queue (G3) at /today.' },
  { from: '/pulses',     to: '/today', why: 'Follow-ups fold into the daily queue.' },
  { from: '/follow-ups', to: '/today', why: "Brief's name for /pulses. Kept so the table is literally true." },

  /* ── BRAIN ── what VaNi knows about this tenant ───────────────────────── */
  { from: '/onboarding',     to: '/brain/mission', why: 'The Mission Wizard route. Brief calls it /mission-wizard.' },
  { from: '/mission-wizard', to: '/brain/mission', why: "Brief's name for /onboarding." },
  { from: '/knowledge',      to: '/brain/teach',   why: 'The Teach VaNi enrichment loop. Brief calls it /teach-vani.' },
  { from: '/teach-vani',     to: '/brain/teach',   why: "Brief's name for /knowledge." },

  /* ── GTM ── Aria ──────────────────────────────────────────────────────── */
  { from: '/research',   to: '/gtm/audience', why: 'G1 step 1 — Find.' },
  { from: '/prospects',  to: '/gtm/audience', why: 'G1 step 2 — Qualify.' },
  { from: '/console',    to: '/gtm/audience', why: 'G1 step 3 — Find people. Brief calls it /vani-leads.' },
  { from: '/vani-leads', to: '/gtm/audience', why: "Brief's name for /console." },
  { from: '/contacts',   to: '/gtm/people',   why: 'Reference surface: the people themselves.' },
  { from: '/journeys',   to: '/gtm/journeys', why: 'Reference surface: what is owed, on which company.' },
  { from: '/campaigns',  to: '/gtm/motion',   why: 'G2 — Put them in motion.' },

  /* ── Children ──────────────────────────────────────────────────────────
   * An exact redirect on /prospects does NOT catch /prospects/acme-ltd, so
   * every moved route that has children needs a wildcard too. These come
   * AFTER the exact rules: Next.js takes the first match, and `:path*`
   * matches zero segments as well, so a wildcard placed first would swallow
   * the bare path and send it to the wrong destination.
   *
   * Detail pages keep their position within the pathway — a prospect detail
   * belongs under Qualify, not at the pathway root.
   */
  { from: '/prospects/:path*',  to: '/gtm/audience/qualify/:path*', why: 'Prospect detail pages.' },
  { from: '/console/:path*',    to: '/gtm/audience/people/:path*',  why: 'Lead detail pages.' },
  { from: '/contacts/:path*',   to: '/gtm/people/:path*',           why: 'Contact detail pages.' },
  { from: '/campaigns/:path*',  to: '/gtm/motion/:path*',           why: 'Campaign detail pages.' },
  { from: '/journeys/:path*',   to: '/gtm/journeys/:path*',         why: 'Journey detail pages.' },
  { from: '/dashboard/:path*',  to: '/today/:path*',                why: 'e.g. /dashboard/storyteller.' },
  { from: '/onboarding/:path*', to: '/brain/mission/:path*',        why: 'e.g. /onboarding/icp-builder.' },
];

/**
 * Routes that keep working and keep their URL, but lost their nav entry in the
 * five-group structure. Recorded so the next person knows this was a decision
 * and not an oversight — a page with no way to reach it is a page nobody finds,
 * which this project has been bitten by before.
 *
 * These are surfaced under SETTINGS rather than left unreachable.
 */
const RETAINED_UNMOVED = [
  '/import',
  '/import-dashboard',
  '/common-pool',
  '/reports',
  '/demo-data',
  '/settings',
];

module.exports = { ROUTE_REDIRECTS, RETAINED_UNMOVED };
