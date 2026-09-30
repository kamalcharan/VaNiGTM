/**
 * llm.config — every LLM setting from .env, no defaults (Charan, 2026-09-30).
 *
 * The case that matters most is the first: the Main VPS once ran for weeks on
 * LLM_PRIMARY_URL's code default (localhost:11434, i.e. the container itself).
 */
import { readLlmConfig, LlmConfigError } from '../llm.config';

const FULL: NodeJS.ProcessEnv = {
  LLM_PRIMARY_URL: 'https://qwen.example.com/v1/',
  LLM_PRIMARY_MODEL: 'qwen3-8b',
  LLM_PRIMARY_KEY: '',
  LLM_PRIMARY_TIMEOUT_MS: '120000',
  LLM_PRIMARY_SYSTEM_SUFFIX: '/no_think',
  LLM_CONTEXT_TOKENS: '8192',
  LLM_MAX_CONCURRENT: '1',
  LLM_BYOK_MAX_CONCURRENT: '4',
  LLM_CHARS_PER_TOKEN: '3',
  LLM_TOKENS_PER_SEC: '12',
  HAIKU_DEFAULT: 'false',
  ANTHROPIC_API_KEY: 'sk-ant-test',
  LLM_FAILOVER_MODEL: 'claude-haiku-4-5',
};
const without = (...keys: string[]) => Object.fromEntries(Object.entries(FULL).filter(([k]) => !keys.includes(k)));
const problems = (env: NodeJS.ProcessEnv) => {
  try { readLlmConfig(env); return []; } catch (e) { return (e as LlmConfigError).problems; }
};

describe('llm.config — everything from .env', () => {
  it('reads a complete configuration exactly as written', () => {
    const c = readLlmConfig(FULL);
    expect(c).toMatchObject({
      primaryUrl: 'https://qwen.example.com/v1', primaryModel: 'qwen3-8b', primaryKey: '',
      primaryTimeoutMs: 120000, primarySystemSuffix: '/no_think', contextTokens: 8192,
      maxConcurrent: 1, byokMaxConcurrent: 4, charsPerToken: 3, tokensPerSec: 12,
      haikuDefault: false, failoverModel: 'claude-haiku-4-5',
    });
  });

  it('has no default for the platform URL or model — the localhost trap', () => {
    expect(problems(without('LLM_PRIMARY_URL', 'LLM_PRIMARY_MODEL')))
      .toEqual(['LLM_PRIMARY_URL is not set', 'LLM_PRIMARY_MODEL is not set']);
  });

  it('names EVERY problem at once, so a deploy is fixed in one edit', () => {
    const p = problems({});
    for (const v of ['LLM_PRIMARY_URL', 'LLM_PRIMARY_MODEL', 'LLM_PRIMARY_TIMEOUT_MS', 'LLM_CONTEXT_TOKENS',
      'LLM_MAX_CONCURRENT', 'LLM_BYOK_MAX_CONCURRENT', 'LLM_CHARS_PER_TOKEN', 'LLM_TOKENS_PER_SEC', 'HAIKU_DEFAULT']) {
      expect(p.join(';')).toContain(v);
    }
  });

  it('allows an empty key and an empty suffix — they mean "none", declared', () => {
    expect(problems({ ...FULL, LLM_PRIMARY_KEY: '', LLM_PRIMARY_SYSTEM_SUFFIX: '' })).toEqual([]);
    expect(problems(without('LLM_PRIMARY_SYSTEM_SUFFIX'))).toEqual(['LLM_PRIMARY_SYSTEM_SUFFIX is not set']);
  });

  it('requires the failover model whenever there is a key to fail over with', () => {
    expect(problems(without('LLM_FAILOVER_MODEL'))).toEqual(['LLM_FAILOVER_MODEL is not set']);
    const noKey = readLlmConfig(without('ANTHROPIC_API_KEY', 'LLM_FAILOVER_MODEL'));
    expect(noKey.failoverModel).toBeNull();
  });

  it('rejects malformed values instead of coercing them', () => {
    expect(problems({ ...FULL, LLM_MAX_CONCURRENT: '0' })[0]).toMatch(/LLM_MAX_CONCURRENT=0/);
    expect(problems({ ...FULL, HAIKU_DEFAULT: 'yes' })[0]).toMatch(/HAIKU_DEFAULT=yes must be true or false/);
    expect(problems({ ...FULL, LLM_PRIMARY_URL: 'qwen.example.com' })[0]).toMatch(/not an http\(s\) URL/);
    expect(problems({ ...FULL, LLM_CHARS_PER_TOKEN: 'abc' })[0]).toMatch(/LLM_CHARS_PER_TOKEN=abc/);
  });

  it('accepts LLM_CONTEXT_TOKENS=0 as a DECLARED "unknown window"', () => {
    expect(readLlmConfig({ ...FULL, LLM_CONTEXT_TOKENS: '0' }).contextTokens).toBe(0);
  });
});
