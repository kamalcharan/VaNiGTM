/**
 * KI-Prime — Shared Types
 * Task: KI-25 | Skill layer type definitions
 */

/** Result of a database query */
export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
}

/** Database interface injected into skill context */
export interface SkillDb {
  /** Execute a query with named params ($tenant_id, $client_id, etc.) */
  query: <T = Record<string, unknown>>(
    sql: string,
    params?: Record<string, unknown>
  ) => Promise<QueryResult<T>>;

  /**
   * Execute multiple queries in an atomic transaction.
   * MANDATORY for all write operations per CLAUDE.md.
   *
   * Pattern:
   *   await ctx.db.transaction(async (tx) => {
   *     await tx.query(INSERT_CLIENT, { $tenant_id: ctx.tenant_id, ... });
   *     await tx.query(INSERT_PORTFOLIO, { $tenant_id: ctx.tenant_id, ... });
   *   });
   *
   * - Auto BEGIN before callback
   * - Auto COMMIT on success
   * - Auto ROLLBACK on error (then rethrows)
   * - Tenant context set before BEGIN
   */
  transaction: <T>(fn: (tx: SkillDb) => Promise<T>) => Promise<T>;
}

/** Context injected into every skill function by the framework */
export interface SkillContext {
  tenant_id: string;
  db: SkillDb;
}

/* ── Skill layer types ────────────────────────────────── */

export type SubscriptionTier = 'starter' | 'professional' | 'enterprise';

/** Parsed parameter from SKILL.md function definition */
export interface SkillParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: string;
}

/** Parsed function definition from SKILL.md */
export interface SkillFunctionDef {
  name: string;
  description: string;
  parameters: SkillParam[];
  returns: string;
  default_recipe?: string;
}

/** Parsed skill definition from SKILL.md frontmatter + body */
export interface SkillDefinition {
  name: string;
  version: string;
  description: string;
  tier: SubscriptionTier;
  default_recipe: string;
  functions: SkillFunctionDef[];
}

/** A skill function handler: (params, ctx) => Promise<result> */
export type SkillHandler = (
  params: Record<string, unknown>,
  ctx: SkillContext
) => Promise<Record<string, unknown>>;

/** Result of executing a skill function */
export interface SkillResult {
  success: boolean;
  skill: string;
  function: string;
  recipe: string;
  data: Record<string, unknown>;
  error?: string;
}

/* ── Product configuration types ──────────────────────── */

export interface VaniProductConfig {
  product: {
    name: string;
    slug: string;
    description: string;
    entityType: string;
    entityLabel: string;
    version: string;
  };
  vani: {
    mode: 'full' | 'skill-only' | 'chat-only';
    systemPrompt: string;
    defaultRecipe: string;
    escalationThreshold: number;
  };
  tenancy: {
    model: 'operator' | 'self-serve';
  };
  tiers: Record<string, {
    skills: string[];
    maxEntities: number;
    vaniInteractionsPerDay: number;
    claudeEscalationsPerDay: number;
    features: Record<string, boolean>;
  }>;
  channels: string[];
  themes: string[];
  database: {
    supabaseUrl: string;
    supabaseAnonKey: string;
    skillDbUrl: string;
  };
}
