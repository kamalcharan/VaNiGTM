/**
 * VaNi GTM — Contact/Person Import Pre-processor
 *
 * Sibling of company-processor.ts. Same contract: header → key map, then a
 * row mapper that normalises, scores and produces a blocking key.
 *
 * People land in gt_contacts (tenant-scoped, always). Phase A ships no
 * shared contact pool, so a person never reaches the common pool and the
 * DPDP/GDPR question stays deferred rather than answered under pressure
 * (design note §4.5, §8 decision 3).
 *
 * ── WHY A FILE IS NOT SIMPLY "PEOPLE" OR "COMPANIES" ──────────────────
 *
 * Both real files profiled for this design carry both entities:
 *   FTCCI    — company-first, 3 representatives inline per row
 *              (2,913 companies, ~5,800 people)
 *   provider — contact-first with firmographics attached
 *              (119 people across 95 companies)
 *
 * So the same header can belong to either entity depending on the file:
 * in FTCCI, `EMAIL` is the company's; in the provider export it is the
 * person's. That ambiguity is NOT resolved here — it is resolved by
 * entity-detector.ts across the whole header set, and confirmed by a human.
 * This module only states which headers are person-shaped.
 */

import {
  str,
  firstOf,
  cleanValue,
  normalizeDomain,
  normalizePersonName,
  normalizeCompanyName,
  scoreQuality,
  type RejectReason,
} from './field-normalizers';

/**
 * Excel/CSV header → canonical key. Upper-cased on lookup.
 *
 * ⚠️ Headers marked AMBIGUOUS also appear in COMPANY_FIELD_MAP. They are
 * listed in both deliberately; entity-detector.ts decides which entity owns
 * them per file, and never silently.
 */
export const CONTACT_FIELD_MAP: Record<string, string> = {
  // ── Person identity ──
  'FIRST NAME': 'first_name',
  'FIRSTNAME': 'first_name',
  'FIRST_NAME': 'first_name',
  'LAST NAME': 'last_name',
  'LASTNAME': 'last_name',
  'LAST_NAME': 'last_name',
  'FULL NAME': 'full_name',
  'CONTACT NAME': 'full_name',
  'PERSON NAME': 'full_name',
  'NAME': 'full_name',                       // AMBIGUOUS
  'TITLE': 'prefix',
  'SALUTATION': 'prefix',

  'JOB TITLE': 'job_title',
  'DESIGNATION': 'job_title',
  'POSITION': 'job_title',
  'ROLE': 'job_title',

  // ── Channels ──
  'EMAIL': 'email',                          // AMBIGUOUS
  'WORK EMAIL': 'email',
  'EMAIL ADDRESS': 'email',
  'PERSONAL EMAIL': 'email',
  'MOBILE': 'mobile',
  'MOBILE NO': 'mobile',
  'MOBILE NUMBER': 'mobile',
  'PHONE': 'mobile',                         // AMBIGUOUS
  'DIRECT PHONE': 'mobile',
  'PERSON LINKEDIN URL': 'linkedin_url',
  'LINKEDIN': 'linkedin_url',
  'LINKEDIN URL': 'linkedin_url',

  // ── Employer (denormalised onto the contact — gt_contacts carries these) ──
  'COMPANY': 'company_name',                 // AMBIGUOUS
  'COMPANY NAME': 'company_name',            // AMBIGUOUS
  'EMPLOYER': 'company_name',
  'ORGANISATION': 'company_name',            // AMBIGUOUS
  'ORGANIZATION': 'company_name',            // AMBIGUOUS
  'COMPANY DOMAIN': 'company_domain',        // AMBIGUOUS
  'DOMAIN': 'company_domain',                // AMBIGUOUS

  // ── Location ──
  'CITY': 'city',                            // AMBIGUOUS
  'STATE': 'state',                          // AMBIGUOUS
  'COUNTRY': 'country',                      // AMBIGUOUS
  'LOCATION': 'location',
};

