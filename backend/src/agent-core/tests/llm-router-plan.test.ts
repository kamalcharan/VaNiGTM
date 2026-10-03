/**
 * The routing rules, pure: which provider may take a call, in order, and why
 * each other one may not. Every skip carries a reason — a route never goes
 * quiet about a provider it passed over.
 */
import { planRoute, dataGate, freeAgainAt, type ProviderState } from '../llm.router';
import type { RouterConfig, RouterProvider } from '../llm.router.config';

const prov = (code: string, o: Partial<RouterProvider> = {}): RouterProvider => ({
  code, kind: 'external', url: `https://${code}.test/v1`, model: `${code}-model`, key: 'k',
  ctx: 8000, rpm: 30, daily: 1000, tpm: 0, tpd: 0, dataTerms: 'no_training', paid: false, ...o,
});
const cfg: RouterConfig = {
  providers: {
    groq: prov('groq', { dataTerms: 'unknown' }),
    openrouter: prov('openrouter', { dataTerms: 'may_train', rpm: 20, daily: 50 }),
    clean: prov('clean'),
    qwen: prov('qwen', { kind: 'platform', url: 'http://vps/v1', rpm: 0, daily: 0, ctx: 16384 }),
    haiku: prov('haiku', { kind: 'haiku', url: '', rpm: 0, daily: 0, ctx: 0, paid: true }),
  },
  routes: { high: ['groq', 'openrouter', 'clean', 'qwen', 'haiku'], medium: ['qwen'], low: ['qwen'] },
  cooldownSeconds: 60,
};
const on = (codes: string[], extra: Record<string, Partial<ProviderState>> = {}) =>
  Object.fromEntries(codes.map((c) => [c, { enabled: true, callsMinute: 0, callsToday: 0, cooldownUntil: null, tokensMinute: 0, tokensToday: 0, ...extra[c] }]));
const now = new Date('2026-10-02T10:00:00Z');
const all = ['groq', 'openrouter', 'clean', 'qwen', 'haiku'];
const serves = (p: ReturnType<typeof planRoute>) => p.eligible.map((x) => x.code);
const why = (p: ReturnType<typeof planRoute>, code: string) => p.skipped.find((s) => s.code === code)?.reason;

