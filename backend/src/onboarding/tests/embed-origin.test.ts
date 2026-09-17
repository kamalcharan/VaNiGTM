/**
 * The allowlist entry, not the display string. Each case here is a way the
 * column could have been filled with something that either fails to match a
 * real browser Origin header, or matches more than it should.
 */

import { normaliseOrigin, readOrigins, OriginError, MAX_ORIGINS } from '../embed-origin';

describe('normaliseOrigin', () => {
  it('keeps what a browser actually sends', () => {
    expect(normaliseOrigin('https://careers.acme.io')).toBe('https://careers.acme.io');
  });

  it('adds https when the tenant types a bare host', () => {
    expect(normaliseOrigin('careers.acme.io')).toBe('https://careers.acme.io');
  });

  it('drops the path, query and fragment a pasted URL carries', () => {
    // An Origin header is scheme + host + port and nothing else, so a path in
    // an allowlist entry can only ever fail to match.
    expect(normaliseOrigin('https://careers.acme.io/jobs?src=li#top'))
      .toBe('https://careers.acme.io');
  });

  it('keeps a non-default port and drops a default one', () => {
    expect(normaliseOrigin('https://careers.acme.io:8443')).toBe('https://careers.acme.io:8443');
    expect(normaliseOrigin('https://careers.acme.io:443')).toBe('https://careers.acme.io');
  });

  it('lowercases the host, because Origin comparison is exact', () => {
    expect(normaliseOrigin('HTTPS://Careers.ACME.io')).toBe('https://careers.acme.io');
  });

  it('refuses http on a real host', () => {
    // The embed token names the tenant. Over http it travels in the clear, and
    // accepting it quietly would take that decision out of the tenant's hands.
    expect(() => normaliseOrigin('http://careers.acme.io')).toThrow(OriginError);
    expect(() => normaliseOrigin('http://careers.acme.io')).toThrow(/must be https/);
  });

  it('allows http on loopback, so local development is possible', () => {
    expect(normaliseOrigin('http://localhost:3100')).toBe('http://localhost:3100');
    expect(normaliseOrigin('http://127.0.0.1:3100')).toBe('http://127.0.0.1:3100');
  });

  it('refuses a scheme that is not http or https', () => {
    expect(() => normaliseOrigin('javascript://careers.acme.io')).toThrow(/http and https/);
    expect(() => normaliseOrigin('file:///etc/passwd')).toThrow(OriginError);
  });

  it('refuses a bare word that is not a host', () => {
    expect(() => normaliseOrigin('careers')).toThrow(/not a full host/);
  });

  it('refuses credentials in the origin', () => {
    expect(() => normaliseOrigin('https://user:pw@careers.acme.io')).toThrow(/credentials/);
  });

  it('refuses empty', () => {
    expect(() => normaliseOrigin('   ')).toThrow(OriginError);
  });
});

describe('readOrigins', () => {
  it('returns null when the payload does not mention origins', () => {
    // The caller uses null to LEAVE an existing allowlist alone. Returning []
    // here would make a purpose-only resubmit wipe it and silently
    // de-activate Vara.
    expect(readOrigins({ domain: 'careers.acme.io', purpose: 'candidate' })).toBeNull();
  });

  it('returns [] for an explicit empty list, which does clear it', () => {
    expect(readOrigins({ embed_origins: [] })).toEqual([]);
  });

  it('takes a list', () => {
    expect(readOrigins({ embed_origins: ['careers.acme.io', 'https://www.acme.io'] }))
      .toEqual(['https://careers.acme.io', 'https://www.acme.io']);
  });

  it('takes a single string', () => {
    expect(readOrigins({ embed_origin: 'careers.acme.io' })).toEqual(['https://careers.acme.io']);
  });

  it('takes a comma-separated string, because people type that', () => {
    expect(readOrigins({ embed_origins: 'careers.acme.io, www.acme.io' }))
      .toEqual(['https://careers.acme.io', 'https://www.acme.io']);
  });

  it('dedupes entries that differ only in case or trailing path', () => {
    expect(readOrigins({ embed_origins: ['careers.acme.io', 'HTTPS://CAREERS.acme.io/jobs'] }))
      .toEqual(['https://careers.acme.io']);
  });

  it('skips blanks rather than failing on a trailing comma', () => {
    expect(readOrigins({ embed_origins: 'careers.acme.io, ,' })).toEqual(['https://careers.acme.io']);
  });

  it('refuses an unbounded list', () => {
    const many = Array.from({ length: MAX_ORIGINS + 1 }, (_, i) => `https://h${i}.acme.io`);
    expect(() => readOrigins({ embed_origins: many })).toThrow(/At most 10/);
  });

  it('fails the whole payload when one entry is bad, rather than saving the rest', () => {
    // A partially-applied allowlist is worse than a refused one: the tenant
    // believes they allowlisted two origins and only one is there.
    expect(() => readOrigins({ embed_origins: ['careers.acme.io', 'http://evil.io'] }))
      .toThrow(OriginError);
  });
});
