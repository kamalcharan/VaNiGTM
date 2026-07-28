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
  subClusters,
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

describe('sub-clusters — FTCCI industry_raw is a product description', () => {
  // "Manufacturing of Bulk Drugs" and "Manufacturing of Plastic Chairs" are
  // both manufacturing and share nothing else. These are the real strings.
  it.each([
    ['Manufacturing of Bulk Drugs and Drug Intermediates', 'pharma'],
    ['Manufacturing of API and Intermediates', 'pharma'],
    ['Manufacturing of Nutraceuticals', 'pharma'],
    ['Manufacturing of Cosmetic Herbal Products', 'pharma'],
    ['Manufacturing of Biosimilars', 'pharma'],
    ['Manufacturing of Excipients', 'pharma'],
    ['Manufacturing of Rice', 'food'],
    ['Manufacturing of Confectionery Candy Toffee', 'food'],
    ['Manufacturing & Exports  of Chocolate Products', 'food'],
    ['Manufacturing of Pickles, Snacks, Masalas, Chutney Powders', 'food'],
    ['Manufacturing of HDPE / PP Woven Sacks', 'plastics'],
    ['Manufacturing of Plastic Chairs', 'plastics'],
    ['Manufacturing of Rigid Boxes Packaging  & Multi Color Offset Printers', 'plastics'],
    ['Manufacturing of Ceiling Fans, Pedestal Fan, Table Fans', 'electrical'],
    ['Manufacturing of Alternators, Motors, Rotary Converters', 'electrical'],
    ['Manufacturing of Instruments Transformers, Potential Transformers', 'electrical'],
    ['Manufacturing of Special Purpose Machines', 'engineering'],
    ['Manufacturing of Alloys Steel Casting ,General Engineering Spares', 'engineering'],
    ['Manufacturing of Forgings, Components', 'engineering'],
    ['Manufacturing of Agro Chemicals, Fertilizers, Micro Nutrients, Seeds', 'chemicals'],
    ['Manufacturing & Exports of Refractory Products', 'chemicals'],
    ['Manufacturing of Plywood Doors', 'construction'],
    ['Manufacturing of Gypsum Plaster, Gypsum Channel, Plaster Board', 'construction'],
  ])('%s -> %s', (raw, sub) => {
    const v = canonicalIndustry(raw);
    expect(v.canonical).toBe('manufacturing');
    expect(v.sub).toBe(sub);
  });

  it('leaves a row unsegmented rather than forcing it into a segment', () => {
    // "Coil Nails" is manufacturing and matches no sub-rule. That is an
    // answer, not a failure — the report counts it as unsegmented.
    const v = canonicalIndustry('Manufacturing of Coil Nails');
    expect(v.canonical).toBe('manufacturing');
    expect(v.sub).toBeNull();
  });

  it('resolves an overlap by declared precedence, not by chance', () => {
    // Food before chemicals: this company sells food.
    const v = canonicalIndustry('Manufacturing of Cocoa Powder and Food Products, Dyes and Chemicals');
    expect(v.sub).toBe('food');
  });

  it('reports no sub for a row outside the cluster', () => {
    expect(canonicalIndustry('Hotels & Restaurants').sub).toBeUndefined();
  });

  it('exposes the sub-clusters for a cluster, and none for an unknown one', () => {
    expect(subClusters('manufacturing').map((s) => s.sub)).toContain('pharma');
    expect(subClusters('nope')).toEqual([]);
  });
});