describe('planRoute', () => {
  it('keeps the route order for public company data, every provider on', () => {
    expect(serves(planRoute(cfg, 'high', 'public_company', on(all), now))).toEqual(all);
  });

  it('a provider with no switch row is OFF — nothing new is used until switched on', () => {
    const p = planRoute(cfg, 'high', 'public_company', on(['qwen']), now);
    expect(serves(p)).toEqual(['qwen']);
    expect(why(p, 'groq')).toBe('switched off');
    expect(why(p, 'haiku')).toBe('switched off');
  });

  it('tenant data goes only to no_training providers', () => {
    const p = planRoute(cfg, 'high', 'tenant', on(all), now);
    expect(serves(p)).toEqual(['clean', 'qwen', 'haiku']);
    expect(why(p, 'openrouter')).toMatch(/may train on prompts — this is tenant data/);
    expect(why(p, 'groq')).toMatch(/unknown on prompts/);
  });

  it('people data never goes to an outside provider, even a no_training one', () => {
    const p = planRoute(cfg, 'high', 'people', on(all), now);
    expect(serves(p)).toEqual(['qwen', 'haiku']);
    expect(why(p, 'clean')).toMatch(/DPDP/);
    expect(dataGate(cfg.providers.qwen, 'people')).toBeNull();
  });

  it('skips a provider cooling down, out of quota today, or at its per-minute limit — with the numbers', () => {
    const p = planRoute(cfg, 'high', 'public_company', on(all, {
      groq: { cooldownUntil: new Date('2026-10-02T10:00:45Z') },
      openrouter: { callsToday: 50 },
      clean: { callsMinute: 30 },
    }), now);
    expect(serves(p)).toEqual(['qwen', 'haiku']);
    expect(why(p, 'groq')).toBe('cooling down until 10:00:45 UTC');
    expect(why(p, 'openrouter')).toBe("today's quota spent (50/50)");
    expect(why(p, 'clean')).toBe('per-minute limit reached (30/30)');
  });

  it('a cooldown in the past no longer applies; 0 means no limit declared', () => {
    const p = planRoute(cfg, 'high', 'public_company', on(all, {
      groq: { cooldownUntil: new Date('2026-10-02T09:59:00Z') }, qwen: { callsToday: 99999, callsMinute: 999 },
    }), now);
    expect(serves(p)).toContain('groq');
    expect(serves(p)).toContain('qwen');
  });

  it('skips a provider whose window the prompt does not fit, and never trims it', () => {
    // ~9,000 chars at the test's 3 chars/token ≈ 3,000 tokens + 6,000 answer = 9,000 > 8,000 − 200.
    const p = planRoute(cfg, 'high', 'public_company', on(all), now, { promptChars: 9000, maxTokens: 6000, overheadTokens: 200 });
    expect(serves(p)).toEqual(['qwen', 'haiku']);       // 16k fits; haiku's window is not judged
    expect(why(p, 'groq')).toMatch(/too large for its 8,000-token window/);
  });

  it('counts tokens as well as requests: a day spent, a minute spent, a call bigger than a minute', () => {
    const tok = { ...cfg, providers: { ...cfg.providers,
      groq: prov('groq', { tpm: 8000, tpd: 200000 }), clean: prov('clean', { tpm: 8000, tpd: 0 }),
      openrouter: prov('openrouter', { tpm: 2000, tpd: 0 }) } };
    const fit = { promptChars: 6000, maxTokens: 1000, overheadTokens: 200 };   // ~3,000 tokens at 3 chars/token
    const p = planRoute(tok, 'high', 'public_company', on(all, {
      groq: { tokensToday: 198500 }, clean: { tokensMinute: 6000 },
    }), now, fit);
    expect(why(p, 'groq')).toBe("today's tokens spent (198,500/200,000, this call ~3,000)");
    expect(why(p, 'clean')).toBe('per-minute token limit reached (6,000/8,000, this call ~3,000)');
    expect(why(p, 'openrouter')).toBe('a call this size (~3,000 tokens) is larger than its 2,000 tokens a minute');
    expect(serves(p)).toEqual(['qwen', 'haiku']);
    // The same providers with room left serve it.
    expect(serves(planRoute(tok, 'high', 'public_company', on(all, { groq: { tokensToday: 1000 } }), now, fit))).toContain('groq');
  });
});

describe('freeAgainAt — when a route has a provider again, for a caller that may wait', () => {
  const two = { ...cfg, routes: { ...cfg.routes, high: ['groq', 'openrouter'] } };
  it('the earliest end of a 429 cooldown or a per-minute window', () => {
    const st = on(['groq', 'openrouter'], {
      groq: { cooldownUntil: new Date('2026-10-02T10:00:20Z') },
      openrouter: { callsMinute: 20 },   // its rpm
    });
    expect(freeAgainAt(two, 'high', 'public_company', st, now)?.toISOString()).toBe('2026-10-02T10:00:20.000Z');
  });
  it('a daily quota spent, or a switch off, does not come back today: null', () => {
    const st = on(['groq'], { groq: { callsToday: 1000 } });
    expect(freeAgainAt(two, 'high', 'public_company', st, now)).toBeNull();
  });
  it('tokens used this minute against a token-a-minute limit: a minute from now', () => {
    const tpm = { ...two, providers: { ...two.providers, groq: prov('groq', { tpm: 8000 }) }, routes: { ...two.routes, high: ['groq'] } };
    expect(freeAgainAt(tpm, 'high', 'public_company', on(['groq'], { groq: { tokensMinute: 7000 } }), now)?.toISOString()).toBe('2026-10-02T10:01:00.000Z');
  });
});
