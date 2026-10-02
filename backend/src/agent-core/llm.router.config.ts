/**
 * The model router's settings — from .env, and nowhere else (POA D-Q14,
 * Charan 2026-10-02, in his shape):
 *
 *   LLM_PROVIDERS=groq,openrouter
 *   LLM_ROUTE_HIGH=groq,openrouter,qwen,haiku
 *   LLM_ROUTE_MEDIUM=qwen
 *   LLM_ROUTE_LOW=qwen
 *   LLM_GROQ_URL / _KEY / _MODEL / _CTX / _RPM / _DAILY / _DATA_TERMS
 *
 * `.env` declares what a provider IS. Whether enrichment may USE it is the
 * admin's on/off switch (gt_llm_provider_switch, D-Q17) — not here.
 *
 * Two codes are reserved and never declared under LLM_PROVIDERS, because they
 * already are configured and a second copy would drift:
 *   qwen   the platform model, LLM_PRIMARY_* (window LLM_CONTEXT_TOKENS)
 *   haiku  the Claude settings, ANTHROPIC_API_KEY + LLM_FAILOVER_MODEL — paid
 *
 * No defaults, as llm.config.ts: a missing or malformed value stops the API and
 * the worker at start with the whole list. The one value that is a number
 * meaning "none" is declared, not missing: _RPM / _DAILY = 0 means the
 * provider sets no such limit, _CTX = 0 means the window is unknown.
 */
import { readLlmConfig } from './llm.config';

export type RouteClass = 'high' | 'medium' | 'low';
export const ROUTE_CLASSES: RouteClass[] = ['high', 'medium', 'low'];

/** What a provider's terms say it does with prompts (P0 §9.3). */
export type DataTerms = 'no_training' | 'may_train' | 'unknown';
const DATA_TERMS: DataTerms[] = ['no_training', 'may_train', 'unknown'];

export type RungKind = 'external' | 'platform' | 'haiku';

export interface RouterProvider {
  code: string;
  kind: RungKind;
  /** OpenAI-compatible base URL. '' for haiku (the Anthropic SDK). */
  url: string;
  model: string;
  /** Never logged, never returned by an API. */
  key: string;
  /** Window in tokens; 0 = unknown, no check. */
  ctx: number;
  /** Requests per minute; 0 = no limit declared. */
  rpm: number;
  /** Requests per UTC day; 0 = no limit declared. */
  daily: number;
  dataTerms: DataTerms;
  /** Vikuna pays per token. */
  paid: boolean;
}

export interface RouterConfig {
  /** Every provider a route may name, reserved ones included. */
  providers: Record<string, RouterProvider>;
  routes: Record<RouteClass, string[]>;
  /** Cooldown after a 429 that carries no Retry-After. */
  cooldownSeconds: number;
}

export const RESERVED = ['qwen', 'haiku'] as const;

export class RouterConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`LLM_ROUTER_CONFIG_INVALID: ${problems.join('; ')}. Set them in .env — see backend/.env.example and docs/llm-config.md.`);
    this.name = 'RouterConfigError';
  }
}

const envName = (code: string, field: string) => `LLM_${code.toUpperCase()}_${field}`;

