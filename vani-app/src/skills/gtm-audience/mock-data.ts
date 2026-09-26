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
/**
 * Every target a column can be assigned to, with the label the person reads.
 * The value is a QUALIFIED key — `company.city`, `person.2.full_name` — so the
 * backend needs no knowledge of the file's headers: whatever is picked here is
 * what staging obeys, and a format nobody anticipated still imports.
 */
export const COMPANY_TARGETS: [string, string][] = [
  ['company.name', 'Company name'],
  ['company.source_record_id', "Source's own id (member no, record id)"],
  ['company.website', 'Website'],
  ['company.domain', 'Domain'],
  ['company.email', 'Company email'],
  ['company.phone', 'Company phone'],
  ['company.address_1', 'Address line 1'],
  ['company.address_2', 'Address line 2'],
  ['company.city', 'City'],
  ['company.state', 'State'],
  ['company.pin', 'PIN / postcode'],
  ['company.country', 'Country'],
  ['company.industry_raw', 'Industry'],
  ['company.employees_band', 'Employees'],
  ['company.revenue_band', 'Revenue'],
  ['company.year_founded', 'Year founded'],
  ['company.linkedin_url', 'Company LinkedIn'],
  ['company.description', 'Description'],
];
/** Per person slot (`person.N.<field>`), up to five representatives per row. */
export const PERSON_TARGETS: [string, string][] = [
  ['full_name', 'Name'],
  ['first_name', 'First name'],
  ['last_name', 'Last name'],
  ['job_title', 'Job title'],
  ['email', 'Email'],
  ['mobile', 'Phone / mobile'],
  ['linkedin_url', 'LinkedIn'],
  ['location', 'Location'],
];
export const PERSON_SLOTS = [1, 2, 3, 4, 5] as const;

/**
 * What the TENANT says a file is to them. No file can state it, so it is
 * declared and never inferred; it is orthogonal to the ENTITIES (companies,
 * people) the detector finds in the columns. 'dataset' is the common pool
 * and needs an admin tenant — the server re-checks the JWT.
 */
export type Relationship = 'contacts' | 'customers' | 'dataset';

export interface DetectedEntity {
  kind: 'company' | 'person';
  columns: Record<string, string>;
  reasons: string[];
  per_row: number;
}

/** What the detector found in the file — shown with its reasons, so a person can disagree. */
export interface ExtractionPlan {
  entities: DetectedEntity[];
  unresolved_columns: { header: string; sample: string | null; reason: string }[];
  confidence: 'high' | 'low';
  notes: string[];
}

export interface HeadersInfo {
  file_id: number | string;
  filename: string;
  headers: string[];
  sample_rows: Record<string, unknown>[];
  total_rows: number;
  suggested_mapping: Record<string, string>;
  extraction_plan: ExtractionPlan | null;
  /** Rows per entity kind the plan expects to yield. */
  row_estimates?: Record<string, number>;
}

/** A tag describes a DELIVERY; a platform tag is visible to every tenant. */
export interface ImportTag { id: number; label: string; slug?: string; is_platform: boolean; }

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
  landed?: { companies: number; people: number; channels: number };
}

/** One delivery (gt_source_loads) — prospect-skill.get_loads. */
export interface SourceLoad {
  id: string;
  label: string;
  region: string | null;
  state_code: string | null;
  as_of: string | null;
  row_count: number | null;
  status: 'active' | 'retired' | 'failed' | string;
  loaded_at: string;
  is_pool: boolean;
  source_code: string;
  source_name: string;
  source_kind: 'directory' | 'provider' | 'upload' | string;
  tier: number;
  records: number;
  with_domain: number;
  duplicates: number;
  avg_completeness: string | number | null;
  avg_validity: string | number | null;
  tags: { id: number; label: string; is_platform: boolean }[];
}
export interface LoadList { scope: 'mine' | 'pool'; loads: SourceLoad[]; total: number; detail: string; }

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

/* ── Research: research-skill, REAL shapes ──────────────────────────────
 * Verbatim from the functions the screens now call (get_briefs.sql,
 * batch-status.ts, start-research.ts, account.agent.ts). Offer ids are the
 * tenant's offer_keys; fit is keyed by them. */

