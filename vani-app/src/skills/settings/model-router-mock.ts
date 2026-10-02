/**
 * Mock-mode answers for Settings → Platform models (no .env.local). Same shapes
 * and the same rules as the backend: no switch row means off, a repeat changes
 * nothing, tenant data skips may_train/unknown, people data skips outside
 * providers.
 */
import type { DataClass, RouterOverview, RouterProvider, SwitchEvent } from './useModelRouter';

const base: RouterProvider[] = [
  { code: 'groq', kind: 'external', model: 'llama-3.3-70b-versatile', host: 'api.groq.com', ctx: 8000, rpm: 30, daily: 1000, data_terms: 'unknown', paid: false,
    enabled: true, switched_by: 'You (mock)', switched_at: '2026-10-02T09:00:00.000Z', calls_minute: 4, calls_today: 812, cooldown_until: null, state: 'serving' },
  { code: 'openrouter', kind: 'external', model: 'meta-llama/llama-3.3-70b-instruct:free', host: 'openrouter.ai', ctx: 8000, rpm: 20, daily: 50, data_terms: 'may_train', paid: false,
    enabled: true, switched_by: 'You (mock)', switched_at: '2026-10-02T09:00:00.000Z', calls_minute: 0, calls_today: 50, cooldown_until: null, state: 'quota_spent' },
  { code: 'qwen', kind: 'platform', model: 'qwen3', host: 'llm.vikuna.internal', ctx: 16384, rpm: 0, daily: 0, data_terms: 'no_training', paid: false,
    enabled: true, switched_by: 'You (mock)', switched_at: '2026-10-02T09:00:00.000Z', calls_minute: 1, calls_today: 146, cooldown_until: null, state: 'serving' },
  { code: 'haiku', kind: 'haiku', model: 'claude-haiku-4-5', host: 'Anthropic API', ctx: 0, rpm: 0, daily: 0, data_terms: 'no_training', paid: true,
    enabled: false, switched_by: null, switched_at: null, calls_minute: 0, calls_today: 0, cooldown_until: null, state: 'off' },
];
const ROUTES = { high: ['groq', 'openrouter', 'qwen', 'haiku'], medium: ['qwen'], low: ['qwen'] } as const;
let providers = base.map((p) => ({ ...p }));
let history: SwitchEvent[] = [];

function gate(p: RouterProvider, dc: DataClass): string | null {
  if (dc === 'public_company') return null;
  if (dc === 'people') return p.kind === 'external' ? 'people data never goes to an outside free provider until the DPDP review' : null;
  return p.data_terms === 'no_training' ? null : `${p.data_terms.replace('_', ' ')} on prompts — this is tenant data`;
}
function plan(order: readonly string[], dc: DataClass) {
  const serves: string[] = []; const skipped: Array<{ code: string; reason: string }> = [];
  for (const code of order) {
    const p = providers.find((x) => x.code === code)!;
    const g = gate(p, dc);
    if (!p.enabled) skipped.push({ code, reason: 'switched off' });
    else if (g) skipped.push({ code, reason: g });
    else if (p.daily > 0 && p.calls_today >= p.daily) skipped.push({ code, reason: `today's quota spent (${p.calls_today}/${p.daily})` });
    else serves.push(code);
  }
  return { serves, skipped };
}
function overview(): RouterOverview {
  const classes: DataClass[] = ['public_company', 'tenant', 'people'];
  return {
    providers,
    routes: (['high', 'medium', 'low'] as const).map((route) => ({
      route, order: [...ROUTES[route]],
      plan: Object.fromEntries(classes.map((dc) => [dc, plan(ROUTES[route], dc)])) as RouterOverview['routes'][number]['plan'],
    })),
    usage: [
      { route: 'high', provider_code: 'groq', calls: 812, ok: 795, moved_on: 14, bad: 3, tokens: 2_840_000 },
      { route: 'high', provider_code: 'openrouter', calls: 50, ok: 49, moved_on: 1, bad: 0, tokens: 170_000 },
      { route: 'high', provider_code: 'qwen', calls: 21, ok: 21, moved_on: 0, bad: 0, tokens: 60_000 },
      { route: 'low', provider_code: 'qwen', calls: 125, ok: 125, moved_on: 0, bad: 0, tokens: 90_000 },
    ],
    history,
  };
}

export const MODEL_ROUTER_MOCK_READS: Record<string, (p: Record<string, unknown>) => unknown> = {
  'model-router-skill.overview': () => overview(),
};

export const MODEL_ROUTER_MOCK_WRITES: Record<string, (p: Record<string, unknown>) => unknown> = {
  'model-router-skill.switch_provider': (p) => {
    const code = String(p.provider_code); const enabled = p.enabled === true;
    const prov = providers.find((x) => x.code === code);
    if (!prov) throw new Error(`"${code}" is not a configured provider.`);
    if (prov.enabled === enabled) return { provider_code: code, enabled, changed: false };
    const at = new Date().toISOString();
    providers = providers.map((x) => x.code === code
      ? { ...x, enabled, switched_by: 'You (mock)', switched_at: at, state: enabled ? (x.daily > 0 && x.calls_today >= x.daily ? 'quota_spent' : 'serving') : 'off' }
      : x);
    history = [{ provider_code: code, enabled, note: null, changed_at: at, changed_by_name: 'You (mock)' }, ...history];
    return { provider_code: code, enabled, changed: true };
  },
  'model-router-skill.test_provider': (p) => {
    const prov = providers.find((x) => x.code === String(p.provider_code));
    if (!prov) throw new Error('Not a configured provider.');
    if (prov.paid) throw new Error(`${prov.code} is paid per token; it is not tested from here.`);
    return { ok: true, model: prov.model, latency_ms: 840, answer: 'ready' };
  },
};
