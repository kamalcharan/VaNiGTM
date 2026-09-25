/**
 * G1 fixtures — the shapes every audience screen is built against, and the
 * contract the backend meets at integration (see INTEGRATION.md).
 *
 * Synthetic: Ledgerline (contract software for hospitals), fictional
 * hospitals, fictional people, fictional evidence. Same data as
 * documents/gtm-ux-playground.html so the screens can be checked against the
 * approved scenes line by line.
 */

export type RowSource = 'pool' | 'mine';

/**
 * One row of `prospect-skill.get_records` (scope 'mine') — the REAL function,
 * verbatim from its SKILL.md. The hot list is built from this shape; HotRow
 * below is the screen's view of it (`toHotRow`).
 */
export interface RecordRow {
  id: number | string;
  ref: string;
  name: string;
  relationship: string | null;
  domain_normalized: string | null;
  city: string | null;
  state_code: string | null;
  industry_raw: string | null;
  industry_canonical: string | null;
  industry_sub: string | null;
  employees_band: string | null;
  /** 0–1 */
  completeness: number | null;
  /** 0–1 */
  validity: number | null;
  freshness: 'current' | 'recent' | 'ageing' | 'stale' | 'unknown' | null;
  duplicate: boolean;
  is_active: boolean;
  source_label: string | null;
  tags: { id: number; label: string; inherited: boolean }[];
  research_status: string | null;
}

export interface RecordList { records: RecordRow[]; total: number; }

/** What the screen needs, derived from a record — nothing invented. */
export function toHotRow(r: RecordRow): HotRow {
  const pool = (r.source_label ?? '').toLowerCase().startsWith('pool');
  const quality = [
    r.completeness != null ? `completeness ${Math.round(r.completeness * 100)}%` : null,
    r.validity != null ? `validity ${Math.round(r.validity * 100)}%` : null,
    r.freshness && r.freshness !== 'unknown' ? r.freshness : null,
  ].filter(Boolean).join(' · ');
  // employees_band is already a label ('51–200'); shown verbatim, never re-worded.
  const facts = [r.industry_raw, r.employees_band].filter(Boolean).join(' · ');
  return {
    id: String(r.id), ref: r.ref, name: r.name, city: r.city ?? '', size: 0, size_unit: '',
    size_label: r.employees_band ?? '', industry: r.industry_raw ?? '',
    why: [facts, quality].filter(Boolean).join(' — ') || 'No detail on this row beyond its name.',
    source: pool ? 'pool' : 'mine',
    source_label: r.source_label ?? (pool ? 'pool' : 'your list'),
    fresh_days: r.freshness === 'current' ? 30 : r.freshness === 'recent' ? 300 : r.freshness === 'ageing' ? 900 : r.freshness === 'stale' ? 1500 : 0,
    fresh_label: r.freshness ?? 'unknown',
    has_domain: !!r.domain_normalized,
    weak: r.duplicate || (r.completeness != null && r.completeness < 0.4),
    duplicate: r.duplicate,
    research_status: r.research_status,
  };
}

/** Fields the ETL's company processor accepts as mapping targets. */
export const COMPANY_FIELDS = ['name', 'website', 'domain', 'email', 'phone', 'city', 'state', 'country', 'industry_raw', 'employees_band'] as const;

export interface HeadersInfo {
  file_id: number | string;
  filename: string;
  headers: string[];
  sample_rows: Record<string, unknown>[];
  total_rows: number;
  suggested_mapping: Record<string, string>;
  extraction_plan: unknown;
}

export interface LandingResult {
  session_id: number | string;
  status: string;
  processed: number;
  successful: number;
  failed: number;
  duplicate: number;
  conflict: number;
  campaign_locked: number;
  orphans: number;
  duration_ms: number;
}

export interface HotRow {
  id: string;
  /** Tenant-facing id, never a raw PK. */
  ref: string;
  name: string;
  city: string;
  /** Size in the tenant's own unit — beds for hospitals. */
  size: number;
  size_unit: string;
  /** Why this row is here, in one line. Never empty. */
  why: string;
  source: RowSource;
  /** Where exactly: "pool · directory load", "your list · hospitals-q3.xlsx". */
  source_label: string;
  fresh_days: number;
  fresh_label?: string;
  size_label?: string;
  industry?: string;
  has_domain: boolean;
  /** Also on the tenant's own list (merged, not duplicated). */
  also_mine?: boolean;
  /** Below the ICP range or otherwise weak — pre-unticked in Find, with why. */
  weak?: boolean;
  duplicate?: boolean;
  research_status?: string | null;
}

