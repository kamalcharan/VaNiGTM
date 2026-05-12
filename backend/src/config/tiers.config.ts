/**
 * KI-Prime — Subscription Tier Configuration
 * Task: KI-20
 */

export const tiers = {
  starter: {
    name: 'Starter',
    price_inr: 499,
    price_display: '₹499/mo',
    skills: ['contact-skill', 'client-skill', 'campaign-skill'],
    maxClients: 100,
    vaniInteractionsPerDay: 50,
    claudeEscalationsPerDay: 0,
    features: {
      dailyBriefing: false,
      whatsappAgent: false,
      brandedReports: false,
      goalPlanning: false,
      taxHarvesting: false,
      familyGroups: false,
    },
  },
  professional: {
    name: 'Professional',
    price_inr: 1499,
    price_display: '₹1,499/mo',
    skills: ['*'],               // All skills
    maxClients: 500,
    vaniInteractionsPerDay: 200,
    claudeEscalationsPerDay: 5,
    features: {
      dailyBriefing: true,
      whatsappAgent: true,
      brandedReports: true,
      goalPlanning: true,
      taxHarvesting: true,
      familyGroups: true,
    },
  },
  enterprise: {
    name: 'Enterprise',
    price_inr: 3999,
    price_display: '₹3,999/mo',
    skills: ['*'],
    maxClients: Infinity,
    vaniInteractionsPerDay: Infinity,
    claudeEscalationsPerDay: 20,
    features: {
      dailyBriefing: true,
      whatsappAgent: true,
      brandedReports: true,       // White-label
      goalPlanning: true,
      taxHarvesting: true,
      familyGroups: true,
      customSkills: true,
      apiAccess: true,
      dedicatedSupport: true,
    },
  },
} as const;

export type TierName = keyof typeof tiers;
