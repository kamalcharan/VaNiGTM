/**
 * Industry cluster rules — no database needed.
 *
 * These are the rules that decide who is in the pilot cohort, so the cases
 * that matter are the ones a human would argue about: a body that represents
 * manufacturers is not one, and a company that manufactures AND exports is.
 */

import {
  canonicalIndustry,
  normalizeIndustryText,
  getCluster,
  clusterNames,
} from '../industry-normalizer';

describe('normalizeIndustryText', () => {
  it('lower-cases, strips punctuation and collapses whitespace', () => {
    expect(normalizeIndustryText('  Manufacturers &  Exporters! ')).toBe('manufacturers exporters');
  });

  it('treats & and "and" alike', () => {
    expect(normalizeIndustryText('Manufacturer & Exporter'))
      .toBe(normalizeIndustryText('Manufacturer and Exporter').replace(' and ', ' '));
  });

  it('returns null for blank and punctuation-only values', () => {
    expect(normalizeIndustryText(null)).toBeNull();
    expect(normalizeIndustryText('   ')).toBeNull();
    expect(normalizeIndustryText('---')).toBeNull();
    expect(normalizeIndustryText(undefined)).toBeNull();
  });
});

describe('canonicalIndustry — the manufacturing cluster', () => {
  // The variants actually present in the FTCCI import, plus the
  // abbreviations members use.
  it.each([
    'Manufacturers',
    'Manufacturer',
    'Manufacturing',
    'Manufactures',
    'MFG',
    'Mfr',
    'Mfrs',
    'Pharma Manufacturers',
    'Steel Manufacturing Unit',
    'Manufacturer & Exporter',
    'Manufacturers and Suppliers',
    'manufacturing   &  trading',
  ])('matches %s', (raw) => {
    const v = canonicalIndustry(raw);
    expect(v.reason).toBe('matched');
    expect(v.canonical).toBe('manufacturing');
  });

  // The whole reason the exclude list exists. An industry body is not a
  // manufacturer and must never be cold-pitched as one.
  it.each([
    ['Manufacturers Association', 'association'],
    ['All India Manufacturers Federation', 'federation'],
    ['Chamber of Manufacturing Industries', 'chamber'],
    ['Manufacturing Consultancy Services', 'consultancy'],
    ['Manufacturing Consultants', 'consultants'],
    ['Recruitment for Manufacturing', 'recruitment'],
  ])('excludes %s on "%s"', (raw, term) => {
    const v = canonicalIndustry(raw);
    expect(v.reason).toBe('excluded');
    expect(v.canonical).toBeNull();
    expect(v.cluster).toBe('manufacturing');
    expect(v.excluded_by).toBe(term);
  });

  it('reports why it excluded, so the rule can be argued with', () => {
    expect(canonicalIndustry('Manufacturers Association').excluded_by).toBe('association');
  });

  it('does not match on a substring inside another word', () => {
    // 'mfg' must be a token, not a fragment — otherwise codes and part
    // numbers drag rows into the cohort.
    expect(canonicalIndustry('AMFGX Trading').reason).toBe('no_rule');
  });

  it('distinguishes "no industry" from "no rule"', () => {
    expect(canonicalIndustry(null).reason).toBe('no_industry');
    expect(canonicalIndustry('   ').reason).toBe('no_industry');
    expect(canonicalIndustry('Hotels & Restaurants').reason).toBe('no_rule');
    expect(canonicalIndustry('Chartered Accountants').reason).toBe('no_rule');
  });

  it('leaves the overwhelming majority of the tail unclaimed', () => {
    // The taxonomy is explicitly NOT this file's job. If a future edit makes
    // these match, it has widened past a cluster into a catch-all.
    for (const raw of ['Exporters', 'Traders', 'Builders', 'Software Services']) {
      expect(canonicalIndustry(raw).canonical).toBeNull();
    }
  });
});

describe('cluster registry', () => {
  it('exposes the defined clusters and resolves them by name', () => {
    expect(clusterNames()).toContain('manufacturing');
    expect(getCluster('manufacturing')?.label).toBe('Manufacturing');
    expect(getCluster('nope')).toBeUndefined();
  });

  it('keeps canonical names inside VARCHAR(60)', () => {
    for (const name of clusterNames()) expect(name.length).toBeLessThanOrEqual(60);
  });
});