export interface HotList {
  pool_state: 'fed' | 'unfed';
  sources: { id: string; label: string; state: 'connected' | 'not_connected' | 'not_built'; rows: number }[];
  rows: HotRow[];
  /** The tenant's own list, once uploaded. */
  upload: UploadResult | null;
}

export interface UploadResult {
  file: string;
  mapping: { from: string; to: string; note?: string }[];
  rows: number;
  merged: number;
  added: number;
  invalid: number;
}

export interface Offer { id: string; name: string; ask: 'entry' | 'project' | 'retainer'; }

export interface Evidence { claim: string; source: string; excerpt: string; }

export interface Brief {
  prospect_id: string;
  /** The company, carried on the brief so the screen never looks it up. */
  name: string;
  ref: string;
  city: string;
  size_label: string;
  source_label: string;
  /** Answered from fixtures because research is not integrated (lib/preview.ts). */
  preview_placeholder?: boolean;
  fit: Record<string, number>;
  /** The smallest ask among the offers that fit. */
  open_with: string;
  evidence: Evidence[];
  verdict: 'yes' | 'later' | 'no' | null;
}

export interface BatchStatus {
  batch_id: string;
  state: 'running' | 'done';
  budget_used: number;
  budget_total: number;
  lines: { at: string; text: string; done?: boolean }[];
}

export type EnrichHit = 'hit' | 'miss' | 'not_tried';

export interface Person {
  id: string;
  prospect_id: string;
  company_name: string;
  name: string;
  title: string;
  /** Every source tried, in order, with the outcome. Empty when nobody was found. */
  waterfall: { source: string; result: EnrichHit }[];
  email: 'found' | 'not_found' | 'n/a';
  linkedin: boolean;
  /** Set once promoted: the tenant-facing contact id. */
  contact_ref: string | null;
  /** Nothing found — say so; no row to promote. */
  none?: string;
}

export const OFFERS: Offer[] = [
  { id: 'audit', name: 'Contract audit', ask: 'entry' },
  { id: 'platform', name: 'Ledgerline platform', ask: 'project' },
];

export const HOT_ROWS: HotRow[] = [
  { id: 'sunridge', ref: 'PR-0001', name: 'Sunridge Multispeciality Hospital', city: 'Pune', size: 420, size_unit: 'beds', source: 'pool', source_label: 'pool · directory load', fresh_days: 21, has_domain: true, why: '"vendor compliance" and "AMC" appear on their procurement page; 400+ beds' },
  { id: 'kaveri', ref: 'PR-0002', name: 'Kaveri Heart Institute', city: 'Bengaluru', size: 260, size_unit: 'beds', source: 'pool', source_label: 'pool · supplier list', fresh_days: 8, has_domain: true, why: 'Tender notices mention "annual maintenance contract" for 3 device families' },
  { id: 'northfield', ref: 'PR-0003', name: 'Northfield General', city: 'Ahmedabad', size: 610, size_unit: 'beds', source: 'pool', source_label: 'pool · directory load', fresh_days: 34, has_domain: true, why: 'Recent NABH renewal — contract governance is a scored criterion' },
  { id: 'brigid', ref: 'PR-0004', name: "St. Brigid's Hospital", city: 'Kochi', size: 340, size_unit: 'beds', source: 'pool', source_label: 'pool · directory load', fresh_days: 5, has_domain: true, why: 'Job posting for "Contracts Officer" this month — a buyer is being hired' },
  { id: 'ashoka', ref: 'PR-0005', name: "Ashoka Children's Hospital", city: 'Hyderabad', size: 180, size_unit: 'beds', source: 'pool', source_label: 'pool · supplier list', fresh_days: 62, has_domain: true, weak: true, why: 'Below your bed range; kept because vocabulary matched twice' },
  { id: 'meadow', ref: 'PR-0006', name: 'Meadowbrook Medical Centre', city: 'Nagpur', size: 290, size_unit: 'beds', source: 'pool', source_label: 'pool · directory load', fresh_days: 15, has_domain: true, why: 'Procurement head quoted on "vendor SLA penalties" in trade press' },
  { id: 'trident', ref: 'PR-0007', name: 'Trident Ortho & Spine', city: 'Chennai', size: 120, size_unit: 'beds', source: 'pool', source_label: 'pool · directory load', fresh_days: 40, has_domain: true, weak: true, why: 'Below your bed range; one vocabulary hit. Weak.' },
  { id: 'harbour', ref: 'PR-0008', name: 'Harbourview Hospitals', city: 'Visakhapatnam', size: 530, size_unit: 'beds', source: 'pool', source_label: 'pool · supplier list', fresh_days: 11, has_domain: true, why: 'Three-site group; "renewal" appears in their annual report risk section' },
];

