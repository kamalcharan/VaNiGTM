/**
 * VaNi GTM — Explicit column mapping
 *
 * User ruling (2026-07-28): *"there is no guarantee which format will be
 * uploaded — imports should be flexible and should take any data structure."*
 *
 * Field maps that recognise known headers only ever work on files someone
 * anticipated. Every real directory has its own column names, and FTCCI's
 * representative columns are the proof: three people per row that no built-in
 * map could name, so they were reported as "unresolved" and dropped.
 *
 * So detection stops being a gate and becomes a SUGGESTION. The human assigns
 * any column to any field, and that assignment is what staging obeys.
 *
 * ── THE QUALIFIED KEY ─────────────────────────────────────────────────
 *
 * A mapping value says which ENTITY owns the column, not just which field:
 *
 *   "COMPANY NAME"      -> "company.name"
 *   "WEB"               -> "company.website"
 *   "T.R.Ganesh Aiyer"  -> "person.1.full_name"
 *   "President"         -> "person.1.job_title"
 *   "Harsh B. Mehta"    -> "person.2.full_name"
 *
 * A file with fifteen people per row needs no code change — only fifteen
 * slots. Unqualified values ("name") stay legal and mean the company, so
 * anything mapped before this existed keeps working.
 *
 * A column mapped to nothing is IGNORED for field extraction but still kept:
 * the whole source row is stored on the landed record regardless, so an
 * unmapped membership number or fax is never lost.
 */

export interface ResolvedMapping {
  /** header -> company field */
  company: Record<string, string>;
  /** One entry per person slot, in order. people[0] is "person.1". */
  people: Record<string, string>[];
}

const QUALIFIED = /^(company|person)(?:\.(\d{1,2}))?\.(.+)$/i;

/**
 * Turn the review step's header -> value map into per-entity maps.
 *
 * Returns null when nothing is qualified — that is a caller from before this
 * existed, or a file the user did not touch, and detection should drive.
 */
export function resolveMappings(
  mappings: Record<string, string> | null | undefined,
): ResolvedMapping | null {
  if (!mappings) return null;

  const company: Record<string, string> = {};
  const bySlot = new Map<number, Record<string, string>>();
  let sawQualified = false;

  for (const [header, value] of Object.entries(mappings)) {
    if (!value) continue;                       // explicitly ignored
    const m = String(value).match(QUALIFIED);
    if (!m) continue;                           // unqualified — handled below

    sawQualified = true;
    const [, entity, slotRaw, field] = m;

    if (entity.toLowerCase() === 'company') {
      company[header] = field;
    } else {
      // person.full_name with no number means the first (and only) person.
      const slot = slotRaw ? Number(slotRaw) : 1;
      if (!bySlot.has(slot)) bySlot.set(slot, {});
      bySlot.get(slot)![header] = field;
    }
  }

  if (!sawQualified) return null;

  // Unqualified entries are legacy and mean the company.
  for (const [header, value] of Object.entries(mappings)) {
    if (!value || QUALIFIED.test(String(value))) continue;
    if (!(header in company)) company[header] = String(value);
  }

  const people = [...bySlot.keys()]
    .sort((a, b) => a - b)
    .map((slot) => bySlot.get(slot)!);

  return { company, people };
}

/**
 * The sub-row for one person slot.
 *
 * Only the columns that slot owns, renamed to their target field so the
 * contact mapper reads them directly, plus every column the COMPANY owns —
 * each representative works at that company, and without it the person lands
 * with no employer and a weak dedup key.
 */
export function personRowForSlot(
  raw: Record<string, unknown>,
  slotMapping: Record<string, string>,
  companyMapping: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [header, field] of Object.entries(slotMapping)) {
    const value = findValue(raw, header);
    if (value !== undefined) out[field] = value;
  }

  // The employer, under the names the contact mapper looks for.
  for (const [header, field] of Object.entries(companyMapping)) {
    if (field === 'name' && out.company_name === undefined) {
      const v = findValue(raw, header);
      if (v !== undefined) out.company_name = v;
    }
    if ((field === 'domain' || field === 'website') && out.company_domain === undefined) {
      const v = findValue(raw, header);
      if (v !== undefined) out.company_domain = v;
    }
  }

  return out;
}

/** The company sub-row: only its columns, renamed to their target fields. */
export function companyRowFor(
  raw: Record<string, unknown>,
  companyMapping: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [header, field] of Object.entries(companyMapping)) {
    const value = findValue(raw, header);
    if (value !== undefined) out[field] = value;
  }
  return out;
}

/**
 * The columns nothing claimed.
 *
 * User ruling (2026-07-28): *"unmapped data are still valid, can be stored as
 * metadata for any future use."* A chamber directory's membership number,
 * panel code and fax are not noise — nobody has a use for them today, and
 * discarding them makes that permanent. They are carried through staging as
 * `metadata` and land with the record.
 *
 * NOTHING IS LEFT OUT. Blanks are kept too — "this column was empty for this
 * row" is itself a fact about the source, and deciding it is worthless is the
 * same judgement call that lost the representatives. The complete verbatim row
 * is stored separately on the record as `raw`; this is the unclaimed subset of
 * it, for convenience.
 */
export function unmappedColumns(
  raw: Record<string, unknown>,
  claimedHeaders: Iterable<string>,
): Record<string, unknown> {
  const claimed = new Set<string>();
  for (const h of claimedHeaders) claimed.add(h.trim().toUpperCase());

  const out: Record<string, unknown> = {};
  for (const [header, value] of Object.entries(raw)) {
    if (claimed.has(header.trim().toUpperCase())) continue;
    out[header] = value;
  }
  return out;
}

/**
 * companyRowFor / personRowForSlot return rows already keyed by target field.
 * The processors expect a header -> field map, so hand them one that maps each
 * key to itself — the renaming has already happened.
 */
export function identityMapping(row: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.keys(row).map((k) => [k, k]));
}

/** Header lookup that survives whitespace and case differences. */
function findValue(raw: Record<string, unknown>, header: string): unknown {
  if (header in raw) return raw[header];
  const want = header.trim().toUpperCase();
  for (const k of Object.keys(raw)) {
    if (k.trim().toUpperCase() === want) return raw[k];
  }
  return undefined;
}
