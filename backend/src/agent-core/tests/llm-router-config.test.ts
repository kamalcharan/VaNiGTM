/**
 * The router's .env, in Charan's shape — and every way it can be wrong is
 * named at start, all at once (no defaults, as llm.config.ts).
 */
import { readRouterConfig, RouterConfigError } from '../llm.router.config';

const groq = {
  LLM_GROQ_URL: 'https://api.groq.com/openai/v1/', LLM_GROQ_KEY: 'k', LLM_GROQ_MODEL: 'llama-3.3-70b-versatile',
  LLM_GROQ_CTX: '8000', LLM_GROQ_RPM: '30', LLM_GROQ_DAILY: '1000', LLM_GROQ_DATA_TERMS: 'unknown',
};
const env = (over: Record<string, string | undefined>) => {
  const e: NodeJS.ProcessEnv = { ...process.env, LLM_PROVIDERS: 'groq', ...groq,
    LLM_ROUTE_HIGH: 'groq,qwen', LLM_ROUTE_MEDIUM: 'qwen', LLM_ROUTE_LOW: 'qwen', LLM_ROUTER_COOLDOWN_SECONDS: '60',
    ANTHROPIC_API_KEY: '' };
  for (const [k, v] of Object.entries(over)) { if (v === undefined) delete e[k]; else e[k] = v; }
  return e;
};
const problems = (e: NodeJS.ProcessEnv): string[] => {
  try { readRouterConfig(e); return []; } catch (x) { return (x as RouterConfigError).problems ?? [String(x)]; }
};

describe('the router config', () => {
  it('reads a provider and the routes, and adds qwen from the platform settings', () => {
    const c = readRouterConfig(env({}));
    expect(c.providers.groq).toMatchObject({ kind: 'external', url: 'https://api.groq.com/openai/v1', ctx: 8000, rpm: 30, daily: 1000, dataTerms: 'unknown', paid: false });
    expect(c.providers.qwen).toMatchObject({ kind: 'platform', dataTerms: 'no_training', model: process.env.LLM_PRIMARY_MODEL });
    expect(c.providers.haiku).toBeUndefined();       // no ANTHROPIC_API_KEY
    expect(c.routes.high).toEqual(['groq', 'qwen']);
  });

  it('adds haiku, paid, when the Claude key is set', () => {
    const c = readRouterConfig(env({ ANTHROPIC_API_KEY: 'sk-ant-x', LLM_ROUTE_HIGH: 'groq,qwen,haiku' }));
    expect(c.providers.haiku).toMatchObject({ kind: 'haiku', paid: true, model: process.env.LLM_FAILOVER_MODEL });
  });

  it('allows no outside providers at all', () => {
    expect(readRouterConfig(env({ LLM_PROVIDERS: '', LLM_ROUTE_HIGH: 'qwen' })).providers.groq).toBeUndefined();
  });

  it('names every missing provider setting at once', () => {
    const p = problems(env({ LLM_GROQ_MODEL: undefined, LLM_GROQ_RPM: undefined, LLM_GROQ_DATA_TERMS: undefined, LLM_GROQ_KEY: undefined }));
    expect(p).toEqual(expect.arrayContaining([
      expect.stringContaining('LLM_GROQ_MODEL'), expect.stringContaining('LLM_GROQ_RPM'),
      expect.stringContaining('LLM_GROQ_DATA_TERMS'), expect.stringContaining('LLM_GROQ_KEY'),
    ]));
  });

  it('refuses a route naming an undeclared provider, an empty route, a missing route', () => {
    expect(problems(env({ LLM_ROUTE_HIGH: 'groq,mistral' }))).toEqual([expect.stringContaining('"mistral" is not declared')]);
    expect(problems(env({ LLM_ROUTE_LOW: '' }))).toEqual([expect.stringContaining('LLM_ROUTE_LOW is empty')]);
    expect(problems(env({ LLM_ROUTE_MEDIUM: undefined }))).toEqual([expect.stringContaining('LLM_ROUTE_MEDIUM is not set')]);
  });

  it('refuses the reserved codes as declared providers, and haiku with no key', () => {
    expect(problems(env({ LLM_PROVIDERS: 'groq,qwen' }))).toEqual([expect.stringContaining('"qwen" is reserved')]);
    expect(problems(env({ LLM_ROUTE_HIGH: 'groq,haiku' }))).toEqual([expect.stringContaining('ANTHROPIC_API_KEY is not set')]);
  });

  it('refuses bad values', () => {
    expect(problems(env({ LLM_GROQ_DATA_TERMS: 'maybe' }))).toEqual([expect.stringContaining('must be one of')]);
    expect(problems(env({ LLM_GROQ_URL: 'api.groq.com' }))).toEqual([expect.stringContaining('not an http(s) URL')]);
    expect(problems(env({ LLM_GROQ_RPM: '-1' }))).toEqual([expect.stringContaining('LLM_GROQ_RPM=-1')]);
    expect(problems(env({ LLM_ROUTER_COOLDOWN_SECONDS: '0' }))).toEqual([expect.stringContaining('LLM_ROUTER_COOLDOWN_SECONDS')]);
  });
});
