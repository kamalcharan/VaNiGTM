/**
 * Vikuna Agent Core — Prompt Store
 *
 * Loads versioned LLM prompts from gt_prompts.
 *
 * Resolution order:
 *   1. Tenant override (gt_prompts.tenant_id = tenantId AND is_active)
 *   2. System prompt   (gt_prompts.tenant_id IS NULL    AND is_active)
 *
 * If neither exists, loadPrompt() throws PROMPT_NOT_FOUND.
 *
 * Pool is used directly (not createTenantDb) because system prompts have
 * NULL tenant_id — RLS would block them. The application layer keeps
 * tenant overrides scoped via the explicit WHERE clause.
 */

import type { Pool } from 'pg';

/**
 * Load the active prompt content for a given key.
 *
 * @param pool       PG pool
 * @param promptKey  e.g. 'vani-skill.gather'
 * @param tenantId   optional — when provided, tenant override takes priority
 * @throws Error('PROMPT_NOT_FOUND: ...') when no active prompt exists
 */
export async function loadPrompt(
  pool: Pool,
  promptKey: string,
  tenantId?: string,
): Promise<string> {
  if (tenantId) {
    const override = await pool.query<{ content: string }>(
      `SELECT content
         FROM gt_prompts
        WHERE prompt_key = $1
          AND tenant_id  = $2
          AND is_active  = true
        LIMIT 1`,
      [promptKey, tenantId],
    );
    if (override.rows[0]) return override.rows[0].content;
  }

  const system = await pool.query<{ content: string }>(
    `SELECT content
       FROM gt_prompts
      WHERE prompt_key = $1
        AND tenant_id IS NULL
        AND is_active = true
      LIMIT 1`,
    [promptKey],
  );

  if (!system.rows[0]) {
    throw new Error(`PROMPT_NOT_FOUND: No active prompt for key '${promptKey}'`);
  }

  return system.rows[0].content;
}

/**
 * Save a new prompt version. Deactivates the previously-active version
 * for the same (prompt_key, tenant_id) pair and inserts a new version
 * numbered max(version)+1.
 *
 * Wrapped in a transaction so the swap is atomic.
 */
export async function savePromptVersion(
  pool: Pool,
  promptKey: string,
  content: string,
  notes: string,
  createdBy?: string,
  tenantId?: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Deactivate the current active version for this (key, tenant) pair.
    await client.query(
      `UPDATE gt_prompts
          SET is_active = false
        WHERE prompt_key = $1
          AND tenant_id IS NOT DISTINCT FROM $2
          AND is_active = true`,
      [promptKey, tenantId ?? null],
    );

    // Find the next version number.
    const v = await client.query<{ max: number | null }>(
      `SELECT MAX(version) AS max
         FROM gt_prompts
        WHERE prompt_key = $1
          AND tenant_id IS NOT DISTINCT FROM $2`,
      [promptKey, tenantId ?? null],
    );
    const nextVersion = (v.rows[0]?.max ?? 0) + 1;

    await client.query(
      `INSERT INTO gt_prompts (prompt_key, tenant_id, version, content, notes, created_by, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)`,
      [promptKey, tenantId ?? null, nextVersion, content, notes, createdBy ?? null],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
