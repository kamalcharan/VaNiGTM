import { companyKey, employerFromHeadline, matchCompany, tokenDice, acronym } from '../company-matcher';

const POOL = [
  { id: 1, name: 'Rashtriya Chemicals & Fertilizers Limited' },
  { id: 2, name: 'Fertilisers and Chemicals Travancore Limited' },
  { id: 3, name: 'Escorts Kubota Limited' },
  { id: 4, name: 'Vardhman Textiles Ltd' },
  { id: 5, name: 'Vardhman Polytex Limited' },
  { id: 6, name: 'Toyota Kirloskar Motor Pvt Ltd' },
  { id: 7, name: 'Sangam (India) Limited' },
  { id: 8, name: 'Essel Propack Limited' },
  { id: 9, name: 'JK Lakshmi Cement Ltd' },
  { id: 10, name: 'Meghalaya Cements Limited' },
];

describe('companyKey', () => {
  it('agrees with the pool name_key idea and drops legal words', () => {
    expect(companyKey('Rashtriya Chemicals & Fertilizers Ltd.')).toBe('RASHTRIYA CHEMICALS FERTILIZERS');
    expect(companyKey('Rashtriya Chemicals & Fertilizers Limited')).toBe('RASHTRIYA CHEMICALS FERTILIZERS');
    expect(companyKey('M/s.CHETTINAD CEMENT CORPORATION LTD')).toBe('CHETTINAD CEMENT');
    expect(companyKey('Sangam (India) Limited')).toBe('SANGAM');
  });
});

describe('employerFromHeadline', () => {
  it('reads "at X" and stops at the separator', () => {
    expect(employerFromHeadline('Chief Engineer — Chief Engineer at RCF Ltd')).toBe('RCF Ltd');
    expect(employerFromHeadline('General Manager (Purchase) at R.C.F. Ltd, Trombay')).toBe('R.C.F. Ltd');
    expect(employerFromHeadline('Vice President at Toyota Kirloskar Motor')).toBe('Toyota Kirloskar Motor');
    expect(employerFromHeadline('Chief Engineer at Essel Propack Limited')).toBe('Essel Propack Limited');
    expect(employerFromHeadline('Chief Engineer — --')).toBeNull();
  });
});

describe('matchCompany', () => {
  it('Ltd vs Limited: exact key', () => {
    const r = matchCompany('Rashtriya Chemicals & Fertilizers Ltd.', 'Chief Engineer', POOL);
    expect(r.status).toBe('matched'); expect(r.candidate?.id).toBe(1); expect(r.method).toBe('key');
  });
  it('acronym in the headline resolves RCF', () => {
    const r = matchCompany('RCF', 'Chief Engineer at RCF Ltd', POOL);
    expect(r.status).toBe('matched'); expect(r.candidate?.id).toBe(1);
  });
  it('headline beats a short column: EPL → Essel Propack', () => {
    const r = matchCompany('EPL Limited', 'Chief Engineer at Essel Propack Limited', POOL);
    expect(r.status).toBe('matched'); expect(r.candidate?.id).toBe(8); expect(r.method).toBe('headline');
  });
  it('Toyota + Toyota Kirloskar in headline', () => {
    const r = matchCompany('Toyota', 'Vice President at Toyota Kirloskar Motor', POOL);
    expect(r.status).toBe('matched'); expect(r.candidate?.id).toBe(6);
  });
  it('location suffix: SANGAM INDIA LTD, BHILWARA', () => {
    const r = matchCompany('SANGAM INDIA LTD, BHILWARA', 'VP(Engg.- Elect.) at Sangam India Ltd', POOL);
    expect(r.status).toBe('matched'); expect(r.candidate?.id).toBe(7);
  });
  it('"Vardhman" alone is a GAP with both Vardhmans on the shortlist', () => {
    const r = matchCompany('Vardhman', 'VP Engineering — Vice President Engineering', POOL);
    expect(r.status).toBe('gap');
    expect(r.shortlist.map((s) => s.candidate.id).sort()).toEqual([4, 5]);
  });
  it('"N" is nothing, not a guess', () => {
    const r = matchCompany('N', 'Vice President (Head) - Production', POOL);
    expect(r.status).toBe('none'); expect(r.candidate).toBeNull();
  });
  it('a company not in the pool is none, with the tried strings kept', () => {
    const r = matchCompany('Global Gourmet Pvt. Ltd.', 'Chief R&D at Global Gourmet Pvt Ltd', POOL);
    expect(r.status).toBe('none'); expect(r.tried).toContain('Global Gourmet Pvt. Ltd.');
  });
  it('helpers', () => {
    expect(acronym('RASHTRIYA CHEMICALS FERTILIZERS')).toBe('RCF');
    expect(tokenDice('JK LAKSHMI CEMENT', 'MEGHALAYA CEMENTS')).toBeLessThan(0.55);
  });
});
