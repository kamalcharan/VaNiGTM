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
  /** Shown on the not-yet screen so a planned route still explains itself. */
  summary?: string;
}

export interface SkillModule {
  /** Matches the backend skill name used by the generic transport. */
  id: string;
  name: string;
  routes: SkillRoute[];
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