/** The tenant's spreadsheet: two rows already in the pool, two new. */
export const UPLOAD_ROWS: (Partial<HotRow> & { id: string; dup?: boolean })[] = [
  { id: 'sunridge', dup: true },
  { id: 'harbour', dup: true },
  { id: 'lotus', ref: 'PR-0009', name: 'Lotus Valley Hospital', city: 'Coimbatore', size: 310, size_unit: 'beds', source: 'mine', source_label: 'your list · hospitals-q3.xlsx', fresh_days: 0, has_domain: false, weak: true, why: 'On your list. No domain in the file — nothing to research until one is found.' },
  { id: 'cedar', ref: 'PR-0010', name: 'Cedar Ridge Medical College', city: 'Mysuru', size: 700, size_unit: 'beds', source: 'mine', source_label: 'your list · hospitals-q3.xlsx', fresh_days: 0, has_domain: true, why: 'On your list. Teaching hospital — larger than your stated range, kept.' },
];

export const UPLOAD_RESULT: UploadResult = {
  file: 'hospitals-q3.xlsx',
  mapping: [
    { from: 'Hospital Name', to: 'name' },
    { from: 'City', to: 'city' },
    { from: 'Website', to: 'domain', note: '1 of 4 rows empty' },
    { from: 'Beds (approx)', to: 'size', note: 'mapped as beds' },
  ],
  rows: 4, merged: 2, added: 2, invalid: 0,
};

/** Research output per fixture company; identity (name, ref, …) is added by the mock from what it knows. */
export const BRIEF_FIXTURES: Record<string, Pick<Brief, 'fit' | 'open_with' | 'evidence'>> = {
  sunridge: { fit: { audit: 82, platform: 71 }, open_with: 'audit', evidence: [
    { claim: 'Runs 140+ vendor contracts across two campuses', source: 'sunridge-hospital.example/procurement', excerpt: '…our empanelled vendor base of 140 firms across both campuses…' },
    { claim: 'AMC visits tracked in spreadsheets', source: 'sunridge-hospital.example/tenders/2026-biomed', excerpt: '…bidder to submit AMC visit logs in the attached Excel format…' },
    { claim: 'Procurement head in post since March', source: 'search · trade press', excerpt: '…appointed Head of Procurement, Sunridge, March 2026…' }] },
  kaveri: { fit: { audit: 74, platform: 58 }, open_with: 'audit', evidence: [
    { claim: 'Three AMC tenders live this quarter', source: 'kaveri-heart.example/tenders', excerpt: '…annual maintenance contract for cath-lab, echo and monitoring…' },
    { claim: 'No contracts role on the org chart', source: 'kaveri-heart.example/about/leadership', excerpt: '(no procurement or contracts title listed)' }] },
  northfield: { fit: { audit: 66, platform: 77 }, open_with: 'audit', evidence: [
    { claim: 'NABH renewed; contract governance cited', source: 'search · accreditation notice', excerpt: '…demonstrated vendor contract governance and SLA review…' },
    { claim: '610 beds, single campus', source: 'northfield-general.example', excerpt: '…610-bed tertiary care…' }] },
  brigid: { fit: { audit: 88, platform: 80 }, open_with: 'audit', evidence: [
    { claim: 'Hiring a Contracts Officer now', source: 'search · job board', excerpt: '…Contracts Officer — manage renewals, vendor SLAs and AMC schedules…' },
    { claim: 'Renewal leakage named as a problem in the posting', source: 'search · job board', excerpt: '…reduce missed renewals and unenforced penalties…' }] },
  meadow: { fit: { audit: 69, platform: 52 }, open_with: 'audit', evidence: [
    { claim: 'Head of Procurement quoted on SLA penalties', source: 'search · trade press', excerpt: '…we lose money every quarter on penalties we never claim…' }] },
  harbour: { fit: { audit: 61, platform: 84 }, open_with: 'audit', evidence: [
    { claim: 'Three sites, group procurement', source: 'harbourview.example/group', excerpt: '…centralised procurement for all three hospitals…' },
    { claim: '"Renewal" in the risk section of the annual report', source: 'harbourview.example/investors/ar-2026.pdf', excerpt: '…risk of unfavourable auto-renewal on service contracts…' }] },
  cedar: { fit: { audit: 44, platform: 49 }, open_with: 'audit', evidence: [
    { claim: 'Teaching hospital; procurement under the trust', source: 'cedarridge.example/trust', excerpt: '…procurement is administered by the Cedar Ridge Education Trust…' }] },
  ashoka: { fit: { audit: 38, platform: 30 }, open_with: 'audit', evidence: [
    { claim: '180 beds; one vocabulary hit on a 2024 page', source: 'ashoka-childrens.example/vendors', excerpt: '…vendor compliance form…' }] },
  trident: { fit: { audit: 22, platform: 18 }, open_with: 'audit', evidence: [
    { claim: '120 beds; nothing on contracts anywhere on the site', source: 'trident-ortho.example', excerpt: '(no evidence found)' }] },
};