export function readRouterConfig(env: NodeJS.ProcessEnv = process.env): RouterConfig {
  const problems: string[] = [];
  const raw = (name: string): string | undefined => env[name]?.trim();
  const list = (name: string): string[] | null => {
    const v = env[name];
    if (v === undefined) { problems.push(`${name} is not set`); return null; }
    return v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  };
  const int = (name: string, min: number): number => {
    const v = raw(name);
    if (v === undefined || v === '') { problems.push(`${name} is not set`); return NaN; }
    const n = Number(v);
    if (!Number.isInteger(n) || n < min) { problems.push(`${name}=${v} is not a whole number ≥ ${min}`); return NaN; }
    return n;
  };

  const providers: Record<string, RouterProvider> = {};

  // ── Declared providers ──
  const declared = list('LLM_PROVIDERS') ?? [];
  const seen = new Set<string>();
  for (const code of declared) {
    if (!/^[a-z][a-z0-9_]*$/.test(code)) { problems.push(`LLM_PROVIDERS: "${code}" is not a valid code (letters, digits, _)`); continue; }
    if ((RESERVED as readonly string[]).includes(code)) {
      problems.push(`LLM_PROVIDERS: "${code}" is reserved — it is already configured (qwen = LLM_PRIMARY_*, haiku = the Claude settings); name it in a route instead`);
      continue;
    }
    if (seen.has(code)) { problems.push(`LLM_PROVIDERS: "${code}" is listed twice`); continue; }
    seen.add(code);

    const url = (raw(envName(code, 'URL')) ?? '').replace(/\/+$/, '');
    if (!url) problems.push(`${envName(code, 'URL')} is not set`);
    else if (!/^https?:\/\//.test(url)) problems.push(`${envName(code, 'URL')}=${url} is not an http(s) URL`);
    const model = raw(envName(code, 'MODEL')) ?? '';
    if (!model) problems.push(`${envName(code, 'MODEL')} is not set`);
    // A key may be empty for a self-hosted endpoint, but it must be declared.
    if (env[envName(code, 'KEY')] === undefined) problems.push(`${envName(code, 'KEY')} is not set (empty is allowed for an endpoint with no auth)`);
    const terms = (raw(envName(code, 'DATA_TERMS')) ?? '').toLowerCase();
    if (!terms) problems.push(`${envName(code, 'DATA_TERMS')} is not set (no_training · may_train · unknown — read it from the provider's current terms)`);
    else if (!(DATA_TERMS as string[]).includes(terms)) problems.push(`${envName(code, 'DATA_TERMS')}=${terms} must be one of ${DATA_TERMS.join(', ')}`);

    providers[code] = {
      code, kind: 'external', url, model,
      key: raw(envName(code, 'KEY')) ?? '',
      ctx: int(envName(code, 'CTX'), 0),
      rpm: int(envName(code, 'RPM'), 0),
      daily: int(envName(code, 'DAILY'), 0),
      dataTerms: (terms || 'unknown') as DataTerms,
      paid: false,
    };
  }

  // ── Routes ──
  const routes = {} as Record<RouteClass, string[]>;
  let wantsHaiku = false;
  for (const rc of ROUTE_CLASSES) {
    const name = `LLM_ROUTE_${rc.toUpperCase()}`;
    const r = list(name);
    routes[rc] = r ?? [];
    if (!r) continue;
    if (r.length === 0) { problems.push(`${name} is empty — a route needs at least one provider`); continue; }
    const dup = r.find((c, i) => r.indexOf(c) !== i);
    if (dup) problems.push(`${name}: "${dup}" appears twice`);
    for (const c of r) {
      if (c === 'haiku') { wantsHaiku = true; continue; }
      if (c === 'qwen') continue;
      if (!seen.has(c)) problems.push(`${name}: "${c}" is not declared in LLM_PROVIDERS`);
    }
  }

  const cooldownSeconds = int('LLM_ROUTER_COOLDOWN_SECONDS', 1);

  // ── The reserved two, from the settings they already have ──
  let llm;
  try { llm = readLlmConfig(env); } catch (e) { problems.push((e as Error).message); }
  if (llm) {
    providers.qwen = {
      code: 'qwen', kind: 'platform', url: llm.primaryUrl, model: llm.primaryModel, key: llm.primaryKey,
      ctx: llm.contextTokens, rpm: 0, daily: 0, dataTerms: 'no_training', paid: false,
    };
    if (llm.failoverModel) {
      providers.haiku = {
        code: 'haiku', kind: 'haiku', url: '', model: llm.failoverModel, key: '',
        ctx: 0, rpm: 0, daily: 0, dataTerms: 'no_training', paid: true,
      };
    } else if (wantsHaiku) {
      problems.push('a route names "haiku" but ANTHROPIC_API_KEY is not set, so there is no Claude to call');
    }
  }

  if (problems.length) throw new RouterConfigError(problems);
  return { providers, routes, cooldownSeconds };
}

/** Called by server.ts and worker.ts at start. Prints the routes, never a key. */
export function assertRouterConfig(scope: string): RouterConfig {
  const c = readRouterConfig();
  const ext = Object.values(c.providers).filter((p) => p.kind === 'external')
    .map((p) => `${p.code}=${p.model} (${p.dataTerms}, ${p.rpm || '∞'}/min, ${p.daily || '∞'}/day)`);
  console.log(`[${scope}] LLM router: providers ${ext.length ? ext.join(', ') : 'none declared'}; `
    + ROUTE_CLASSES.map((r) => `${r}=${c.routes[r].join('→')}`).join(' ')
    + ` · a provider is used only once the admin switches it on (Settings → Models)`);
  return c;
}
