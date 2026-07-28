/**
 * The normalisers are the highest-risk code in the import path: they are pure
 * functions that decide identity, they MIRROR generated columns in the
 * database, and both times they have been wrong the failure was silent.
 *
 *   migration 187/119 — gt_contacts.normalized_name filtered [^A-Z0-9\s]
 *                       before upper-casing and deleted every lowercase
 *                       letter ('priya sharma' -> '')
 *   migration 196     — gt_prospects.name_key never trimmed
 *
 * Neither showed up as an error. Both are asserted here.
 */

import {
  normalizePersonName,
  normalizeCompanyName,
  normalizeDomain,
  cleanValue,
  firstOf,
  scoreQuality,
  type RejectReason,
} from '../field-normalizers';

describe('normalizePersonName', () => {
  // The exact regression: filtering before upper-casing ate lowercase letters.
  it('keeps lowercase letters (the 187 defect)', () => {
    expect(normalizePersonName('John Smith')).toBe('JOHN SMITH');
    expect(normalizePersonName('priya sharma')).toBe('PRIYA SHARMA');
    expect(normalizePersonName('arun kumar')).toBe('ARUN KUMAR');
  });

  it('never collapses distinct all-lowercase names to the same key', () => {
    expect(normalizePersonName('priya sharma')).not.toBe(normalizePersonName('arun kumar'));
  });

  it('strips a leading honorific and punctuation', () => {
    expect(normalizePersonName('Mr. Ramesh Kumar')).toBe('RAMESH KUMAR');
    expect(normalizePersonName('Dr Anita R. Rao')).toBe('ANITA R RAO');
  });

  it('trims and collapses whitespace', () => {
    expect(normalizePersonName('  priya   sharma ')).toBe('PRIYA SHARMA');
  });

  it('returns empty for nothing usable', () => {
    expect(normalizePersonName(null)).toBe('');
    expect(normalizePersonName('   ')).toBe('');
  });
});

describe('normalizeCompanyName', () => {
  it('drops legal-form noise so the same business matches itself', () => {
    expect(normalizeCompanyName('Acme Pvt. Ltd.')).toBe('ACME');
    expect(normalizeCompanyName('The Acme Company')).toBe('ACME');
  });

  it('trims — the name_key regression', () => {
    expect(normalizeCompanyName('Automotive Manufacturers ')).toBe('AUTOMOTIVE MANUFACTURERS');
    expect(normalizeCompanyName(' Quill Ledger ')).toBe('QUILL LEDGER');
  });
});

describe('normalizeDomain', () => {
  it('strips scheme, www and path — FTCCI ships bare hosts', () => {
    expect(normalizeDomain('www.acme.com')).toBe('acme.com');
    expect(normalizeDomain('https://www.acme.com/about?x=1')).toBe('acme.com');
  });

  it('rejects anything without a dot', () => {
    expect(normalizeDomain('acme')).toBeNull();
    expect(normalizeDomain('')).toBeNull();
  });
});

describe('cleanValue', () => {
  it('rejects the two junk shapes found in the real files, with a reason', () => {
    const rejects: RejectReason[] = [];
    expect(cleanValue('revenue', 'undefined+', rejects)).toBeNull();
    expect(cleanValue('employees', 'Nov-50', rejects)).toBeNull();
    expect(rejects).toHaveLength(2);
    expect(rejects[0].reason).toContain('populated but meaningless');
    expect(rejects[1].reason).toContain('coerced to a date');
  });

  it('passes real values through untouched', () => {
    const rejects: RejectReason[] = [];
    expect(cleanValue('employees', '11-50', rejects)).toBe('11-50');
    expect(rejects).toHaveLength(0);
  });
});

describe('firstOf', () => {
  it('takes the first of a multi-value cell', () => {
    expect(firstOf('a@x.com; b@x.com', /[;,]/)).toBe('a@x.com');
    expect(firstOf('040-1234 / 040-5678', /[/\\,;]/)).toBe('040-1234');
  });
});

describe('scoreQuality', () => {
  it('separates fill rate from validity', () => {
    // Every tracked field populated, but two of them were junk.
    const mapped = { a: 'x', b: 'y', c: 'z', d: 'w' };
    const rejects: RejectReason[] = [
      { field: 'revenue', reason: 'junk' },
      { field: 'employees', reason: 'junk' },
    ];
    const q = scoreQuality(mapped, ['a', 'b', 'c', 'd'], rejects);
    expect(q.completeness).toBe(1);
    expect(q.validity).toBe(0.5);
  });

  it('does not punish a sparse but clean row on validity', () => {
    const mapped = { a: 'x', b: null, c: null, d: null };
    const q = scoreQuality(mapped, ['a', 'b', 'c', 'd'], []);
    expect(q.completeness).toBe(0.25);
    expect(q.validity).toBe(1);
  });
});
