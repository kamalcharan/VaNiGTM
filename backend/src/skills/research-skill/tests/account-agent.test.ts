/**
 * Account research agent — the pure parts.
 *
 * The stages that matter here are the guards, not the happy path: the
 * evidence check that stops an invented certification reaching a first
 * email, and the "not stated" handling that stops absence of evidence being
 * read as a fit signal. Both are pure functions and need no database or LLM.
 *
 * The full pipeline is exercised against a real PostgreSQL in
 * account-agent.db.test.ts.
 */

import { meaningful, verifyEvidence, urlVariants, AccountResearchAgent } from '../account.agent';

const page = (url: string, text: string) => ({ url, text });

describe('meaningful', () => {
  it('keeps a real answer', () => {
    expect(meaningful('Bulk drugs and intermediates')).toBe('Bulk drugs and intermediates');
  });

  // The model is TOLD to write "not stated" rather than invent. Storing that
  // string would then read as a fact downstream, and fit scoring would treat
  // absence of evidence as evidence.
  it.each(['not stated', 'Not Specified', 'unknown', 'N/A', 'n/a', 'none', 'null', '-', '   '])(
    'reduces %s to null', (v) => expect(meaningful(v)).toBeNull(),
  );

  it('is null for anything that is not a string', () => {
    expect(meaningful(null)).toBeNull();
    expect(meaningful(undefined)).toBeNull();
    expect(meaningful(42)).toBeNull();
  });

  it('does not strip a real answer that merely contains a stop word', () => {
    expect(meaningful('None of the plants are WHO-GMP certified'))
      .toBe('None of the plants are WHO-GMP certified');
  });
});

describe('verifyEvidence — the anti-hallucination gate', () => {
  const pages = [
    page('https://x.com/about', 'Established in 1998, we operate two manufacturing units in Medak district.'),
    page('https://x.com/quality', 'Our facility holds WHO-GMP certification renewed in 2024.'),
  ];

  it('keeps a claim whose excerpt really appears on a page we read', () => {
    const { kept, dropped } = verifyEvidence([
      { claim: 'two units', url: 'https://x.com/about', excerpt: 'we operate two manufacturing units in Medak' },
    ], pages);
    expect(kept).toHaveLength(1);
    expect(dropped).toBe(0);
  });

  // The failure this whole design exists to prevent: a plausible
  // certification for a pharma company that the site never claimed.
  it('drops an invented claim', () => {
    const { kept, dropped } = verifyEvidence([
      { claim: 'USFDA approved', url: 'https://x.com/quality', excerpt: 'our plant is approved by the USFDA' },
    ], pages);
    expect(kept).toHaveLength(0);
    expect(dropped).toBe(1);
  });

  it('keeps the real claim and drops the invented one from the same batch', () => {
    const { kept, dropped } = verifyEvidence([
      { claim: 'WHO-GMP', url: 'https://x.com/quality', excerpt: 'holds WHO-GMP certification renewed in 2024' },
      { claim: 'USFDA', url: 'https://x.com/quality', excerpt: 'approved by the United States FDA since 2019' },
    ], pages);
    expect(kept.map((k) => k.claim)).toEqual(['WHO-GMP']);
    expect(dropped).toBe(1);
  });

  it('drops an excerpt too short to verify', () => {
    // "1998" appears, but a four-character excerpt proves nothing.
    const { kept } = verifyEvidence([
      { claim: 'founded 1998', url: 'https://x.com/about', excerpt: '1998' },
    ], pages);
    expect(kept).toHaveLength(0);
  });

  it('ignores whitespace and case differences, which are not fabrication', () => {
    const { kept } = verifyEvidence([
      { claim: 'two units', url: 'https://x.com/about', excerpt: 'We  Operate   Two Manufacturing Units' },
    ], pages);
    expect(kept).toHaveLength(1);
  });

  it('drops everything when no page was read', () => {
    const { kept, dropped } = verifyEvidence([
      { claim: 'anything', url: 'https://x.com', excerpt: 'a sentence long enough to check' },
    ], []);
    expect(kept).toHaveLength(0);
    expect(dropped).toBe(1);
  });
});

describe('subpagesFrom', () => {
  const html = `
    <a href="/about-us">About</a>
    <a href="/products/api">Products</a>
    <a href="/quality.html">Quality</a>
    <a href="/contact-us/">Contact</a>
    <a href="/blog/2024/why-we-are-great">Blog</a>
    <a href="https://facebook.com/us">Facebook</a>
    <a href="/">Home</a>
  `;

  it('finds the pages worth reading for a manufacturer', () => {
    const found = AccountResearchAgent.subpagesFrom(html, 'https://acme.com');
    expect(found.some((u) => u.includes('/about-us'))).toBe(true);
    expect(found.some((u) => u.includes('/products'))).toBe(true);
    expect(found.some((u) => u.includes('/quality'))).toBe(true);
    expect(found.some((u) => u.includes('/contact-us'))).toBe(true);
  });

  it('ignores other hosts, the home page and pages with no research value', () => {
    const found = AccountResearchAgent.subpagesFrom(html, 'https://acme.com');
    expect(found.some((u) => u.includes('facebook.com'))).toBe(false);
    expect(found.some((u) => u.includes('/blog/'))).toBe(false);
    expect(found).not.toContain('https://acme.com/');
  });

  it('orders by what pays off first — about before contact', () => {
    const found = AccountResearchAgent.subpagesFrom(html, 'https://acme.com');
    const about = found.findIndex((u) => u.includes('about'));
    const contact = found.findIndex((u) => u.includes('contact'));
    expect(about).toBeLessThan(contact);
  });

  it('survives malformed markup and a malformed root', () => {
    expect(() => AccountResearchAgent.subpagesFrom('<a href=">>>', 'https://acme.com')).not.toThrow();
    expect(AccountResearchAgent.subpagesFrom(html, 'not a url')).toEqual([]);
  });

  it('does not return the same page twice', () => {
    const dupes = '<a href="/about">a</a><a href="/about#top">b</a><a href="/about">c</a>';
    const found = AccountResearchAgent.subpagesFrom(dupes, 'https://acme.com');
    expect(new Set(found).size).toBe(found.length);
  });
});

describe('urlVariants — a site is not dead because one address refused', () => {
  it('tries apex, www and plain http, in that order', () => {
    expect(urlVariants('aurobindo.in')).toEqual([
      'https://aurobindo.in',
      'https://www.aurobindo.in',
      'http://aurobindo.in',
      'http://www.aurobindo.in',
    ]);
  });

  it('does not double up when the domain already carries www', () => {
    const v = urlVariants('www.biophore.com');
    expect(v).toEqual([
      'https://biophore.com',
      'https://www.biophore.com',
      'http://biophore.com',
      'http://www.biophore.com',
    ]);
    expect(new Set(v).size).toBe(v.length);
  });

  it('respects an explicit URL rather than guessing around it', () => {
    // A website column carrying a full URL is a human's answer; do not
    // second-guess it with three variants.
    expect(urlVariants('https://shop.example.com/en')).toEqual(['https://shop.example.com/en']);
  });
});
