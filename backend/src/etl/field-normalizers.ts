/**
 * VaNi GTM — Shared import normalisers
 *
 * Primitives used by every import pre-processor. They live here rather than
 * in one processor because company and contact rows come out of the SAME
 * files and must treat junk identically — a `undefined+` in a company column
 * and in a person column are the same defect and must be reported the same
 * way.
 *
 * ⚠️ normalizePersonName MIRRORS a GENERATED column in the database
 * (gt_contacts.normalized_name, migration 198). If one changes the other
 * MUST change with it, or JS-side dedup silently stops matching DB-side
 * values. That exact drift is why the MFD import carried a SQL function
 * (ki_normalize_contact_name, migration 143) whose only job was to mirror a
 * generated column — and both copies shared the same bug for years.
 */

/** Trim to a non-empty string, else null. */
export const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
};

/**
 * A spreadsheet turns "11-50" into a date and exports it as "Nov-50".
 * That is not an employee band, and storing it would poison every range
 * filter built on the column.
 */
export const DATE_COERCED = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d+$/i;

/** Export artefacts that look populated but carry no information. */
export const NULL_LITERALS = /^(undefined\+?|null|n\/?a|-|—)$/i;

/** Multi-value cells: FTCCI packs emails with ';' and phones with '/' or '\'. */
export const firstOf = (raw: unknown, seps: RegExp): string | null => {
  const s = str(raw);
  return s ? (str(s.split(seps)[0]) ?? null) : null;
};

export interface RejectReason {
  field: string;
  reason: string;
}

/**
 * Trim a value and reject the two junk shapes profiled on the real files.
 * Rejections are RETURNED, never swallowed — the caller surfaces them
 * (CLAUDE.md rule 12).
 */
export function cleanValue(
  field: string,
  v: unknown,
  rejects: RejectReason[],
): string | null {
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
}

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
 * Person name normalisation.
 *
 * MUST stay identical to gt_contacts.normalized_name (migration 198):
 *   strip a leading honorific, drop punctuation, collapse whitespace,
 *   upper-case LAST.
 *
 * Order matters and is the whole point: migration 187 filtered the character
 * class before upper-casing, which deleted every lowercase letter
 * ('priya sharma' normalised to the empty string).
 */
export function normalizePersonName(raw: unknown): string {
  const s = str(raw);
  if (!s) return '';
  return s
    .replace(/^(MR|MRS|MS|DR|PROF|SRI|SMT)\.?\s+/i, '')
    .replace(/[^A-Za-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Company name normalisation — mirrors gt_prospects.name_key (migration 196):
 * upper-case FIRST, then drop punctuation and legal-form noise.
 *
 * Deliberately different from normalizePersonName: "Pvt Ltd" is noise on a
 * company and meaningful nowhere on a person.
 */
export function normalizeCompanyName(raw: unknown): string {
  const s = str(raw);
  if (!s) return '';
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\b(PVT|PRIVATE|LTD|LIMITED|LLP|INC|CO|COMPANY|THE)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Quality components for a mapped row.
 *
 * Completeness is fill rate. Validity is measured against what the row TRIED
 * to populate, so a sparse clean row is not punished the way a full dirty one
 * is. Kept separate because fill rate is NOT quality: the provider CSV read
 * 100% populated on revenue while 60 of 119 values were `undefined+`.
 */
export function scoreQuality<T extends object>(
  mapped: T,
  tracked: (keyof T)[],
  rejects: RejectReason[],
): { completeness: number; validity: number; reject_reasons: RejectReason[] } {
  const filled = tracked.filter((k) => {
    const v = mapped[k];
    return v !== null && v !== undefined && v !== '';
  }).length;

  const attempted = tracked.length;
  return {
    completeness: Number((filled / attempted).toFixed(3)),
    validity: Number(((attempted - rejects.length) / attempted).toFixed(3)),
    reject_reasons: rejects,
  };
}
