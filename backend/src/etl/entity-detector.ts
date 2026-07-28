/**
 * VaNi GTM — Import Entity Detector
 *
 * User ruling (2026-07-28): "contacts might be people or companies - we cant
 * seperate right now, let ETL skill identify it, user can give his own inputs
 * if required."
 *
 * So the import has two orthogonal axes:
 *   the tenant declares the RELATIONSHIP  (contacts | customers | dataset)
 *   the detector finds the ENTITIES       (company, person, or both)
 *
 * ── ONE FILE COMMONLY YIELDS BOTH ─────────────────────────────────────
 *
 * This is not an edge case, it is both real files profiled for this design:
 *   FTCCI    — company-first with 3 representatives inline per row:
 *              2,913 companies AND ~5,800 people
 *   provider — contact-first with firmographics attached:
 *              119 people across 95 companies
 *
 * So detection does not classify the FILE. It groups the COLUMNS — these
 * describe a company, these describe a person at it — and a single upload
 * can produce both.
 *
 * ── DETERMINISTIC, NOT LLM ────────────────────────────────────────────
 *
 * Detection runs entirely on header matching. No LLM call: the VPS endpoint
 * currently exceeds four minutes per call, and every upload would inherit
 * that latency for a job that string matching does correctly. Columns that
 * cannot be resolved are RETURNED as unresolved, never guessed — the review
 * step shows them and the human maps them (CLAUDE.md rule 12). That human
 * override is also the "user can give his own inputs" half of the ruling.
 */

import { COMPANY_FIELD_MAP } from './company-processor';
import { CONTACT_FIELD_MAP } from './contact-processor';

export type EntityKind = 'company' | 'person';

export interface DetectedEntity {
  kind: EntityKind;
  /** header → canonical field, for the fields this entity owns. */
  columns: Record<string, string>;
  /** Why the detector believes this entity is present. Shown to the user. */
  reasons: string[];
  /** People per source row: >1 when a file repeats a person block inline. */
  per_row: number;
}

export interface UnresolvedColumn {
  header: string;
  sample: string | null;
  reason: string;
}

export interface ExtractionPlan {
  entities: DetectedEntity[];
  unresolved_columns: UnresolvedColumn[];
  /** 'high' when at least one entity is backed by discriminating headers. */
  confidence: 'high' | 'low';
  /** Set once a human confirms or edits the plan. */
  confirmed_by?: string;
  notes: string[];
}

/**
 * Headers that describe either entity equally well and therefore prove
 * nothing on their own. In FTCCI `EMAIL` is the company's; in the provider
 * export it is the person's. Listing them explicitly matters: without this,
 * a plain `CITY` would be read as person-only simply because the company map
 * happens to spell it `COMPANY CITY`.
 */
const GENERIC_HEADERS = new Set([
  'NAME', 'EMAIL', 'PHONE', 'PHONES', 'MOBILE', 'COMPANY', 'COMPANY NAME',
  'ORGANISATION', 'ORGANIZATION', 'DOMAIN', 'CITY', 'STATE', 'COUNTRY',
  'LOCATION', 'ADDRESS', 'ADDRESS_1', 'ADDRESS_2', 'ADDRESS_3', 'PIN',
  'PINCODE', 'LINKEDIN', 'LINKEDIN URL', 'TITLE',
]);

const norm = (h: string): string => h.trim().toUpperCase().replace(/\s+/g, ' ');

/**
 * A header is a DISCRIMINATOR for an entity when it appears in that entity's
 * map, not in the other's, and is not generic. Derived from the maps rather
 * than hand-listed, so adding a header to a map cannot leave a stale list
 * behind.
 */
function discriminators(
  own: Record<string, string>,
  other: Record<string, string>,
): Set<string> {
  const otherKeys = new Set(Object.keys(other).map(norm));
  return new Set(
    Object.keys(own)
      .map(norm)
      .filter((h) => !otherKeys.has(h) && !GENERIC_HEADERS.has(h)),
  );
}

const COMPANY_DISCRIMINATORS = discriminators(COMPANY_FIELD_MAP, CONTACT_FIELD_MAP);
const PERSON_DISCRIMINATORS = discriminators(CONTACT_FIELD_MAP, COMPANY_FIELD_MAP);

/**
 * Strip a positional index out of a header: `CONTACT NAME 1` -> `CONTACT NAME`,
 * `REP_2_EMAIL` -> `REP EMAIL`.
 *
 * Used ONLY as a fallback, after the header has failed to match in its literal
 * form. That ordering matters: FTCCI's `ADDRESS_1 / ADDRESS_2 / ADDRESS_3` are
 * three address lines of ONE company, and they are in COMPANY_FIELD_MAP
 * verbatim — so they resolve directly and are never mistaken for a repeated
 * person block.
 */
export function deIndexHeader(header: string): { base: string; index: number } | null {
  // Underscores are word characters, so `\b` never fires inside `REP_2_EMAIL`.
  // Flatten the separators before matching.
  const flat = norm(header).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const m = flat.match(/^(.*?)\s?\b(\d{1,2})\b\s?(.*)$/);
  if (!m) return null;
  const base = `${m[1]} ${m[3]}`.replace(/\s+/g, ' ').trim();
  if (!base) return null;
  return { base, index: Number(m[2]) };
}

/**
 * Build the extraction plan for a file.
 *
 * @param headers  Column headers as they appear in the file.
 * @param sampleRows First few parsed rows, used only to show the user a
 *                   sample value beside an unresolved column.
 */
