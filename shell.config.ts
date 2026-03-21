/**
 * KI-33: Shell Configuration — KI-Prime
 *
 * Product-level config that maps recipes to skill endpoints.
 * Consumed by the shell's ShellConfigProvider to drive sidebar,
 * routing, and data fetching.
 */

import type { ShellConfig } from './shell/lib/shell-config';

const shellConfig: ShellConfig = {
  product: {
    name: 'KI-Prime',
    tagline: 'Financial Planning for MFDs',
  },

  api: {
    baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
    devHeaders: {
      'Content-Type': 'application/json',
      'X-Dev-Tenant-Id': process.env.NEXT_PUBLIC_DEV_TENANT_ID || 'a0000000-0000-0000-0000-000000000001',
      'X-Dev-User-Id': process.env.NEXT_PUBLIC_DEV_USER_ID || 'a0000000-0000-0000-0000-000000000002',
    },
  },

  recipes: [
    // ── Wired (Priority 1–5) ─────────────────────────────

    {
      recipe: 'client-list',
      path: '/client-list',
      title: 'Clients',
      layout: 'list-detail',
      skills: [
        { skill: 'client-skill', fn: 'get_clients' },
      ],
      priority: 1,
      status: 'wired',
    },
    {
      recipe: 'portfolio-view',
      path: '/portfolio-view',
      title: 'Portfolio Overview',
      layout: 'dashboard-3row',
      skills: [
        { skill: 'portfolio-skill', fn: 'get_holdings', paramKeys: ['client_id'] },
        { skill: 'portfolio-skill', fn: 'get_allocation', paramKeys: ['client_id'] },
      ],
      priority: 2,
      status: 'wired',
    },
    {
      recipe: 'client-360',
      path: '/client-360',
      title: 'Client 360',
      layout: 'detail-sidebar',
      skills: [
        { skill: 'client-skill', fn: 'get_client_profile', paramKeys: ['client_id'] },
        { skill: 'portfolio-skill', fn: 'get_portfolio_summary', paramKeys: ['client_id'] },
      ],
      priority: 3,
      status: 'wired',
    },
    {
      recipe: 'goal-dashboard',
      path: '/goal-dashboard',
      title: 'Financial Goals',
      layout: 'dashboard-3row',
      skills: [
        { skill: 'planning-skill', fn: 'get_goals', paramKeys: ['client_id'] },
      ],
      priority: 4,
      status: 'wired',
    },
    {
      recipe: 'scheme-explorer',
      path: '/scheme-explorer',
      title: 'Scheme Explorer',
      layout: 'list-detail',
      skills: [
        { skill: 'market-skill', fn: 'search_schemes' },
        { skill: 'market-skill', fn: 'get_nav_history' },
      ],
      priority: 5,
      status: 'wired',
    },

    // ── Deferred (Priority 6–9) ──────────────────────────

    {
      recipe: 'daily-briefing',
      path: '/daily-briefing',
      title: 'VaNi Command Center',
      layout: 'briefing',
      skills: [],
      priority: 6,
      status: 'deferred',
    },
    {
      recipe: 'goal-deep-dive',
      path: '/goal-deep-dive',
      title: 'Goal Analysis',
      layout: 'detail-sidebar',
      skills: [],
      priority: 7,
      status: 'deferred',
    },
    {
      recipe: 'planning-playground',
      path: '/planning-playground',
      title: 'Planning Playground',
      layout: 'dashboard-3row',
      skills: [],
      priority: 8,
      status: 'deferred',
    },
    {
      recipe: 'plan-vs-reality',
      path: '/plan-vs-reality',
      title: 'Plan vs Reality',
      layout: 'comparison',
      skills: [],
      priority: 9,
      status: 'deferred',
    },
  ],
};

export default shellConfig;
