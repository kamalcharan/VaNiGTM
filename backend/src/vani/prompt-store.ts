/**
 * vani_prompt resolver — single source of prompt bodies for every LLM-driven
 * worker across every agent.
 *
 * Resolution rule:
 *   1. If the tenant has an active override for this key → return that body.
 *   2. Else return the newest active system version.
 *   3. Else throw PromptNotFoundError (never fall back to a hardcoded string —
 *      a missing prompt is a deploy defect, not a runtime one).
 *
 * Variable substitution is a plain `{{name}}` swap. If a required variable
 * (declared in the row's `variables` column) is missing from the render
 * call, we throw — a prompt template that silently loses variables is how
 * a real caller ends up sending "Hello, {{tenant_name}}!" to an LLM.
 *
 * The RLS policy on vani_prompt (245) admits system rows to every tenant
 * and confines tenant rows to their own tenant, so this resolver is safe
 * to call under `withTenantClient` for tenant context.
 */

import type { Pool, PoolClient } from 'pg';

export interface ResolvedPrompt {
  key: string;
  version: number;
  scope: 'system' | 'tenant';
  body: string;
  variables: string[];
  approved_by: string | null;
  approved_at: string | null;
}

export class PromptNotFoundError extends Error {
  constructor(readonly key: string) {
    super(`No active prompt for key "${key}"`);
    this.name = 'PromptNotFoundError';
  }
}

export class PromptVariableMissingError extends Error {
  constructor(readonly key: string, readonly variable: string) {
    super(`Prompt "${key}" needs variable "${variable}" — not supplied`);
    this.name = 'PromptVariableMissingError';
  }
}

/**
 * Fetch the active prompt for a key. Tenant override wins if present, else
 * newest active system version. Uses a simple SELECT with an ORDER BY that
 * puts scope='tenant' first — one query, deterministic winner.
 */
export async function resolvePrompt(
  db: Pool | PoolClient,
  key: string,
): Promise<ResolvedPrompt> {
  const r = await db.query(
    `SELECT key, version, scope, body, variables, approved_by, approved_at
       FROM vani_prompt
      WHERE key = $1 AND active = true
      ORDER BY (scope = 'tenant') DESC, version DESC
      LIMIT 1`,
    [key],
  );
  if (!r.rows.length) throw new PromptNotFoundError(key);
  const row = r.rows[0];
  return {
    key: row.key,
    version: row.version,
    scope: row.scope,
    body: row.body,
    variables: Array.isArray(row.variables) ? row.variables : [],
    approved_by: row.approved_by,
    approved_at: row.approved_at ? row.approved_at.toISOString() : null,
  };
}

/**
 * Substitute {{name}} tokens with the caller's values. Every declared
 * variable must be supplied; extra values are ignored (so a caller can
 * evolve without breaking older prompts).
 *
 * Substitution is a plain string replace — the LLM sees the value
 * verbatim. Callers must sanitize anything untrusted (e.g. a candidate's
 * typed answer) before passing it in; this is the "fenced payload"
 * discipline for prompt injection.
 */
export function renderPrompt(
  prompt: ResolvedPrompt,
  vars: Record<string, unknown>,
): string {
  for (const name of prompt.variables) {
    if (!(name in vars)) throw new PromptVariableMissingError(prompt.key, name);
  }
  let out = prompt.body;
  for (const [name, value] of Object.entries(vars)) {
    const token = `{{${name}}}`;
    const str = value === null || value === undefined
      ? ''
      : typeof value === 'string'
      ? value
      : JSON.stringify(value);
    out = out.split(token).join(str);
  }
  return out;
}
