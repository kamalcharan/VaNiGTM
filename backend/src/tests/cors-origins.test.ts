/**
 * CORS_ORIGIN parsing.
 *
 * One API serves two consoles now — the GTM frontend and vani-app. This used
 * to be a single exact string, so whichever console was not the configured one
 * had every preflight refused.
 *
 * That failure is invisible from the server side: the browser blocks the
 * request, nothing is logged here, and curl cannot reproduce it because curl
 * sends no Origin header. It surfaced in the console as "Cannot reach the VaNi
 * service. Check your connection." — indistinguishable from the API being
 * down, which is where an afternoon goes.
 *
 * The tests that matter most are the ones asserting what is NOT allowed.
 * `credentials: true` means an allowed origin may carry a session cookie, so a
 * parser that is too generous hands an attacker authenticated requests.
 */

import { parseCorsOrigins } from '../cors-origins';

describe('parseCorsOrigins', () => {
  it('takes a list, so two consoles can share one API', () => {
    expect(parseCorsOrigins('http://localhost:3000,http://localhost:3100'))
      .toEqual(['http://localhost:3000', 'http://localhost:3100']);
  });

  it('still takes a single origin, unchanged', () => {
    expect(parseCorsOrigins('https://app.vikuna.io')).toEqual(['https://app.vikuna.io']);
  });

  it('tolerates the spaces a human leaves after a comma', () => {
    expect(parseCorsOrigins(' http://a.test , http://b.test '))
      .toEqual(['http://a.test', 'http://b.test']);
  });

  it('drops a trailing slash, which would never match an Origin header', () => {
    // Browsers send `Origin: https://app.vikuna.io` with no path, so an entry
    // written with a slash silently matches nothing — the exact shape of
    // failure this change exists to stop.
    expect(parseCorsOrigins('https://app.vikuna.io/')).toEqual(['https://app.vikuna.io']);
  });

  it('ignores empty entries from a trailing or doubled comma', () => {
    expect(parseCorsOrigins('http://a.test,,http://b.test,'))
      .toEqual(['http://a.test', 'http://b.test']);
  });

  it('falls back to the documented default when unset or blank', () => {
    // A deployment that sets nothing keeps working exactly as it did before.
    expect(parseCorsOrigins(undefined)).toEqual(['http://localhost:3000']);
    expect(parseCorsOrigins('')).toEqual(['http://localhost:3000']);
    expect(parseCorsOrigins('   ,  ,')).toEqual(['http://localhost:3000']);
  });

  it('never invents a wildcard', () => {
    // With credentials:true every browser refuses a wildcard anyway. The point
    // is that no ordinary input can PRODUCE one.
    for (const input of [undefined, '', 'http://a.test', 'http://a.test,http://b.test']) {
      expect(parseCorsOrigins(input)).not.toContain('*');
    }
  });

  it('keeps entries exact — no prefix or subdomain widening', () => {
    // 'http://localhost:3000' must never come to admit 'http://localhost:30000'
    // or 'https://evil.localhost:3000'. Parsing returns literals; the cors
    // package then compares them with ===.
    const allowed = parseCorsOrigins('http://localhost:3000');
    expect(allowed).toEqual(['http://localhost:3000']);
    expect(allowed).not.toContain('http://localhost:30000');
    expect(allowed.some((o) => 'https://evil.localhost:3000'.startsWith(o))).toBe(false);
  });
});
