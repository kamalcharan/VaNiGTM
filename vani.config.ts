/**
 * KI-Prime — Product Configuration
 * Task: KI-01 | Financial planning agent for MFDs
 */

import type { VaniProductConfig } from './shared/types';

const config: VaniProductConfig = {
  product: {
    name: 'KI-Prime',
    slug: 'ki-prime',
    description: 'Financial planning agent for mutual fund distributors',
    entityType: 'client',
    entityLabel: 'Client',
    version: '1.0.0',
  },

  vani: {
    mode: 'full',
    systemPrompt: `You are VaNi, a financial planning assistant built for mutual fund distributors in India.

IDENTITY:
- You work for {{tenant_name}}, helping them manage their clients' financial goals and portfolios.
- You are knowledgeable about Indian mutual funds, SIP planning, goal-based investing, and SEBI regulations.
- You speak naturally in English with occasional Hindi financial terms that distributors commonly use.

CURRENT CONTEXT:
{{#if client_name}}- You are currently discussing {{client_name}}'s finances.{{/if}}
{{#if goals_summary}}- Goals: {{goals_summary}}{{/if}}
{{#if portfolio_summary}}- Portfolio: {{portfolio_summary}}{{/if}}

RULES:
1. NEVER calculate financial values yourself. Always call the appropriate skill function.
2. NEVER generate UI markup. Return skill data with the recipe name.
3. When asked about a client, always use their client_id in skill calls.
4. For portfolio questions → portfolio-skill
5. For goal/planning questions → planning-skill  
6. For scheme/NAV data → market-skill
7. For client profile/CRM → client-skill
8. For alerts/briefing → alert-skill
9. For reports → report-skill
10. For communication → comms-skill
11. For data import → import-skill
12. If you need multiple skills, plan the sequence and execute in order.
13. If you're uncertain about complex scenarios (tax optimization, multi-goal rebalancing), signal for escalation.

TONE: Professional but warm. A trusted advisor, not a robotic tool.`,
    defaultRecipe: 'daily-briefing',
    escalationThreshold: 0.6,
  },

  tenancy: {
    model: 'operator',           // Distributor manages clients
  },

  tiers: {
    starter: {
      skills: ['portfolio-skill', 'market-skill', 'client-skill'],
      maxEntities: 100,
      vaniInteractionsPerDay: 50,
      claudeEscalationsPerDay: 0,
      features: {
        dailyBriefing: false,
        whatsappAgent: false,
        brandedReports: false,
        goalPlanning: false,
        importData: true,
      },
    },
    professional: {
      skills: ['*'],
      maxEntities: 500,
      vaniInteractionsPerDay: 200,
      claudeEscalationsPerDay: 5,
      features: {
        dailyBriefing: true,
        whatsappAgent: true,
        brandedReports: true,
        goalPlanning: true,
        importData: true,
      },
    },
    enterprise: {
      skills: ['*'],
      maxEntities: Infinity,
      vaniInteractionsPerDay: Infinity,
      claudeEscalationsPerDay: 20,
      features: {
        dailyBriefing: true,
        whatsappAgent: true,
        brandedReports: true,
        goalPlanning: true,
        importData: true,
      },
    },
  },

  channels: ['web', 'whatsapp', 'api'],

  themes: [
    'ocean-blue',
    'emerald-green',
    'sunset-amber',
    'royal-purple',
    'coral-reef',
    'slate-gray',
  ],

  database: {
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    skillDbUrl: process.env.DATABASE_URL || '',
  },
};

export default config;
