/**
 * VaNi GTM — Company/Prospect Import Pre-processor
 *
 * Phase 1 mapping for company imports, applied before staging. Sibling of
 * customer-processor.ts, same contract: header → key map, then a row mapper
 * that normalises and scores.
 *
 * Two destinations, one pipeline (design-notes-prospect-universe.md §1.1):
 *   admin tenant → gt_universe_companies  (the common pool)
 *   any tenant   → gt_prospects           (their own data)
 *
 * The mapping covers both real shapes profiled for this design:
 *   - a chamber directory (FTCCI): company-first, reps inline, prose industry
 *   - a provider export (Apollo-style): contact-first with firmographics
 *
 * QUALITY IS SCORED HERE, BEFORE ANYTHING LANDS. Fill rate is not quality —
 * the provider CSV read 100% populated on revenue while 60 of 119 values
 * were the literal string 'undefined+', and its employee column held
 * 'Nov-50' 34 times where a spreadsheet coerced '11-50' into a date. Those
 * are reported per row and never stored as if real (CLAUDE.md rule 12).
 */

/** Excel/CSV header → canonical key. Upper-cased on lookup. */
export const COMPANY_FIELD_MAP: Record<string, string> = {
  // ── Company identity ──
  'COMPANY': 'name',
  'COMPANY NAME': 'name',
  'ORGANISATION': 'name',
  'ORGANIZATION': 'name',
  'NAME': 'name',

  'WEB': 'website',
  'WEBSITE': 'website',
  'COMPANY WEBSITE': 'website',
  'COMPANY DOMAIN': 'domain',
  'DOMAIN': 'domain',

  'EMAIL': 'email',
  'COMPANY CONTACT EMAIL': 'email',
  'PHONES': 'phone',
  'PHONE': 'phone',
  'PHONE 1': 'phone',

  // ── Location ──
  'ADDRESS_1': 'address_1',
  'ADDRESS_2': 'address_2',
  'ADDRESS_3': 'city',
  'COMPANY STREET': 'address_1',
  'COMPANY CITY': 'city',
  'COMPANY STATE': 'state',
  'COMPANY COUNTRY': 'country',
  'COUNTRY': 'country',
  'PIN': 'pin',
  'PINCODE': 'pin',

  // ── Firmographics ──
  'BUSINESS': 'industry_raw',
  'COMPANY INDUSTRY': 'industry_raw',
  'INDUSTRY': 'industry_raw',
  'COMPANY NUMBER OF EMPLOYEES': 'employees_band',
  'EMPLOYEES': 'employees_band',
  'COMPANY REVENUE': 'revenue_band',
  'COMPANY YEAR FOUNDED': 'year_founded',
  'COMPANY LINKEDIN URL': 'linkedin_url',
  'COMPANY DESCRIPTION': 'description',
  'COMPANY SPECIALITIES': 'specialities',
};

export interface MappedCompany {
  name: string;
  domain_normalized: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  address_line: string | null;
  city: string | null;
  state_code: string | null;
  pin: string | null;
  country: string | null;
  industry_raw: string | null;
  employees_band: string | null;
  revenue_band: string | null;
  linkedin_url: string | null;
  year_founded: number | null;
  description: string | null;
}

export interface RowQuality {
  completeness: number;
  validity: number;
  reject_reasons: { field: string; reason: string }[];
}

export interface ProcessedCompanyRow {
  mapped: MappedCompany;
  quality: RowQuality;
  dedup_key: string | null;
}

/* ── Normalisers ──────────────────────────────────────────────────────── */

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
};

/** Strip scheme, www and path. FTCCI ships bare hosts ("www.acme.com"). */
export function normalizeDomain(raw: unknown): string | null {
  const s = str(raw);
  if (!s) return null;
  const host = s
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0]
    .trim();
  return host.includes('.') ? host : null;
}

/**
 * Indian PIN → state, on the first two digits (the postal circle).
 * Cheap and far more reliable than the free-text city column, where
 * Hyderabad, Secunderabad, R.R.Dist. and Medchal-Malkajgiri all appear
 * as separate values for the same metro.
 */
const PIN_CIRCLES: [RegExp, string][] = [
  [/^11/, 'DL'], [/^1[23]/, 'HR'], [/^1[456]/, 'PB'], [/^17/, 'HP'], [/^1[89]/, 'JK'],
  [/^2[0-8]/, 'UP'], [/^3[0-4]/, 'RJ'], [/^3[6-9]/, 'GJ'], [/^4[0-4]/, 'MH'],
  [/^4[5-8]/, 'MP'], [/^49/, 'CG'], [/^50/, 'TG'], [/^5[1-3]/, 'AP'],
  [/^5[6-9]/, 'KA'], [/^6[0-4]/, 'TN'], [/^6[789]/, 'KL'], [/^7[0-4]/, 'WB'],
  [/^7[5-7]/, 'OD'], [/^78/, 'AS'], [/^8[0-5]/, 'BR'],
];