export function detectEntities(
  headers: string[],
  sampleRows: Record<string, unknown>[] = [],
): ExtractionPlan {
  const companyMap = new Map(Object.entries(COMPANY_FIELD_MAP).map(([h, f]) => [norm(h), f]));
  const contactMap = new Map(Object.entries(CONTACT_FIELD_MAP).map(([h, f]) => [norm(h), f]));

  // A header is looked up literally first. Only if that fails is the indexed
  // form tried, so a repeated block (`CONTACT NAME 1..3`) resolves while a
  // literal indexed header (`ADDRESS_1`) keeps its own meaning.
  const present = headers.map((h) => {
    const key = norm(h);
    if (companyMap.has(key) || contactMap.has(key)) return { raw: h, key, index: 1 };
    const deIndexed = deIndexHeader(h);
    if (deIndexed && (companyMap.has(deIndexed.base) || contactMap.has(deIndexed.base))) {
      return { raw: h, key: deIndexed.base, index: deIndexed.index };
    }
    return { raw: h, key, index: 1 };
  });

  const companyHits = present.filter((h) => COMPANY_DISCRIMINATORS.has(h.key));
  const personHits = present.filter((h) => PERSON_DISCRIMINATORS.has(h.key));

  const hasCompany = companyHits.length > 0;
  const hasPerson = personHits.length > 0;

  /** Does this file distinguish its company columns by prefixing them? */
  const usesCompanyPrefix = present.some((p) => p.key.startsWith('COMPANY '));

  const companyCols: Record<string, string> = {};
  const personCols: Record<string, string> = {};
  const unresolved: UnresolvedColumn[] = [];
  const notes: string[] = [];

  const sampleFor = (header: string): string | null => {
    for (const row of sampleRows) {
      const v = row[header];
      if (v !== null && v !== undefined && String(v).trim() !== '') {
        return String(v).slice(0, 60);
      }
    }
    return null;
  };

  // Highest positional index seen on a column that resolved to a PERSON
  // field — i.e. how many people one source row carries.
  let personPerRow = 1;

  for (const { raw, key, index } of present) {
    const inCompany = companyMap.has(key);
    const inContact = contactMap.has(key);
    const generic = GENERIC_HEADERS.has(key);

    if (!inCompany && !inContact) {
      unresolved.push({
        header: raw,
        sample: sampleFor(raw),
        reason: 'No known mapping for this column.',
      });
      continue;
    }

    const toCompany = () => { companyCols[raw] = companyMap.get(key)!; };
    const toPerson = () => {
      personCols[raw] = contactMap.get(key)!;
      personPerRow = Math.max(personPerRow, index);
    };

    // Unambiguous: only one map claims it.
    if (inCompany && !inContact) { toCompany(); continue; }
    if (inContact && !inCompany) { toPerson(); continue; }

    // Claimed by both. Only one entity in the file settles it outright.
    if (hasCompany && !hasPerson) { toCompany(); continue; }
    if (hasPerson && !hasCompany) { toPerson(); continue; }

    // Both entities present. An explicit COMPANY prefix is decisive; the
    // unprefixed twin then belongs to the person.
    if (key.startsWith('COMPANY ')) { toCompany(); continue; }

    const prefixedTwinPresent = present.some((p) => p.key === `COMPANY ${key}`);
    if (prefixedTwinPresent) {
      toPerson();
      notes.push(`"${raw}" read as the person's — the file also has "COMPANY ${key}".`);
      continue;
    }

    // The file marks its company columns with a COMPANY prefix. That is a
    // convention, and an unprefixed column in such a file is the person's —
    // which is what makes a provider export's bare `Email` the contact's and
    // not the employer's.
    if (usesCompanyPrefix) {
      toPerson();
      notes.push(`"${raw}" read as the person's — this file prefixes its company columns with "Company".`);
      continue;
    }

    unresolved.push({
      header: raw,
      sample: sampleFor(raw),
      reason: generic
        ? 'This file has both companies and people, and this column could belong to either.'
        : 'Claimed by both the company and the person mapping.',
    });
  }

  const entities: DetectedEntity[] = [];
  const perRow = personPerRow;

  if (hasCompany) {
    entities.push({
      kind: 'company',
      columns: companyCols,
      reasons: [
        `Company-only columns present: ${companyHits.slice(0, 5).map((h) => h.raw).join(', ')}`,
      ],
      per_row: 1,
    });
  }

  if (hasPerson) {
    const reasons = [
      `Person-only columns present: ${personHits.slice(0, 5).map((h) => h.raw).join(', ')}`,
    ];
    if (perRow > 1) {
      reasons.push(
        `Columns repeat up to ${perRow} times per row, so each row carries up to ${perRow} people.`,
      );
    }
    entities.push({ kind: 'person', columns: personCols, reasons, per_row: perRow });
  }

  if (entities.length === 0) {
    notes.push(
      'No column identified either a company or a person. Nothing will be imported until the columns below are mapped by hand.',
    );
  }

  return {
    entities,
    unresolved_columns: unresolved,
    confidence: entities.length > 0 && unresolved.length === 0 ? 'high' : 'low',
    notes,
  };
}

/**
 * Estimated output per entity, for the review screen. People are
 * `rows × per_row` when a file repeats a person block inline — the honest
 * number, not the row count.
 */
export function estimateRows(plan: ExtractionPlan, totalRows: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of plan.entities) out[e.kind] = totalRows * e.per_row;
  return out;
}
