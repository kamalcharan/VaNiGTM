/**
 * Onboarding lanes — the server-side catalog.
 *
 * Onboarding is an agent: it owns the engine, and each *subject* declares the
 * lane it wants run. There are two tiers and one mechanism.
 *
 *   product lane   the organisation declares itself once (VN-10 … VN-13)
 *   agent lane     an agent's activation checklist, run when it is activated
 *
 * ── Why step_id carries the lane ──────────────────────────────────────────
 *
 * `vn_tenant_onboarding` already exists and migration 005 says step_id is "a
 * convention-based identifier … Products can define their own steps". So the
 * lane lives in the identifier rather than in a new column:
 *
 *   no colon        the legacy GTM lane — `user_profile`, `business_profile`
 *   `vani:<key>`    the VaNi product lane
 *   `<agent>:<key>` that agent's activation lane, e.g. `vara:role_grants`
 *
 * step_id is VARCHAR(50); keep the whole thing under that.
 *
 * ── Why nothing is seeded for the new lanes ───────────────────────────────
 *
 * GTM's frontend routes on `tenant.onboarding_complete`, which counts every
 * PENDING row for the tenant (auth.routes.ts /me). Seeding pending `vani:` rows
 * at registration would therefore push every existing GTM user into their
 * mission wizard and keep them there, because their UI never completes a
 * `vani:` step.
 *
 * So the catalog is reconciled on READ and rows are inserted only on COMPLETE.
 * A pending step is an absence, not a row. `/me` is untouched, no backfill
 * migration is needed, and tenants created before a step existed pick it up
 * automatically the next time they open the lane.
 */

export type LaneScope = 'product' | 'agent';

export interface LaneStep {
  /** Stored in vn_tenant_onboarding.step_id. Max 50 chars. */
  step_id: string;
  title: string;
  summary: string;
  /** The spec story this satisfies. Traceability, not decoration. */
  story?: string;
  /**
   * Off = declared but not required yet, and not returned by /status.
   *
   * This exists so a step can be designed before its storage is confirmed.
   * A required step with nowhere to write is worse than a missing one: the
   * tenant can never complete it, and a lane that can never complete traps
   * every user behind the gate forever.
   */
  enabled: boolean;
}

export interface Lane {
  id: string;
  title: string;
  scope: LaneScope;
  steps: LaneStep[];
}

/**
 * The legacy GTM lane. Bare step ids, seeded by register(). Do not add to this
 * — every addition gates existing GTM tenants out of their product.
 */
const GTM_LANE: Lane = {
  id: 'gtm',
  title: 'Vikuna GTM',
  scope: 'product',
  steps: [
    { step_id: 'user_profile', title: 'Your profile', summary: 'Who you are.', enabled: true },
    { step_id: 'business_profile', title: 'Your business', summary: 'What the organisation does.', enabled: true },
  ],
};

/**
 * The VaNi product lane — the organisation declared once, for every agent.
 *
 * The first two steps are the GTM lane's bare ids on purpose. They are the same
 * facts, so a VaNi tenant completing them satisfies both lanes rather than being
 * asked twice.
 *
 * VN-12 (per-agent role grants) is deliberately absent: a grant needs an agent's
 * declared role catalog, so it belongs to that agent's activation lane, not here.
 */
const VANI_LANE: Lane = {
  id: 'vani',
  title: 'Set up VaNi',
  scope: 'product',
  steps: [
    {
      step_id: 'user_profile',
      title: 'Your profile',
      summary: 'Your name and how VaNi should reach you.',
      story: 'VN-11',
      enabled: true,
    },
    {
      step_id: 'business_profile',
      title: 'Your organisation',
      summary: 'What the organisation is and which industry it works in.',
      story: 'VN-10',
      enabled: true,
    },
    // ── The vani_ platform spine steps ──────────────────────────────────
    // The spine is in the migration set as of 240_vani_platform.sql (applied
    // 2026-08-17). vani:domain is live: its writer in applyStepPayload bridges
    // the vn_ tenant to vani_tenant by slug (provisioning it on first write —
    // V-01 semantics) and upserts vani_tenant_domain.
    //
    // A lane step stays disabled while nothing implements it:
    //   - vani:team — the People surface already reads and writes the vn_
    //     spine (/auth/team, /auth/invite) and is finished there. This step is
    //     the unused vani_membership route to the same outcome; enable it only
    //     if membership moves to the platform spine.
    //   - vani:llm_provider — a default provider is in force server-side. BYOK
    //     needs vani_llm_provider.credentials_enc and an encryption path,
    //     which nothing implements yet. Enabling it now would gate tenants
    //     behind an input that saves nowhere.
    {
      step_id: 'vani:domain',
      title: 'Your domain',
      summary: 'The domain your workspace runs on, so agents can address it.',
      story: 'VN-10',
      enabled: true,
    },
    {
      step_id: 'vani:team',
      title: 'Your people',
      summary: 'Who else is in the organisation, and what they can do.',
      story: 'VN-11',
      enabled: false,
    },
    {
      step_id: 'vani:llm_provider',
      title: 'Your model provider',
      summary: 'Bring your own key. Declared once; every agent uses it.',
      story: 'VN-13',
      enabled: false,
    },
  ],
};

const LANES: Record<string, Lane> = {
  [GTM_LANE.id]: GTM_LANE,
  [VANI_LANE.id]: VANI_LANE,
};

/** Agent lanes register here as agents ship. The engine does not change. */
export function registerLane(lane: Lane): void {
  LANES[lane.id] = lane;
}

export function getLane(id: string): Lane | null {
  return LANES[id] ?? null;
}

export function laneIds(): string[] {
  return Object.keys(LANES);
}

/** The steps a tenant must actually complete. Disabled steps are not required. */
export function requiredSteps(lane: Lane): LaneStep[] {
  return lane.steps.filter((s) => s.enabled);
}

/** True if `step_id` is a legal, enabled step of `lane`. Guards arbitrary writes. */
export function isStepOfLane(lane: Lane, stepId: string): boolean {
  return lane.steps.some((s) => s.step_id === stepId && s.enabled);
}
