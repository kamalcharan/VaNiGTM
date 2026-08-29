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
   * The tenant's own platform surfaces. The embed channel lives here, not
   * under an agent: one tenant pastes one tag and every live agent is
   * reachable through it.
   */
  tenant: {
    domains: {
      method: 'GET',
      path: '/api/v1/tenant/domains',
      auth: true,
      description:
        'Domains declared for this workspace (vani_tenant_domain, bridged from the vn_ tenant by slug). Empty before the vani:domain step completes.',
    },
    embed: {
      method: 'GET',
      path: '/api/v1/tenant/embed',
      auth: true,
      description:
        'Everything the Install screen renders in one call: the paste-ready snippet, which agents are live on this workspace, and per declared domain the id, embed_origins allowlist and boot_pings (which origins have actually booted the widget).',
    },
    originsUpdate: {
      method: 'PATCH',
      path: '/api/v1/tenant/domains/:id/origins',
      auth: true,
      description:
        'Admin-only. Add/remove embed origins on one domain. Idempotent by construction — a no-op edit reports changed:false and writes no audit row. Removing an origin drops its boot_pings entry in the same statement.',
    },
  },

  /** Vara — activation and its own workspace surfaces. */
  vara: {
    state: {
      method: 'GET',
      path: '/api/v1/vara/status',
      auth: true,
      description: 'Subscription state + readiness checklist for the landing page.',
    },
    activate: {
      method: 'POST',
      path: '/api/v1/vara/activate',
      auth: true,
      description:
        'Admin-only. Goes live if the checklist passes; refuses NOT_READY with the checklist in error.details.',
    },
    onboardingContext: {
      method: 'GET',
      path: '/api/v1/vara/onboarding/context',
      auth: true,
      description:
        'Everything the doorway renders in one call: tenant industry, registry families for that industry (from vani_domain_pack), brand fields, and the tenant’s own published JDs so Duplicate/Edit is server-truth.',
    },
    jdCompose: {
      method: 'POST',
      path: '/api/v1/vara/jd/compose',
      auth: true,
      description:
        'Publish a JD as v1 of a new identity. Single transaction: vani_role_family + vara_family_profile + vara_scoring_config + vara_jd + vara_jd_version + subscription flip. Idempotent-in-practice via Idempotency-Key + advisory lock.',
    },
    promptsList: {
      method: 'GET',
      path: '/api/v1/vara/prompts',
      auth: true,
      description:
        'Prompt Studio list. Grouped by key: active system version + tenant override if any + version counts.',
    },
    promptSave: {
      method: 'PATCH',
      path: '/api/v1/vara/prompts/:key',
      auth: true,
      description:
        'Save a tenant override for a prompt key. Refuses if the body drops a declared {{variable}}. Deactivates any prior active override, inserts new version, self-approves.',
    },
    promptRevert: {
      method: 'DELETE',
      path: '/api/v1/vara/prompts/:key',
      auth: true,
      description:
        'Revert to system prompt: deactivates the tenant’s active override; history preserved; resolver falls through to newest system version.',
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