const W = (email: 'found' | 'not_found'): Person['waterfall'] => [
  { source: 'upload', result: 'miss' },
  { source: 'pool', result: email === 'found' ? 'hit' : 'miss' },
  { source: 'apollo', result: 'not_tried' },
];

/** People per fixture company; `company_name` is added by the mock. */
export const PEOPLE_FIXTURES: Record<string, Omit<Person, 'contact_ref' | 'company_name'>[]> = {
  sunridge: [
    { id: 'p-sun-1', prospect_id: 'sunridge', name: 'R. Menon', title: 'Head of Procurement', waterfall: W('found'), email: 'found', linkedin: true },
    { id: 'p-sun-2', prospect_id: 'sunridge', name: 'A. Deshpande', title: 'CFO', waterfall: W('not_found'), email: 'not_found', linkedin: true }],
  brigid: [
    { id: 'p-bri-1', prospect_id: 'brigid', name: 'T. Varghese', title: 'Chief Operating Officer', waterfall: W('found'), email: 'found', linkedin: true },
    { id: 'p-bri-2', prospect_id: 'brigid', name: '(open role)', title: 'Contracts Officer — being hired', waterfall: [], email: 'n/a', linkedin: false, none: 'The buyer is being hired. Nobody to promote yet — say so, do not fake a spinner over it.' }],
  harbour: [
    { id: 'p-har-1', prospect_id: 'harbour', name: 'S. Rao', title: 'Group Procurement Head', waterfall: W('found'), email: 'found', linkedin: true },
    { id: 'p-har-2', prospect_id: 'harbour', name: 'P. Naidu', title: 'Director, Biomedical', waterfall: W('not_found'), email: 'not_found', linkedin: true }],
  northfield: [
    { id: 'p-nor-1', prospect_id: 'northfield', name: 'K. Patel', title: 'Head of Administration', waterfall: W('found'), email: 'found', linkedin: false }],
  kaveri: [
    { id: 'p-kav-0', prospect_id: 'kaveri', name: '(none found)', title: 'no procurement title on the leadership page', waterfall: [], email: 'n/a', linkedin: false, none: 'No procurement or contracts title anywhere on their leadership page. Nobody found.' }],
  meadow: [
    { id: 'p-mea-1', prospect_id: 'meadow', name: 'N. Joshi', title: 'Head of Procurement', waterfall: W('found'), email: 'found', linkedin: true }],
  cedar: [
    { id: 'p-ced-0', prospect_id: 'cedar', name: 'Trust office', title: 'procurement via the trust — no named buyer', waterfall: [], email: 'n/a', linkedin: false, none: 'Procurement is administered by the trust; no named buyer on any page read.' }],
};

/** Research budget: briefs per day on the platform posture. */
export const BUDGET_TOTAL = 40;
export const BUDGET_PER_BRIEF = 2;
