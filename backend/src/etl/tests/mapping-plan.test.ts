/**
 * Explicit column mapping — "there is no guarantee which format will be
 * uploaded; imports should be flexible and should take any data structure."
 *
 * Every case here uses the REAL FTCCI row the user supplied, whose headers no
 * built-in field map knows. Nothing in this file relies on a recognised
 * header: the user's assignment is the whole contract.
 */

import {
  resolveMappings, companyRowFor, personRowForSlot, identityMapping,
  unmappedColumns,
} from '../mapping-plan';
import { mapCompanyRow } from '../company-processor';
import { mapContactRow } from '../contact-processor';

/** The real row, with the header names a chamber directory actually ships. */
const FTCCI_ROW: Record<string, unknown> = {
  'Panel': 'A',
  'Panel No': '3',
  'Name of the Organisation': 'AUTOMOTIVE MANUFACTURERS PVT LTD',
  'Membership No': '8571',
  'Address': 'R.P.Road',
  'City': 'Secunderabad',
  'Pin': '500 003',
  'Phone': '27543701/5454',
  'Fax': '27545486',
  'Email': 'trgaiyer@automotiveml.com; harshmehta@automotiveml.com',
  'Website': 'www.automotiveml.com',
  'Nature of Business': 'Automobile Dealers',
  'Rep Name': 'T.R.Ganesh Aiyer',
  'Rep Designation': 'President',
  'Rep Mobile': '27545454\\27116619',
  'Rep Name 2': 'Harsh B. Mehta',
  'Rep Designation 2': 'Asso. Vice President - Special Assignment',
  'Rep Mobile 2': '9963391962',
  'Rep Name 3': 'K. Lakshmipathi Rao ',
  'Rep Designation 3': 'General Manager-Accounts',
  'Rep Mobile 3': '9618904545',
};

/** What a user would set in the review step. Arbitrary headers, any target. */
const USER_MAPPING: Record<string, string> = {
  'Name of the Organisation': 'company.name',
  'Website': 'company.website',
  'Email': 'company.email',
  'Phone': 'company.phone',
  'Address': 'company.address_1',
  'City': 'company.city',
  'Pin': 'company.pin',
  'Nature of Business': 'company.industry_raw',

  'Rep Name': 'person.1.full_name',
  'Rep Designation': 'person.1.job_title',
  'Rep Mobile': 'person.1.mobile',
  'Rep Name 2': 'person.2.full_name',
  'Rep Designation 2': 'person.2.job_title',
  'Rep Mobile 2': 'person.2.mobile',
  'Rep Name 3': 'person.3.full_name',
  'Rep Designation 3': 'person.3.job_title',
  'Rep Mobile 3': 'person.3.mobile',
};

describe('resolveMappings', () => {
  it('splits the assignment into a company and one map per person slot', () => {
    const r = resolveMappings(USER_MAPPING)!;
    expect(Object.keys(r.company)).toContain('Name of the Organisation');
    expect(r.people).toHaveLength(3);
    expect(r.people[0]['Rep Name']).toBe('full_name');
    expect(r.people[2]['Rep Mobile 3']).toBe('mobile');
  });

  it('returns null when nothing is qualified, so detection still drives', () => {
    expect(resolveMappings({ 'COMPANY': 'name' })).toBeNull();
    expect(resolveMappings(null)).toBeNull();
  });

  it('treats an unqualified value as the company, so older mappings survive', () => {
    const r = resolveMappings({ 'COMPANY': 'name', 'Rep Name': 'person.1.full_name' })!;
    expect(r.company['COMPANY']).toBe('name');
  });

  it('ignores a column the user cleared', () => {
    const r = resolveMappings({ ...USER_MAPPING, 'Fax': '' })!;
    expect(Object.keys(r.company)).not.toContain('Fax');
  });
});

describe('extracting the real row with no recognised headers', () => {
  const plan = resolveMappings(USER_MAPPING)!;

  it('maps the company from headers no built-in map knows', () => {
    const row = companyRowFor(FTCCI_ROW, plan.company);
    const c = mapCompanyRow(row, identityMapping(row));
    expect(c.mapped.name).toBe('AUTOMOTIVE MANUFACTURERS PVT LTD');
    expect(c.mapped.domain_normalized).toBe('automotiveml.com'); // from 'www.…'
    expect(c.mapped.email).toBe('trgaiyer@automotiveml.com');    // first of many
    expect(c.mapped.state_code).toBe('TG');                      // PIN '500 003'
    expect(c.mapped.industry_raw).toBe('Automobile Dealers');
  });

  it('pulls out ALL THREE representatives', () => {
    const people = plan.people.map((slot) => {
      const row = personRowForSlot(FTCCI_ROW, slot, plan.company);
      return mapContactRow(row, identityMapping(row));
    });

    expect(people.map((p) => p.mapped.name)).toEqual([
      'T.R.Ganesh Aiyer', 'Harsh B. Mehta', 'K. Lakshmipathi Rao',
    ]);
    expect(people.map((p) => p.mapped.job_title)).toEqual([
      'President', 'Asso. Vice President - Special Assignment', 'General Manager-Accounts',
    ]);
    // Multi-value cell: '27545454\27116619' keeps only the first number.
    expect(people[0].mapped.mobile).toBe('27545454');
    expect(people[1].mapped.mobile).toBe('9963391962');
  });

  it('gives every representative their employer, so each has a usable key', () => {
    const people = plan.people.map((slot) => {
      const row = personRowForSlot(FTCCI_ROW, slot, plan.company);
      return mapContactRow(row, identityMapping(row));
    });
    for (const p of people) {
      expect(p.mapped.company_domain).toBe('automotiveml.com');
    }
    expect(new Set(people.map((p) => p.dedup_key)).size).toBe(3);
    // Trailing space on 'K. Lakshmipathi Rao ' must not leak into the key.
    expect(people[2].dedup_key).toBe('K LAKSHMIPATHI RAO|automotiveml.com');
  });
});

describe('unmappedColumns — nothing is left out', () => {
  const plan = resolveMappings(USER_MAPPING)!;
  const claimed = [
    ...Object.keys(plan.company),
    ...plan.people.flatMap((s) => Object.keys(s)),
  ];

  it('keeps every column no field claimed', () => {
    const meta = unmappedColumns(FTCCI_ROW, claimed);
    expect(meta).toEqual({
      'Panel': 'A',
      'Panel No': '3',
      'Membership No': '8571',
      'Fax': '27545486',
    });
  });

  it('keeps a blank column too — that it was empty is itself a fact', () => {
    const meta = unmappedColumns({ ...FTCCI_ROW, 'Fax': '' }, claimed);
    expect(meta).toHaveProperty('Fax', '');
  });

  it('accounts for every column: claimed + unmapped = the whole row', () => {
    const meta = unmappedColumns(FTCCI_ROW, claimed);
    expect(claimed.length + Object.keys(meta).length)
      .toBe(Object.keys(FTCCI_ROW).length);
  });
});
