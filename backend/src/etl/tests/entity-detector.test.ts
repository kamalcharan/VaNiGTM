/**
 * Detection is what stands between "the ETL skill identifies it" and a silent
 * wrong guess. The cases below are the two real file shapes profiled for this
 * design plus the ways detection is allowed to fail.
 */

import { detectEntities, deIndexHeader, estimateRows, personBlocks } from '../entity-detector';
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

describe('personBlocks — pulling repeated people out of one row', () => {
  // Detecting that a row carries three people is worth nothing if only the
  // first is extracted. This is where 2,913 rows become ~5,800 contacts.
  const ftcciRow = {
    'COMPANY': 'Acme Industries',
    'WEB': 'acme.com',
    'CONTACT NAME 1': 'Priya Sharma',   'DESIGNATION 1': 'Managing Director',
    'CONTACT NAME 2': 'Ramesh Kumar',   'DESIGNATION 2': 'Director',
    'CONTACT NAME 3': 'Anita Rao',      'DESIGNATION 3': 'Company Secretary',
  };

  it('returns one block per person', () => {
    expect(personBlocks(ftcciRow, 3)).toHaveLength(3);
  });

  it('gives each block only ITS person, stripped of the index', () => {
    const [first, second, third] = personBlocks(ftcciRow, 3);
    expect(first['CONTACT NAME']).toBe('Priya Sharma');
    expect(second['CONTACT NAME']).toBe('Ramesh Kumar');
    expect(third['DESIGNATION']).toBe('Company Secretary');
    expect(first['CONTACT NAME 2']).toBeUndefined();
  });

  it('repeats the shared company columns into every block', () => {
    // Each representative works at that company, so the employer must ride
    // along or the contact lands with no company and a useless dedup key.
    for (const b of personBlocks(ftcciRow, 3)) {
      expect(b['COMPANY']).toBe('Acme Industries');
      expect(b['WEB']).toBe('acme.com');
    }
  });

  it('passes the row through untouched when there is only one person', () => {
    expect(personBlocks({ 'Full Name': 'Solo' }, 1)).toEqual([{ 'Full Name': 'Solo' }]);
  });

  it('maps each block to a distinct contact', () => {
    const people = personBlocks(ftcciRow, 3)
      .map((b) => mapContactRow(b))
      .filter((p) => p.mapped.name);
    expect(people.map((p) => p.mapped.name))
      .toEqual(['Priya Sharma', 'Ramesh Kumar', 'Anita Rao']);
    expect(people.map((p) => p.mapped.job_title))
      .toEqual(['Managing Director', 'Director', 'Company Secretary']);
    // Distinct keys, each carrying the shared employer. The employer arrives
    // as the company NAME here: `WEB` is a company discriminator and is
    // deliberately not in the person map, so the staging step fills the domain
    // in from the company on the row (see etl.routes.ts).
    expect(new Set(people.map((p) => p.dedup_key)).size).toBe(3);
    expect(people.every((p) => p.dedup_key?.endsWith('|ACME INDUSTRIES'))).toBe(true);
  });

  it('drops empty slots rather than importing blank people', () => {
    const sparse = { 'COMPANY': 'Beta', 'CONTACT NAME 1': 'Only One', 'CONTACT NAME 2': '' };
    const people = personBlocks(sparse, 2)
      .map((b) => mapContactRow(b))
      .filter((p) => p.mapped.name);
    expect(people).toHaveLength(1);
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
