/**
 * KI-32: Recipe → Skill call mapping
 *
 * Central registry that maps each recipe page to its required skill calls.
 * Used by the shell to know which skill endpoints to call for each recipe.
 */

export interface RecipeSkillCall {
  skill: string;
  fn: string;
  /** Parameter keys to extract from URL search params */
  paramKeys?: string[];
}

export interface RecipeRoute {
  recipe: string;
  path: string;
  title: string;
  calls: Record<string, RecipeSkillCall>;
  /** Priority order for implementation (lower = higher priority) */
  priority: number;
  /** Whether this route is wired and functional */
  status: 'wired' | 'deferred';
}

export const recipeRoutes: RecipeRoute[] = [
  {
    recipe: 'client-list',
    path: '/client-list',
    title: 'Clients',
    calls: {
      clients: { skill: 'client-skill', fn: 'get_clients' },
    },
    priority: 1,
    status: 'wired',
  },
  {
    recipe: 'portfolio-view',
    path: '/portfolio-view',
    title: 'Portfolio Overview',
    calls: {
      holdings: { skill: 'portfolio-skill', fn: 'get_holdings', paramKeys: ['client_id'] },
      allocation: { skill: 'portfolio-skill', fn: 'get_allocation', paramKeys: ['client_id'] },
    },
    priority: 2,
    status: 'wired',
  },
  {
    recipe: 'client-360',
    path: '/client-360',
    title: 'Client 360',
    calls: {
      profile: { skill: 'client-skill', fn: 'get_client_profile', paramKeys: ['client_id'] },
      portfolio: { skill: 'portfolio-skill', fn: 'get_portfolio_summary', paramKeys: ['client_id'] },
    },
    priority: 3,
    status: 'wired',
  },
  {
    recipe: 'goal-dashboard',
    path: '/goal-dashboard',
    title: 'Financial Goals',
    calls: {
      goals: { skill: 'planning-skill', fn: 'get_goals', paramKeys: ['client_id'] },
    },
    priority: 4,
    status: 'wired',
  },
  {
    recipe: 'scheme-explorer',
    path: '/scheme-explorer',
    title: 'Scheme Explorer',
    calls: {
      search: { skill: 'market-skill', fn: 'search_schemes' },
      navHistory: { skill: 'market-skill', fn: 'get_nav_history' },
    },
    priority: 5,
    status: 'wired',
  },
  {
    recipe: 'daily-briefing',
    path: '/daily-briefing',
    title: 'VaNi Command Center',
    calls: {},
    priority: 6,
    status: 'deferred',  // Needs alert-skill which has no handlers yet
  },
  {
    recipe: 'goal-deep-dive',
    path: '/goal-deep-dive',
    title: 'Goal Analysis',
    calls: {
      gap: { skill: 'planning-skill', fn: 'calc_goal_gap', paramKeys: ['goal_id'] },
      projection: { skill: 'planning-skill', fn: 'project_goal', paramKeys: ['goal_id'] },
    },
    priority: 7,
    status: 'deferred',
  },
  {
    recipe: 'planning-playground',
    path: '/planning-playground',
    title: 'Planning Playground',
    calls: {
      suggest: { skill: 'planning-skill', fn: 'suggest_sip_increase', paramKeys: ['goal_id'] },
    },
    priority: 8,
    status: 'deferred',
  },
  {
    recipe: 'plan-vs-reality',
    path: '/plan-vs-reality',
    title: 'Plan vs Reality',
    calls: {
      allocation: { skill: 'portfolio-skill', fn: 'get_allocation', paramKeys: ['client_id'] },
    },
    priority: 9,
    status: 'deferred',
  },
];
