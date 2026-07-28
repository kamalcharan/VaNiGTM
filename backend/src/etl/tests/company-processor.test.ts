/**
 * These cases were verified by hand against real rows from the two profiled
 * files (FTCCI_member_data_26.10.2023.xlsx, Company_prospect_2.csv) in an
 * earlier session, but never committed — so the verification could not survive
 * a refactor. It is pinned here now.
 */

import { mapCompanyRow, dedupKey, normalizeDomain, stateFromPin } from '../company-processor';

describe('stateFromPin', () => {
  // 2,840 of FTCCI's 2,913 PINs start '50'. Deriving state from the postal
  // circle is far more reliable than the free-text city column, which spells
  // one metro as Hyderabad / Secunderabad / R.R.Dist. / Medchal-Malkajgiri.
  it('reads the postal circle, spaces and all', () => {
    expect(stateFromPin('500 003')).toBe('TG');
    expect(stateFromPin('500003')).toBe('TG');
    expect(stateFromPin('560001')).toBe('KA');
    expect(stateFromPin('110001')).toBe('DL');
  });

  it('returns null rather than guessing', () => {
    expect(stateFromPin('')).toBeNull();
    expect(stateFromPin('X')).toBeNull();
  });
});

describe('mapCompanyRow — the junk the real files carry', () => {
  it('rejects a spreadsheet-coerced range, with the reason', () => {
    // 'Nov-50' appeared 34 times where a spreadsheet ate '11-50'.
    const r = mapCompanyRow({ 'COMPANY': 'Acme', 'Company number of employees': 'Nov-50' });
    expect(r.mapped.employees_band).toBeNull();
    expect(r.quality.reject_reasons[0].reason).toContain('coerced to a date');
  });

  it('rejects a populated-but-meaningless literal', () => {
    // 'undefined+' filled 60 of 119 revenue values — 100% "populated".
    const r = mapCompanyRow({ 'COMPANY': 'Acme', 'Company revenue': 'undefined+' });
    expect(r.mapped.revenue_band).toBeNull();
    expect(r.quality.reject_reasons[0].reason).toContain('populated but meaningless');
  });

  it('scores fill rate and validity separately', () => {
    const junk = mapCompanyRow({
      'COMPANY': 'Acme', 'Company revenue': 'undefined+',
      'Company number of employees': 'Nov-50',
    });
    // Both junk fields counted as populated by fill rate would be a lie; they
    // are cleared, and validity carries the damage.
    expect(junk.mapped.revenue_band).toBeNull();
    expect(junk.quality.validity).toBeLessThan(1);
  });
});

describe('mapCompanyRow — the shapes the real files use', () => {
  it('takes a domain from a bare host', () => {
    expect(normalizeDomain('www.acme.com')).toBe('acme.com');
    const r = mapCompanyRow({ 'COMPANY': 'Acme', 'WEB': 'www.acme.com' });
    expect(r.mapped.domain_normalized).toBe('acme.com');
  });

  it('takes the first of a multi-value email and phone cell', () => {
    const r = mapCompanyRow({
      'COMPANY': 'Acme',
      'EMAIL': 'one@acme.com;two@acme.com',
      'PHONES': '040-2323 / 040-4545',
    });
    expect(r.mapped.email).toBe('one@acme.com');
    expect(r.mapped.phone).toBe('040-2323');
  });

  it('derives state from PIN in preference to the free-text state column', () => {
    const r = mapCompanyRow({ 'COMPANY': 'Acme', 'PIN': '500 003', 'Company state': 'Andhra Pradesh' });
    expect(r.mapped.state_code).toBe('TG');
  });

  it('honours a user override of the header mapping', () => {
    const r = mapCompanyRow({ 'Firm': 'Acme Industries' }, { 'Firm': 'name' });
    expect(r.mapped.name).toBe('Acme Industries');
  });
});

describe('dedupKey', () => {
  it('prefers the domain', () => {
    const r = mapCompanyRow({ 'COMPANY': 'Acme Pvt Ltd', 'WEB': 'acme.com', 'PIN': '500003' });
    expect(r.dedup_key).toBe('d:acme.com');
  });

  it('falls back to normalised name + PIN when there is no domain', () => {
    // 54% of FTCCI rows have no WEB value, so the fallback is the common path.
    const r = mapCompanyRow({ 'COMPANY': 'Acme Pvt. Ltd.', 'PIN': '500 003' });
    expect(r.dedup_key).toBe('n:ACME|500003');
  });

  it('trims — the name_key regression', () => {
    const r = mapCompanyRow({ 'COMPANY': 'Automotive Manufacturers ' });
    expect(r.dedup_key).toBe('n:AUTOMOTIVE MANUFACTURERS|');
  });

  it('has no key when there is no name and no domain', () => {
    expect(dedupKey({
      name: '', domain_normalized: null, website: null, email: null, phone: null,
      address_line: null, city: null, state_code: null, pin: null, country: null,
      industry_raw: null, employees_band: null, revenue_band: null,
      linkedin_url: null, year_founded: null, description: null,
    })).toBeNull();
  });
});
