/**
 * When a 429 says the limit lifts. Without this the router cooled a provider
 * down for a minute and asked again, all night, against a DAILY limit
 * (OpenRouter's free tier, 2026-10-02).
 */
import { retryAfterSeconds } from '../llm.client';

const NOW = Date.parse('2026-10-02T18:00:00Z');
const h = (m: Record<string, string>) => (n: string) => m[n.toLowerCase()] ?? null;

describe('retryAfterSeconds', () => {
  it('reads Retry-After in seconds', () => {
    expect(retryAfterSeconds(h({ 'retry-after': '30' }), '', NOW)).toBe(30);
  });

  it("reads OpenRouter's reset as epoch ms, from the header or the body", () => {
    const midnight = Date.parse('2026-10-03T00:00:00Z');
    expect(retryAfterSeconds(h({ 'x-ratelimit-reset': String(midnight) }), '', NOW)).toBe(6 * 3600);
    const body = '{"error":{"message":"Rate limit exceeded: free-models-per-day","metadata":{"headers":{"X-RateLimit-Limit":"50","X-RateLimit-Remaining":"0","X-RateLimit-Reset":"' + midnight + '"}}}}';
    expect(retryAfterSeconds(h({}), body, NOW)).toBe(6 * 3600);
  });

  it('reads an epoch in seconds too', () => {
    expect(retryAfterSeconds(h({ 'x-ratelimit-reset': String(NOW / 1000 + 90) }), '', NOW)).toBe(90);
  });

  it("reads Groq's durations and keeps the longest wait", () => {
    expect(retryAfterSeconds(h({ 'x-ratelimit-reset-requests': '2m59.5s', 'x-ratelimit-reset-tokens': '7.66s' }), '', NOW)).toBe(180);
    expect(retryAfterSeconds(h({ 'x-ratelimit-reset-tokens': '450ms' }), '', NOW)).toBe(1);
  });

  it('says nothing when the provider says nothing, or names a time already past', () => {
    expect(retryAfterSeconds(h({}), '{"error":"slow down"}', NOW)).toBeUndefined();
    expect(retryAfterSeconds(h({ 'x-ratelimit-reset': String(NOW - 5000) }), '', NOW)).toBeUndefined();
  });
});
