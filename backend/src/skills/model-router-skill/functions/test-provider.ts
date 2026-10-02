/**
 * model-router-skill: test_provider — does this free provider answer, with the
 * key and model in .env? One tiny call, recorded in gt_llm_calls like any
 * other (it is a real request against the provider's quota). Paid providers
 * are refused: spending is R3 and happens only through a route.
 */
import type { SkillContext } from '../../../types/skill.types';
import { getPool } from '../../../db/pool';
import { testProvider } from '../../../agent-core/llm.router';
import { requireAdmin } from '../shared';

export async function test_provider(params: { provider_code?: string }, ctx: SkillContext) {
  requireAdmin(ctx);
  const code = String(params.provider_code ?? '').trim().toLowerCase();
  if (!code) throw new Error('provider_code is required.');
  const r = await testProvider(getPool(), ctx.tenant_id, code);
  return { ok: r.ok, model: r.model, latency_ms: r.latencyMs, answer: r.answer, error: r.error };
}
