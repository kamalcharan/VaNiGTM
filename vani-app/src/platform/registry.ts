/**
 * Skill registry — the platform/agent boundary, made mechanical.
 *
 * The shell renders navigation FROM this registry. It never holds a hardcoded
 * list of destinations. That is the UI expression of the platform spec's
 * database invariant: agents extend, never modify.
 *
 * Adding a skill is one folder under src/skills/ plus one entry in
 * src/skills/index.ts. If it needs an edit inside src/platform/, that is a
 * platform change request — logged and decided, not worked around.
 */

/** The four fixed groups of the Org OS information architecture. */
export type NavGroup = 'organization' | 'workspace' | 'agents' | 'system';

export const NAV_GROUPS: { id: NavGroup; label: string }[] = [
  { id: 'organization', label: 'Organization' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'agents', label: 'Agents' },
  { id: 'system', label: 'System' },
];

/**
 * `live` renders real screens. `planned` renders the honest not-yet state —
 * the habit VaNiGTM's /today already has, kept deliberately rather than
 * hiding unbuilt destinations.
 */
export type RouteStatus = 'live' | 'planned';

export interface SkillRoute {
  id: string;
  label: string;
  href: string;
  group: NavGroup;
  /** Single glyph — the Org OS prototype's convention. */
  icon: string;
  status: RouteStatus;
  badge?: string;
  /** Agent role codes required to see this. Empty means any member. */
  roles?: string[];
  /**
   * Only an admin tenant (vn_tenants.is_admin) sees this route. Logged
   * platform change, 2026-09-26: the common pool is cross-tenant data that
   * only Vikuna's own tenant may read or feed, and a destination the server
   * refuses with a 403 should not sit in everyone's sidebar. The shell that
   * renders a catalog filters on it; the server still gates every call.
   */
  adminOnly?: boolean;
  /** Shown on the not-yet screen so a planned route still explains itself. */
  summary?: string;
}

/**
 * An agent's journey — the product surface of its journey map.
 *
 * Logged platform change, approved 2026-09-22 (docs/gtm-ux-poa.md §2.4b).
 * Every agent declares its journey once, here; the agent landing and the
 * dashboard's per-agent cards render it through one component
 * (`platform/pathway/AgentJourney`). Progress is READ, never declared: the
 * renderer asks `<skill>.<fn>` through the generic transport and gets back
 * which steps are done — so the declaration stays static and the truth stays
 * in the data the console already reads.
 */
export interface JourneyStep {
  id: string;
  label: string;
  /** Where the step is worked. */
  href: string;
  /** One line under the current step: what doing it gets you. */
  summary?: string;
  /** Present but not reachable, with the reason shown on the step. */
  locked?: string;
}

export interface JourneyDecl {
  /** The skill and function that answer "how far along is this tenant". */
  skill: string;
  fn: string;
  steps: JourneyStep[];
}

/** What `<skill>.<fn>` returns. `current` may be omitted; the renderer then
 *  takes the first step that is not done and not locked. */
export interface JourneyProgress {
  done: string[];
  current?: string | null;
  /** One line of state for the dashboard card — "screening 2 roles". */
  note?: string | null;
}

export interface SkillModule {
  /** Matches the backend skill name used by the generic transport. */
  id: string;
  name: string;
  routes: SkillRoute[];
  /** Agents only: the journey the landing and the dashboard render. */
  journey?: JourneyDecl;
}

export interface NavGroupView {
  id: NavGroup;
  label: string;
  routes: SkillRoute[];
}

/** Group the registered routes for rendering, dropping empty groups. */
export function buildNav(skills: SkillModule[]): NavGroupView[] {
  const routes = skills.flatMap((s) => s.routes);
  return NAV_GROUPS.map((g) => ({
    ...g,
    routes: routes.filter((r) => r.group === g.id),
  })).filter((g) => g.routes.length > 0);
}

export function findRoute(skills: SkillModule[], href: string): SkillRoute | undefined {
  return skills.flatMap((s) => s.routes).find((r) => r.href === href);
}
