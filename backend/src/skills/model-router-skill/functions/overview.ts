/**
 * model-router-skill: overview — the providers, their switches and state, the
 * routes as they would run NOW for each kind of data, and today's calls.
 * Keys are never read into the answer.
 */
import type { SkillContext } from '../../../types/skill.types';
import { getPool } from '../../../db/pool';
import { readRouterConfig, ROUTE_CLASSES } from '../../../agent-core/llm.router.config';
import { planRoute, readRouteState, type DataClass } from '../../../agent-core/llm.router';
import { requireAdmin } from '../shared';

const host = (url: string) => { try { return new URL(url).host; } catch { return url ? 'invalid url' : 'Anthropic API'; } };

export async function overview(_params: Record<string, unknown>, ctx: SkillContext) {
  requireAdmin(ctx);
  const pool = getPool();
  const cfg = readRouterConfig();
  const state = await readRouteState(pool, 'enrichment');
  const now = new Date();

  const latest = await pool.query<{ provider_code: string; changed_at: string; changed_by_name: string | null }>(
    `SELECT DISTINCT ON (s.provider_code) s.provider_code, s.changed_at,
            NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), '') AS changed_by_name
       FROM gt_llm_provider_switch s LEFT JOIN vn_users u ON u.id = s.changed_by
      WHERE s.purpose = 'enrichment'
      ORDER BY s.provider_code, s.changed_at DESC, s.id DESC`);
  const by = new Map(latest.rows.map((r) => [r.provider_code, r]));

  const providers = Object.values(cfg.providers).map((p) => {
    const st = state[p.code] ?? { enabled: false, callsMinute: 0, callsToday: 0, cooldownUntil: null, tokensMinute: 0, tokensToday: 0 };
    const cooling = st.cooldownUntil && st.cooldownUntil > now;
    const spent = (p.daily > 0 && st.callsToday >= p.daily) || (p.tpd > 0 && st.tokensToday >= p.tpd);
    return {
      code: p.code, kind: p.kind, model: p.model, host: host(p.url), ctx: p.ctx, rpm: p.rpm, daily: p.daily,
      tpm: p.tpm, tpd: p.tpd, tokens_minute: st.tokensMinute, tokens_today: st.tokensToday,
      data_terms: p.dataTerms, paid: p.paid, enabled: st.enabled,
      switched_by: by.get(p.code)?.changed_by_name ?? null, switched_at: by.get(p.code)?.changed_at ?? null,
      calls_minute: st.callsMinute, calls_today: st.callsToday,
      cooldown_until: cooling ? st.cooldownUntil!.toISOString() : null,
      state: !st.enabled ? 'off' : cooling ? 'cooling_down' : spent ? 'quota_spent' : 'serving',
    };
  });

  const classes: DataClass[] = ['public_company', 'tenant', 'people'];
  const routes = ROUTE_CLASSES.map((route) => ({
    route,
    order: cfg.routes[route],
    plan: Object.fromEntries(classes.map((dc) => {
      const pl = planRoute(cfg, route, dc, state, now);
      return [dc, { serves: pl.eligible.map((p) => p.code), skipped: pl.skipped }];
    })),
  }));

  const usage = (await pool.query('SELECT * FROM gt_llm_usage_today() ORDER BY route, provider_code')).rows
    .map((r: any) => ({ ...r, calls: Number(r.calls), ok: Number(r.ok), moved_on: Number(r.moved_on), bad: Number(r.bad), tokens: Number(r.tokens) }));

  const history = (await pool.query(
    `SELECT s.provider_code, s.enabled, s.note, s.changed_at,
            NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), '') AS changed_by_name
       FROM gt_llm_provider_switch s LEFT JOIN vn_users u ON u.id = s.changed_by
      WHERE s.purpose = 'enrichment'
      ORDER BY s.changed_at DESC, s.id DESC LIMIT 20`)).rows;

  return { providers, routes, usage, history };
}