export interface Evidence { claim: string; url: string; excerpt: string; }

export type BriefStatus = 'drafted' | 'unreadable' | 'extract_failed' | 'approved' | 'rejected' | 'no_contact' | string;

export interface NamedContact { name?: string | null; title?: string | null; email?: string | null; phone?: string | null; }

/** One row of `research-skill.get_briefs`. */
export interface Brief {
  id: number | string;
  prospect_id: number | string;
  ref: string;
  name: string;
  domain: string | null;
  status: BriefStatus;
  pages_read?: number | null;
  what_they_make: string | null;
  scale_signals?: string | null;
  service_signals?: string | null;
  digital_maturity?: string | null;
  named_contacts: NamedContact[] | null;
  /** offer_key → score 0–1 with the model's reason. Empty when nothing fit or the site was unreadable. */
  fit: Record<string, { score: number; reason: string }> | null;
  recommended_offer: string | null;
  best_fit_offer: string | null;
  human_offer: string | null;
  effective_offer: string | null;
  fit_margin: number | null;
  fit_reason: string | null;
  hook: string | null;
  raw_evidence: Evidence[] | null;
  error: string | null;
  decision_note: string | null;
  decided_at: string | null;
  updated_at: string;
  unevidenced: boolean;
}

/** Postgres counts arrive as strings; read them with Number(). */
export interface BriefStats { total?: number | string; with_offer?: number | string; no_fit?: number | string; unevidenced?: number | string; decided?: number | string; approved?: number | string; declined?: number | string; unreadable?: number | string; extract_failed?: number | string; }

export interface BriefList { briefs: Brief[]; total: number; stats: BriefStats; }

export type BatchVerdict = 'never_run' | 'queued' | 'running' | 'worker_down' | 'failed' | 'completed' | 'unknown';