export function stateFromPin(raw: unknown): string | null {
  const digits = (str(raw) ?? '').replace(/\D/g, '');
  if (digits.length < 2) return null;
  for (const [re, code] of PIN_CIRCLES) if (re.test(digits)) return code;
  return null;
}

/** Multi-value cells: FTCCI packs emails with ';' and phones with '/' or '\'. */
const firstOf = (raw: unknown, seps: RegExp): string | null => {
  const s = str(raw);
  return s ? (str(s.split(seps)[0]) ?? null) : null;
};

/**
 * A spreadsheet turns "11-50" into a date and exports it as "Nov-50".
 * That is not an employee band, and storing it would poison every range
 * filter built on the column.
 */
const DATE_COERCED = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d+$/i;
/** Export artefacts that look populated but carry no information. */
const NULL_LITERALS = /^(undefined\+?|null|n\/?a|-|—)$/i;

/* ── Mapping ──────────────────────────────────────────────────────────── */

export function mapCompanyRow(raw: Record<string, unknown>): ProcessedCompanyRow {
  const g = (key: string): unknown => {
    for (const [header, mapped] of Object.entries(COMPANY_FIELD_MAP)) {
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

  const rejects: { field: string; reason: string }[] = [];

  const clean = (field: string, v: unknown): string | null => {
    const s = str(v);
    if (!s) return null;
    if (NULL_LITERALS.test(s)) {
      rejects.push({ field, reason: `literal "${s}" — populated but meaningless` });
      return null;
    }
    if (DATE_COERCED.test(s)) {
      rejects.push({ field, reason: `"${s}" — a range coerced to a date by a spreadsheet` });
      return null;
    }
    return s;
  };

  const website = str(g('website'));
  const domain = normalizeDomain(g('domain')) ?? normalizeDomain(website);
  const pin = str(g('pin'));

  const addressParts = [str(g('address_1')), str(g('address_2'))].filter(Boolean);

  const yearRaw = str(g('year_founded'));
  const year = yearRaw && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null;

  const mapped: MappedCompany = {
    name: str(g('name')) ?? '',
    domain_normalized: domain,
    website: website,
    email: firstOf(g('email'), /[;,]/),
    phone: firstOf(g('phone'), /[/\\,;]/),
    address_line: addressParts.length ? addressParts.join(', ') : null,
    city: str(g('city')),
    state_code: stateFromPin(pin) ?? str(g('state')),
    pin,
    country: str(g('country')),
    industry_raw: clean('industry', g('industry_raw')),
    employees_band: clean('employees', g('employees_band')),
    revenue_band: clean('revenue', g('revenue_band')),
    linkedin_url: str(g('linkedin_url')),
    year_founded: year,
    description: str(g('description')),
  };

  // Completeness over the fields that actually drive matching and outreach.
  const tracked: (keyof MappedCompany)[] = [
    'name', 'domain_normalized', 'email', 'phone', 'city',
    'state_code', 'industry_raw', 'employees_band', 'description',
  ];
  const filled = tracked.filter((k) => mapped[k] !== null && mapped[k] !== '').length;
  const completeness = Number((filled / tracked.length).toFixed(3));

  // Validity is measured against what the row TRIED to populate, so a sparse
  // clean row is not punished the way a full dirty one is.
  const attempted = tracked.length;
  const validity = Number(((attempted - rejects.length) / attempted).toFixed(3));

  return {
    mapped,
    quality: { completeness, validity, reject_reasons: rejects },
    dedup_key: dedupKey(mapped),
  };
}

/**
 * Blocking key for dedup. Domain when present, else normalised name + PIN.
 *
 * Domain ALONE is not enough: of 1,590 FTCCI rows carrying a domain only
 * 1,559 are distinct, so 31 share a website with another member — group
 * companies and divisions that must not be collapsed into each other.
 */
export function dedupKey(m: MappedCompany): string | null {
  if (m.domain_normalized) return `d:${m.domain_normalized}`;
  const nameKey = m.name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\b(PVT|PRIVATE|LTD|LIMITED|LLP|INC|CO|COMPANY|THE)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!nameKey) return null;
  return `n:${nameKey}|${(m.pin ?? '').replace(/\D/g, '')}`;
}
