/**
 * KI-Prime — Shared Types
 * Task: KI-25 | Skill layer type definitions
 */

/** Result of a database query */
export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
}

/** Database interface provided by VaNiBase framework */
export interface SkillDb {
  query: <T = Record<string, unknown>>(
    sql: string,
    params?: Record<string, unknown>
  ) => Promise<QueryResult<T>>;
}

/** Context injected into every skill function by the framework */
export interface SkillContext {
  tenant_id: string;
  db: SkillDb;
}

/* ── VaNiBase product configuration types ──────────────── */

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
