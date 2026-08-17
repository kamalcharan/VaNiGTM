/**
 * VaNi — Service URL registry.
 *
 * Ported from VaNiGTM's frontend/src/lib/serviceURLs.ts, trimmed to the base
 * slice. Same rule applies here: no component ever builds a URL by hand, and
 * an endpoint only appears once the functionality that uses it has moved.
 *
 * VaNiGTM declares 19 auth endpoints. These five are the account base;
 * invite, team, sessions, forgot/reset-password, switch-env, onboarding and
 * profile come later, with their features.
 */

export interface ServiceEndpoint {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly path: string;
  readonly auth: boolean;
  readonly description: string;
}

export const API = {
  auth: {
    register: {
      method: 'POST',
      path: '/api/v1/auth/register',
      auth: false,
      description:
        'Create a tenant and its first user, then sign them in. Gated in the UI; open on the API.',
    },
    login: {
      method: 'POST',
      path: '/api/v1/auth/login',
      auth: false,
      description: 'Exchange credentials for an access token; sets the refresh cookie.',
    },
    refresh: {
      method: 'POST',
      path: '/api/v1/auth/refresh',
      auth: false,
      description: 'Rotate the session. The httpOnly cookie carries the refresh token.',
    },
    logout: {
      method: 'POST',
      path: '/api/v1/auth/logout',
      auth: true,
      description: 'Revoke the server session and clear the refresh cookie.',
    },
    me: {
      method: 'GET',
      path: '/api/v1/auth/me',
      auth: true,
      description: 'Hydrate the current user and tenant.',
    },
    team: {
      method: 'GET',
      path: '/api/v1/auth/team',
      auth: true,
      description: 'Everyone in the tenant, from vn_users.',
    },
    invite: {
      method: 'POST',
      path: '/api/v1/auth/invite',
      auth: true,
      description: 'Invite people by email and role. Body: { invitations: [{ email, role_id }] }.',
    },
    invitations: {
      method: 'GET',
      path: '/api/v1/auth/invitations',
      auth: true,
      description: 'Pending invitations for the tenant.',
    },
  },

  onboarding: {
    status: {
      method: 'GET',
      path: '/api/v1/onboarding/status',
      auth: true,
      description: 'Lane-aware onboarding status. Absent rows are pending steps.',
    },
    completeStep: {
      method: 'PATCH',
      path: '/api/v1/onboarding/step',
      auth: true,
      description: 'Apply a step payload and mark it completed, in one transaction.',
    },
  },

  /**
   * Ingestion — the mission wizard's first step submits the tenant's website
   * here, and polls the source for its agent run steps.
   */
  ingest: {
    submitUrl: {
      method: 'POST',
      path: '/api/v1/ingest/url',
      auth: true,
      description: 'Submit a website URL for ingestion into the knowledge graph',
    },
    listSources: {
      method: 'GET',
      path: '/api/v1/ingest/sources',
      auth: true,
      description: 'List knowledge sources, newest first (no run steps — fetch getSource for those)',
    },
    getSource: {
      method: 'GET',
      path: '/api/v1/ingest/sources/:id',
      auth: true,
      description: 'Get a single ingestion source with its processing status and agent run steps',
    },
    submitText: {
      method: 'POST',
      path: '/api/v1/ingest/text',
      auth: true,
      description: 'Submit pasted context text for ingestion into the knowledge graph',
    },
  },

  /** The Smart Profile itself — profile, market vocabulary, brand. */
  gtmProfile: {
    get: {
      method: 'GET',
      path: '/api/v1/profile/',
      auth: true,
      description: 'Get the current GTM profile',
    },
    update: {
      method: 'PUT',
      path: '/api/v1/profile/',
      auth: true,
      description: 'Update the GTM profile',
    },
    approve: {
      method: 'POST',
      path: '/api/v1/profile/approve',
      auth: true,
      description: 'Approve the current GTM profile',
    },
    history: {
      method: 'GET',
      path: '/api/v1/profile/history',
      auth: true,
      description: 'Get the GTM profile revision history',
    },
    clusters: {
      method: 'GET',
      path: '/api/v1/profile/clusters',
      auth: true,
      description: 'Market vocabulary — the semantic clusters that frame competitor search',
    },
    approveClusters: {
      method: 'POST',
      path: '/api/v1/profile/clusters/approve',
      auth: true,
      description: 'Ratify the market vocabulary (edits + removals, then approve)',
    },
    generateBrand: {
      method: 'POST',
      path: '/api/v1/profile/brand/generate',
      auth: true,
      description: 'Draft the brand Brain object from the profile + a fresh site fetch',
    },
    getBrand: {
      method: 'GET',
      path: '/api/v1/profile/brand',
      auth: true,
      description: 'Current brand draft/confirmed state',
    },
    updateBrand: {
      method: 'PUT',
      path: '/api/v1/profile/brand',
      auth: true,
      description: 'Human edits to brand fields',
    },
    approveBrand: {
      method: 'POST',
      path: '/api/v1/profile/brand/approve',
      auth: true,
      description: 'Ratify the brand',
    },
    reopenBrand: {
      method: 'POST',
      path: '/api/v1/profile/brand/reopen',
      auth: true,
      description: '"Edit again" on a just-confirmed brand',
    },
    generateOfferDrafts: {
      method: 'POST',
      path: '/api/v1/profile/offers/generate',
      auth: true,
      description: 'Draft 1-3 offers from the profile + cached ingestion text',
    },
    confirmOffer: {
      method: 'POST',
      path: '/api/v1/profile/offers/:offerKey/confirm',
      auth: true,
      description: 'Confirm one offer — counts toward the Brain-completeness score',
    },
  },

  /** Competitor discovery and outward research. */
  vani: {
    competitors: {
      method: 'GET',
      path: '/api/v1/vani/competitors',
      auth: true,
      description: 'Competitors VaNi found in the knowledge graph',
    },
    confirmCompetitors: {
      method: 'POST',
      path: '/api/v1/vani/competitors/confirm',
      auth: true,
      description: 'Confirm the competitor map — keep (stamped confirmed) / remove (deleted)',
    },
    researchCompetitors: {
      method: 'POST',
      path: '/api/v1/vani/competitors/research',
      auth: true,
      description: 'Kick off outward competitor research (profile → web search → verified KG nodes)',
    },
    competitorResearchStatus: {
      method: 'GET',
      path: '/api/v1/vani/competitors/research-status',
      auth: true,
      description: 'Latest competitor-research run — status, live steps, output/error',
    },
  },
} as const satisfies Record<string, Record<string, ServiceEndpoint>>;
