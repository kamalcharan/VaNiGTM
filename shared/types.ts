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
