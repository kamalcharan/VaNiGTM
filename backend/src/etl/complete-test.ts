/**
 * The Complete test (POA 2026-10-01 §1.1) — a pure function over one golden
 * record. It decides admission to the core pool: a company is IN the pool
 * only when every check passes (S1: lifecycle_state = 'complete').
 *
 * Each check says pass / fail / pending / review / na and WHY, so a person
 * looking at a record sees what stands between it and the pool, and which of
 * those enrichment (P2–P3) will fill versus which needs a decision:
 *
 *   pass     the requirement is met
 *   fail     a fact disqualifies it as it stands (e.g. a placeholder name)
 *   pending  not known yet — enrichment fills it (industry, type, domain lookup)
 *   review   a person must decide (an unresolved duplicate flag)
 *   na       does not apply (no source gives a legal status)
 *
 * Gaps beyond these eight are allowed; Coverage reflects them, not this test.
 */

export type CheckStatus = 'pass' | 'fail' | 'pending' | 'review' | 'na';

export interface CompleteCheck {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface CompleteResult {
  checks: CompleteCheck[];
  passed: number;          // pass + na
  total: number;
  complete: boolean;       // every check pass or na
  needs_person: boolean;   // any check in review
}

/** The fields of gt_universe_companies the test reads. */
export interface GoldenForTest {
  name: string | null;
  name_key: string | null;
  domain_normalized: string | null;
  domain_status: string | null;          // found · none_found · not_tried
  cin: string | null;
  llpin: string | null;
  gstin: string | null;
  pin: string | null;
  city: string | null;
  state_code: string | null;
  industry_id: number | null;
  nic_codes: string[] | null;
  is_individual: boolean | null;
  legal_status: string | null;
  duplicate_of_id: number | string | null;
  needs_review: boolean;
  linked_sources: number;                // source rows resolved to this record
}

// A name that is not a business name. Conservative on purpose: a false
// "fail" here keeps a real company out of the pool, so only unmistakable
// shapes are caught; the rest is left to a person and to junk reasons.
const PLACEHOLDER = /^(test|testing|test entry|dummy|sample|demo|n\/?a|na|nil|null|none|unknown|xxx+|abc|asdf|[-–—.\s_*#]+)$/i;
const ADDRESS_START = /^(plot|flat|door|h\.?\s?no|house no|shop no|survey no|d\.?\s?no)\b/i;

export function checkName(name: string | null): CompleteCheck {
  const label = 'Clean name';
  const n = (name ?? '').trim();
  if (n.length < 2) return { key: 'name', label, status: 'fail', detail: 'no usable name' };
  if (PLACEHOLDER.test(n)) return { key: 'name', label, status: 'fail', detail: `"${n}" is a placeholder` };
  if (/^[\d\s.,/-]+$/.test(n)) return { key: 'name', label, status: 'fail', detail: `"${n}" is a number, not a name` };
  if (ADDRESS_START.test(n)) return { key: 'name', label, status: 'fail', detail: `"${n}" reads as an address` };
  return { key: 'name', label, status: 'pass', detail: n };
}

export function completeTest(g: GoldenForTest): CompleteResult {
  const checks: CompleteCheck[] = [];

  checks.push(checkName(g.name));

  // 2 — one identity anchor. A delivered domain is not yet a VERIFIED one:
  // verification (liveness) is P2, so it counts only once domain_status says found.
  const anchors: string[] = [];
  if (g.cin) anchors.push(`CIN ${g.cin}`);
  if (g.llpin) anchors.push(`LLPIN ${g.llpin}`);
  if (g.gstin) anchors.push(`GSTIN ${g.gstin}`);
  if (g.domain_normalized && g.domain_status === 'found') anchors.push(`domain ${g.domain_normalized}`);
  if (g.name_key && g.pin) anchors.push(`name + PIN ${g.pin}`);
  checks.push(anchors.length
    ? { key: 'anchor', label: 'Identity anchor', status: 'pass', detail: anchors[0] }
    : g.domain_normalized
      ? { key: 'anchor', label: 'Identity anchor', status: 'pending', detail: `domain ${g.domain_normalized} not verified yet; no CIN/GSTIN or PIN` }
      : { key: 'anchor', label: 'Identity anchor', status: 'pending', detail: 'no domain, CIN/LLPIN/GSTIN or PIN yet' });

  // 3 — a location.
  const where = g.city || g.state_code;
  checks.push(where
    ? { key: 'location', label: 'Location', status: 'pass', detail: [g.city, g.state_code].filter(Boolean).join(', ') }
    : { key: 'location', label: 'Location', status: 'pending', detail: 'no city or state yet' });

  // 4 — an industry: our category or a NIC code. Raw industry text alone is
  // not one; mapping it is enrichment's job.
  const nic = (g.nic_codes ?? []).filter(Boolean);
  checks.push(g.industry_id
    ? { key: 'industry', label: 'Industry', status: 'pass', detail: `category #${g.industry_id}` }
    : nic.length
      ? { key: 'industry', label: 'Industry', status: 'pass', detail: `NIC ${nic.join(', ')}` }
      : { key: 'industry', label: 'Industry', status: 'pending', detail: 'not mapped to the industry master yet' });

  // 5 — a domain lookup attempted: found (delivered or discovered), or
  // recorded as none found.
  checks.push(g.domain_normalized
    ? { key: 'domain_lookup', label: 'Domain lookup attempted', status: 'pass', detail: g.domain_normalized }
    : g.domain_status === 'none_found'
      ? { key: 'domain_lookup', label: 'Domain lookup attempted', status: 'pass', detail: 'looked; none found' }
      : { key: 'domain_lookup', label: 'Domain lookup attempted', status: 'pending', detail: 'not tried yet' });

  // 6 — a match decision: linked to its sources, and not an open duplicate flag.
  checks.push(g.linked_sources < 1
    ? { key: 'match', label: 'Match decided', status: 'pending', detail: 'no source row resolved to it' }
    : g.duplicate_of_id && g.needs_review
      ? { key: 'match', label: 'Match decided', status: 'review', detail: `possible duplicate of company #${g.duplicate_of_id} — a person decides` }
      : { key: 'match', label: 'Match decided', status: 'pass', detail: g.linked_sources === 1 ? 'new' : `linked from ${g.linked_sources} sources` });

  // 7 — a type: company or individual practitioner. An individual does not
  // belong in a companies pool; that is a junk decision, so it fails here.
  checks.push(g.is_individual === null
    ? { key: 'type', label: 'Type: company or individual', status: 'pending', detail: 'not decided yet' }
    : g.is_individual
      ? { key: 'type', label: 'Type: company or individual', status: 'fail', detail: 'an individual practitioner — not a company' }
      : { key: 'type', label: 'Type: company or individual', status: 'pass', detail: 'company' });

  // 8 — legal status where a source gives one.
  checks.push(!g.legal_status
    ? { key: 'legal', label: 'Legal status', status: 'na', detail: 'no source gives one' }
    : g.legal_status === 'struck_off'
      ? { key: 'legal', label: 'Legal status', status: 'fail', detail: 'struck off' }
      : { key: 'legal', label: 'Legal status', status: 'pass', detail: g.legal_status });

  const passed = checks.filter((c) => c.status === 'pass' || c.status === 'na').length;
  return {
    checks,
    passed,
    total: checks.length,
    complete: passed === checks.length,
    needs_person: checks.some((c) => c.status === 'review'),
  };
}