/** `research-skill.batch_status` verbatim. */
export interface BatchStatus {
  verdict: BatchVerdict;
  message: string;
  healthy: boolean;
  stopped_for_budget?: boolean;
  not_attempted?: number;
  done_count?: number;
  requested?: number | null;
  run_status?: string | null;
  event_status?: string | null;
  event_age_seconds?: number;
  error?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

/** `research-skill.start_research` — the split, reported before anything runs. */
export interface ResearchQueued {
  selected: number; reachable: number; no_website: number; already_researched: number;
  extraction_failed?: number; to_research: number; queued: number; event_id?: string | null;
}

export type Decision = 'approved' | 'rejected' | 'no_contact';

/** `research-skill.get_budget` verbatim — the number the button converts into companies. */
export interface Budget { limit: number | null; used: number; remaining: number | null; capped: boolean; tracked: boolean; cost_per_company: number; affordable_companies: number | null; }

/* ── People: contact-skill, REAL shapes ────────────────────────────────── */

/** One entry of `contact-skill.list_brief_contacts` — a name the brief evidenced, never invented. */
export interface BriefContact {
  named_index: number;
  name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  source_url: string | null;
  has_channel: boolean;
  has_name: boolean;
  addressable: boolean;
  promoted_contact_id: number | null;
}

export interface BriefContacts {
  brief: { id: number; prospect_id: number; status: string; named_count: number };
  entries: BriefContact[];
  empty_reason: string | null;
}

export interface Promoted { contact_id: number; created: boolean; channels_written?: number; confirmed_addressed: boolean; journey_state: string | null; }

/* ── Fixtures (mock mode only) ─────────────────────────────────────────── */

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

/** Offer keys match smart-profile/offers-mock.ts, which answers get_offers in mock mode. */
export const OFFER_AUDIT = 'contract-audit';
export const OFFER_PLATFORM = 'ledgerline-platform';

type BriefFixture = Pick<Brief, 'what_they_make' | 'fit' | 'recommended_offer' | 'best_fit_offer' | 'hook' | 'raw_evidence' | 'named_contacts'> & Partial<Pick<Brief, 'status' | 'error' | 'fit_margin' | 'fit_reason'>>;
const F = (a: number, p: number, hook: string | null, what: string, ev: Evidence[], named: NamedContact[], extra: Partial<BriefFixture> = {}): BriefFixture => {
  const best = a >= p ? OFFER_AUDIT : OFFER_PLATFORM;
  return { what_they_make: what, fit: { [OFFER_AUDIT]: { score: a, reason: 'Contracts live in spreadsheets; an audit is a two-week yes.' }, [OFFER_PLATFORM]: { score: p, reason: 'Platform fit rises with sites and contract count.' } },
    // The smallest sane ask: the audit opens unless nothing fits.
    recommended_offer: Math.max(a, p) >= 0.5 ? OFFER_AUDIT : null, best_fit_offer: Math.max(a, p) >= 0.5 ? best : null, fit_margin: Math.abs(a - p), hook, raw_evidence: ev, named_contacts: named, ...extra };
};

/** Research output per fixture company; identity (name, ref) is joined by the mock from what it knows. */
export const BRIEF_FIXTURES: Record<string, BriefFixture> = {
  sunridge: F(0.82, 0.71, 'Their tender pack asks bidders for AMC visit logs in Excel — the audit starts exactly there.', 'Multispeciality hospital, two campuses, 140+ empanelled vendors.', [
    { claim: 'Runs 140+ vendor contracts across two campuses', url: 'https://sunridge-hospital.example/procurement', excerpt: '…our empanelled vendor base of 140 firms across both campuses…' },
    { claim: 'AMC visits tracked in spreadsheets', url: 'https://sunridge-hospital.example/tenders/2026-biomed', excerpt: '…bidder to submit AMC visit logs in the attached Excel format…' },
    { claim: 'Procurement head in post since March', url: 'https://sunridge-hospital.example/about/leadership', excerpt: '…R. Menon, Head of Procurement (since March 2026)…' }],
    [{ name: 'R. Menon', title: 'Head of Procurement', email: 'r.menon@sunridge-hospital.example', phone: null }, { name: 'A. Deshpande', title: 'CFO', email: null, phone: null }]),
  kaveri: F(0.74, 0.58, 'Three AMC tenders live this quarter and no contracts role on the org chart.', 'Cardiac specialty hospital, single site.', [
    { claim: 'Three AMC tenders live this quarter', url: 'https://kaveri-heart.example/tenders', excerpt: '…annual maintenance contract for cath-lab, echo and monitoring…' },
    { claim: 'No contracts role on the org chart', url: 'https://kaveri-heart.example/about/leadership', excerpt: '(no procurement or contracts title listed)' }], []),
  northfield: F(0.66, 0.77, null, '610-bed tertiary care, single campus, NABH renewed this year.', [
    { claim: 'NABH renewed; contract governance cited', url: 'https://northfield-general.example/news/nabh-2026', excerpt: '…demonstrated vendor contract governance and SLA review…' },
    { claim: '610 beds, single campus', url: 'https://northfield-general.example', excerpt: '…610-bed tertiary care…' }],
    [{ name: 'K. Patel', title: 'Head of Administration', email: 'k.patel@northfield-general.example', phone: '+91 79 4000 0000' }]),
  brigid: F(0.88, 0.80, 'They are hiring a Contracts Officer to stop missed renewals — the audit is that person\'s first month, done in two weeks.', 'Multispeciality hospital, 340 beds.', [
    { claim: 'Hiring a Contracts Officer now', url: 'https://stbrigids.example/careers/contracts-officer', excerpt: '…Contracts Officer — manage renewals, vendor SLAs and AMC schedules…' },
    { claim: 'Renewal leakage named as a problem in the posting', url: 'https://stbrigids.example/careers/contracts-officer', excerpt: '…reduce missed renewals and unenforced penalties…' }],
    [{ name: 'T. Varghese', title: 'Chief Operating Officer', email: 't.varghese@stbrigids.example', phone: null }]),
  meadow: F(0.69, 0.52, 'Their procurement head told the press they lose money every quarter on penalties they never claim.', 'Medical centre, 290 beds.', [
    { claim: 'Head of Procurement quoted on SLA penalties', url: 'https://meadowbrook.example/press/2026-procurement', excerpt: '…we lose money every quarter on penalties we never claim…' }],
    [{ name: 'N. Joshi', title: 'Head of Procurement', email: null, phone: '+91 712 250 0000' }]),
  harbour: F(0.61, 0.84, 'Their own annual report lists auto-renewal on service contracts as a risk.', 'Three-site hospital group with central procurement.', [
    { claim: 'Three sites, group procurement', url: 'https://harbourview.example/group', excerpt: '…centralised procurement for all three hospitals…' },
    { claim: '"Renewal" in the risk section of the annual report', url: 'https://harbourview.example/investors/ar-2026.pdf', excerpt: '…risk of unfavourable auto-renewal on service contracts…' }],
    [{ name: 'S. Rao', title: 'Group Procurement Head', email: 's.rao@harbourview.example', phone: null }, { name: 'P. Naidu', title: 'Director, Biomedical', email: null, phone: null }]),
  cedar: F(0.44, 0.49, null, 'Teaching hospital; procurement administered by the education trust.', [
    { claim: 'Teaching hospital; procurement under the trust', url: 'https://cedarridge.example/trust', excerpt: '…procurement is administered by the Cedar Ridge Education Trust…' }], []),
  ashoka: F(0.38, 0.30, null, "Children's hospital, 180 beds.", [
    { claim: '180 beds; one vocabulary hit on a 2024 page', url: 'https://ashoka-childrens.example/vendors', excerpt: '…vendor compliance form…' }], []),
  trident: F(0.22, 0.18, null, 'Orthopaedic and spine hospital, 120 beds.', [], [], { status: 'unreadable', error: 'CRAWL_EMPTY: trident-ortho.example rendered 0 readable pages (JS-only site)', fit: {}, recommended_offer: null, best_fit_offer: null }),
};

/** Research budget: briefs per day on the platform posture. */
export const BUDGET_TOTAL = 40;
export const BUDGET_PER_BRIEF = 2;

/** One past import — `GET /etl/sessions` verbatim. */
export interface ImportSession {
  id: number | string;
  import_type: string;
  status: 'staged' | 'processing' | 'completed' | 'completed_with_errors' | 'needs_review' | 'failed' | string;
  total_records: number;
  processed_records: number;
  successful_records: number;
  failed_records: number;
  duplicate_records: number;
  orphan_records: number;
  original_filename: string | null;
  created_at: string;
  tenant_seq: number;
  /** Where the company rows went (197) and what the tenant said the file was (200). */
  destination?: 'prospects' | 'universe_companies' | string | null;
  relationship?: Relationship | string | null;
  load_id?: number | string | null;
  staging_completed_at?: string | null;
  processing_started_at?: string | null;
  processing_completed_at?: string | null;
  error_summary?: string | null;
  /** Mock-only bookkeeping — the API keeps these on the load, not the session. */
  load_as_of?: string | null;
  tag_ids?: number[];
}

export interface FieldDiff { [field: string]: { existing: unknown; incoming: unknown; recommended: 'take' | 'keep'; reason?: string } }

/** A staged row — `GET /etl/sessions/:id/records` verbatim. */
export interface StagedRow {
  id: number | string;
  row_number: number;
  processing_status: 'pending' | 'success' | 'failed' | 'duplicate' | 'conflict' | 'orphan' | string;
  /** { company: {...}, people: [...] } for a GTM import — dotted paths, not a flat row. */
  mapped_data: Record<string, unknown>;
  /** The row exactly as the file had it. */
  raw_data?: Record<string, unknown> | null;
  error_messages: string[] | null;
  warnings?: string[] | null;
  created_record_id?: string | null;
  processed_at?: string | null;
  field_diff: FieldDiff | null;
  campaign_locked: boolean;
  conflict_kind: 'existing' | 'in_file' | null;
}
export interface StagedPage { records: StagedRow[]; page: number; limit: number; total: number; total_pages: number; }
