/**
 * Detection is what stands between "the ETL skill identifies it" and a silent
 * wrong guess. The cases below are the two real file shapes profiled for this
 * design plus the ways detection is allowed to fail.
 */

import { detectEntities, deIndexHeader, estimateRows } from '../entity-detector';
import { mapContactRow, personDedupKey } from '../contact-processor';

/** FTCCI: company-first, reps inline. */
const FTCCI_HEADERS = [
  'PANEL', 'Panel No', 'COMPANY', 'BUSINESS', 'WEB', 'EMAIL', 'PHONES',
  'ADDRESS_1', 'ADDRESS_2', 'ADDRESS_3', 'PIN',
];

/** Provider export: contact-first with firmographics attached. */
const PROVIDER_HEADERS = [
  'First Name', 'Last Name', 'Title', 'Email', 'Person Linkedin Url',
  'Company Name', 'Company Website', 'Company Industry',
  'Company Number of Employees', 'Company Revenue', 'Company City',
];

describe('detectEntities — company-first file', () => {
  const plan = detectEntities(FTCCI_HEADERS, [{ COMPANY: 'Acme Ltd', WEB: 'www.acme.com' }]);

  it('finds companies', () => {
    expect(plan.entities.map((e) => e.kind)).toContain('company');
  });

  it('does not invent people from generic columns alone', () => {
    // EMAIL and PHONES are generic; with no person-only column present they
    // must not be read as a person entity.
    expect(plan.entities.map((e) => e.kind)).not.toContain('person');
  });

  it('assigns the generic columns to the only entity present', () => {
    const company = plan.entities.find((e) => e.kind === 'company')!;
    expect(company.columns['EMAIL']).toBe('email');
    expect(company.columns['COMPANY']).toBe('name');
  });

  it('surfaces columns it cannot map instead of dropping them', () => {
    const unresolvedHeaders = plan.unresolved_columns.map((u) => u.header);
    expect(unresolvedHeaders).toContain('PANEL');
    expect(plan.confidence).toBe('low'); // unresolved columns must lower it
  });
});

describe('detectEntities — contact-first file', () => {
  const plan = detectEntities(PROVIDER_HEADERS, [{ 'First Name': 'Priya' }]);

  it('finds BOTH people and companies from one file', () => {
    const kinds = plan.entities.map((e) => e.kind).sort();
    expect(kinds).toEqual(['company', 'person']);
  });

  it('gives the COMPANY-prefixed columns to the company', () => {
    const company = plan.entities.find((e) => e.kind === 'company')!;
    expect(company.columns['Company Website']).toBe('website');
    expect(company.columns['Company Industry']).toBe('industry_raw');
  });

  it('gives the person the unprefixed columns', () => {
    const person = plan.entities.find((e) => e.kind === 'person')!;
    expect(person.columns['First Name']).toBe('first_name');
    expect(person.columns['Title']).toBe('prefix');
    expect(person.columns['Email']).toBe('email');
  });

  it('explains itself — reasons are shown to the user', () => {
    for (const e of plan.entities) expect(e.reasons.join(' ')).not.toHaveLength(0);
  });
});

describe('detectEntities — nothing recognisable', () => {
  const plan = detectEntities(['col_a', 'col_b'], [{ col_a: '1' }]);

  it('produces no entities and says so, rather than guessing', () => {
    expect(plan.entities).toHaveLength(0);
    expect(plan.confidence).toBe('low');
    expect(plan.notes.join(' ')).toContain('Nothing will be imported');
  });

  it('returns every column for a human to map', () => {
    expect(plan.unresolved_columns).toHaveLength(2);
  });
});

describe('repeated inline person blocks', () => {
  it('strips a positional index in the shapes files actually use', () => {
    expect(deIndexHeader('CONTACT NAME 1')).toEqual({ base: 'CONTACT NAME', index: 1 });
    expect(deIndexHeader('REP_2_EMAIL')).toEqual({ base: 'REP EMAIL', index: 2 });
    expect(deIndexHeader('COMPANY')).toBeNull();
  });

  // The trap: FTCCI's ADDRESS_1/2/3 are three address lines of ONE company.
  // They are in COMPANY_FIELD_MAP verbatim, so they must resolve literally
  // and never be read as three people.
  it('does not read repeated ADDRESS lines as repeated people', () => {
    const plan = detectEntities(FTCCI_HEADERS);
    expect(plan.entities.map((e) => e.kind)).not.toContain('person');
    const company = plan.entities.find((e) => e.kind === 'company')!;
    expect(company.columns['ADDRESS_1']).toBe('address_1');
    expect(company.columns['ADDRESS_3']).toBe('city');
    expect(company.per_row).toBe(1);
  });

  it('turns rows into an honest person count when a block does repeat', () => {
    const plan = detectEntities([
      'COMPANY', 'WEB', 'BUSINESS',
      'CONTACT NAME 1', 'DESIGNATION 1',
      'CONTACT NAME 2', 'DESIGNATION 2',
      'CONTACT NAME 3', 'DESIGNATION 3',
    ]);
    const person = plan.entities.find((e) => e.kind === 'person')!;
    expect(person.per_row).toBe(3);

    const est = estimateRows(plan, 2913);
    expect(est.company).toBe(2913);
    expect(est.person).toBe(8739); // 2,913 rows x 3 reps — not the row count
  });

  it('says so in the reasons, so the count is not a surprise', () => {
    const plan = detectEntities([
      'COMPANY', 'WEB', 'CONTACT NAME 1', 'CONTACT NAME 2',
    ]);
    const person = plan.entities.find((e) => e.kind === 'person')!;
    expect(person.reasons.join(' ')).toContain('up to 2 people');
  });
});

describe('mapContactRow', () => {
  it('assembles a name from halves and keys on name + employer', () => {
    const r = mapContactRow({
      'First Name': 'priya', 'Last Name': 'sharma',
      'Job Title': 'Head of Ops', 'Company Domain': 'WWW.Acme.com/',
      'Email': 'p@acme.com; alt@acme.com',
    });
    expect(r.mapped.name).toBe('priya sharma');
    expect(r.mapped.company_domain).toBe('acme.com');
    expect(r.mapped.email).toBe('p@acme.com');
    expect(r.dedup_key).toBe('PRIYA SHARMA|acme.com');
  });

  it('falls back to the company name when there is no domain', () => {
    expect(personDedupKey({
      prefix: null, name: 'Ramesh Kumar', job_title: null,
      company_name: 'Beta Pvt Ltd', company_domain: null,
      linkedin_url: null, location: null, email: null, mobile: null,
    })).toBe('RAMESH KUMAR|BETA');
  });

  it('honours a user override of the header mapping', () => {
    // The review step re-points a column; that decision must survive.
    const r = mapContactRow({ 'Contact Person': 'Anita Rao' }, { 'Contact Person': 'full_name' });
    expect(r.mapped.name).toBe('Anita Rao');
  });

  it('has no key when there is no name', () => {
    expect(mapContactRow({ 'Email': 'x@y.com' }).dedup_key).toBeNull();
  });

  it('reports junk instead of storing it', () => {
    const r = mapContactRow({ 'Full Name': 'Priya Sharma', 'Job Title': 'undefined+' });
    expect(r.mapped.job_title).toBeNull();
    expect(r.quality.reject_reasons).toHaveLength(1);
    expect(r.quality.validity).toBeLessThan(1);
  });
});