// Which of these headers discriminate a person from a company is DERIVED by
// entity-detector.ts from the overlap between this map and COMPANY_FIELD_MAP,
// not hand-listed here — a hand-list goes stale the first time someone adds a
// header to one map and forgets the other.

export interface MappedContact {
  prefix: string | null;
  name: string;
  job_title: string | null;
  company_name: string | null;
  company_domain: string | null;
  linkedin_url: string | null;
  location: string | null;
  email: string | null;
  mobile: string | null;
}

export interface ProcessedContactRow {
  mapped: MappedContact;
  quality: { completeness: number; validity: number; reject_reasons: RejectReason[] };
  dedup_key: string | null;
}

/**
 * Map one raw row to a contact.
 *
 * `mappings` is the user's confirmed header → key map from the review step.
 * It OVERRIDES the defaults — if a human re-points a column, that decision
 * must survive into staging. (mapCompanyRow originally ignored its mapping
 * argument; that is a rule-12 problem, not a shortcut.)
 */
export function mapContactRow(
  raw: Record<string, unknown>,
  mappings?: Record<string, string>,
): ProcessedContactRow {
  const effective: Record<string, string> = { ...CONTACT_FIELD_MAP };
  if (mappings) {
    for (const [header, key] of Object.entries(mappings)) {
      effective[header.trim().toUpperCase()] = key;
    }
  }

  const g = (key: string): unknown => {
    for (const [header, mapped] of Object.entries(effective)) {
      if (mapped !== key) continue;
      for (const k of Object.keys(raw)) {
        if (k.trim().toUpperCase() === header) {
          const v = raw[k];
          if (v !== null && v !== undefined && String(v).trim() !== '') return v;
        }
      }
    }
    return null;
  };

  const rejects: RejectReason[] = [];

  // A person's name arrives whole or in halves, never reliably both.
  const full = cleanValue('name', g('full_name'), rejects);
  const first = cleanValue('first_name', g('first_name'), rejects);
  const last = cleanValue('last_name', g('last_name'), rejects);
  const name = full ?? [first, last].filter(Boolean).join(' ').trim();

  // A person's location arrives as one field or as city/state/country parts.
  const composedLocation =
    [str(g('city')), str(g('state')), str(g('country'))].filter(Boolean).join(', ') || null;

  const mapped: MappedContact = {
    prefix: str(g('prefix')),
    name,
    job_title: cleanValue('job_title', g('job_title'), rejects),
    company_name: cleanValue('company_name', g('company_name'), rejects),
    company_domain:
      normalizeDomain(g('company_domain')) ?? normalizeDomain(g('company_website')),
    linkedin_url: str(g('linkedin_url')),
    location: str(g('location')) ?? composedLocation,
    email: firstOf(cleanValue('email', g('email'), rejects), /[;,]/),
    mobile: firstOf(cleanValue('mobile', g('mobile'), rejects), /[/\\,;]/),
  };

  const tracked: (keyof MappedContact)[] = [
    'name', 'job_title', 'company_name', 'company_domain',
    'email', 'mobile', 'linkedin_url',
  ];

  return {
    mapped,
    quality: scoreQuality(mapped, tracked, rejects),
    dedup_key: personDedupKey(mapped),
  };
}

/**
 * Blocking key for person dedup. MUST match gt_contacts.person_key
 * (migration 198): normalised name | employer domain, else normalised
 * company name.
 *
 * Email is the stronger identifier but cannot be the blocking key — it lives
 * in gt_contact_channels, one row per channel, so it is not reachable from a
 * generated column on gt_contacts. Email matching therefore runs as a second
 * pass INSIDE the block. Blocking on name alone would put every
 * "Ramesh Kumar" in the country in one bucket; pairing it with the employer
 * keeps the block small enough to resolve.
 */
export function personDedupKey(m: MappedContact): string | null {
  const nameKey = normalizePersonName(m.name);
  if (!nameKey) return null;

  const employer =
    (m.company_domain ? m.company_domain.toLowerCase().trim() : '') ||
    normalizeCompanyName(m.company_name) ||
    '';

  return `${nameKey}|${employer}`;
}
