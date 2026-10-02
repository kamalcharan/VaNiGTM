/**
 * model-router-skill: switch_provider — one model on or off for enrichment.
 * Append-only: a new row is the new state, the old rows are the history.
 * Switching to the state it is already in appends nothing (a double click is
 * not two decisions).
 */
import type { SkillContext } from '../../../types/skill.types';
import { getPool } from '../../../db/pool';
import { readRouterConfig } from '../../../agent-core/llm.router.config';
import { requireAdmin } from '../shared';

export async function switch_provider(
  params: { provider_code?: string; enabled?: boolean; note?: string }, ctx: SkillContext,
) {
  requireAdmin(ctx);
  const code = String(params.provider_code ?? '').trim().toLowerCase();
  if (typeof params.enabled !== 'boolean') throw new Error('enabled must be true or false.');
  const cfg = readRouterConfig();
  if (!cfg.providers[code]) {
    throw new Error(`"${code}" is not a configured provider. Known: ${Object.keys(cfg.providers).join(', ')}.`);
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // One switch at a time per provider, so two admins cannot interleave.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`llm-switch:${code}`]);
    const cur = await client.query<{ enabled: boolean }>(
      `SELECT enabled FROM gt_llm_provider_switch WHERE provider_code = $1 AND purpose = 'enrichment'
        ORDER BY changed_at DESC, id DESC LIMIT 1`, [code]);
    const now = cur.rows[0]?.enabled ?? false;
    let changed = false;
    if (now !== params.enabled) {
      await client.query(
        `INSERT INTO gt_llm_provider_switch (provider_code, purpose, enabled, changed_by, note)
         VALUES ($1, 'enrichment', $2, $3, $4)`,
        [code, params.enabled, ctx.user_id ?? null, params.note ? String(params.note).slice(0, 300) : null]);
      changed = true;
    }
    await client.query('COMMIT');
    if (changed) console.log(`[ModelRouter] ${code} switched ${params.enabled ? 'ON' : 'OFF'} for enrichment by user ${ctx.user_id}`);
    return { provider_code: code, enabled: params.enabled, changed };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[ModelRouter] switch failed:', (e as Error).message);
    throw e;
  } finally {
    client.release();
  }
}
