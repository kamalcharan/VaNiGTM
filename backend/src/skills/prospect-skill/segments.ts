/**
 * Segment definitions — the shared shape between /prospects, gt_segments and
 * the research batch.
 *
 * A segment IS a /prospects filter with a name on it. That is the whole idea,
 * and it is why the fields here are exactly the controls on that screen: a
 * segment nobody can reproduce by looking at the page is a magic number, and
 * a definition the UI cannot round-trip is one nobody can edit.
 */

/**
 * Every filter a segment may pin. Anything not listed is deliberately not
 * part of a segment — paging and sort order describe how you are LOOKING at
 * a set, not which set it is.
 */
export interface SegmentDefinition {
  search?: string;
  industry_canonical?: string;
  industry_sub?: string;
  /** 'has' | 'none' — reachability, the filter the pilot actually turns on. */
  domain?: string;
  tag_id?: number;
  relationship?: string;
  min_quality?: number;
  city?: string;
  state_code?: string;
}

const KEYS: (keyof SegmentDefinition)[] = [
  'search', 'industry_canonical', 'industry_sub', 'domain',
  'tag_id', 'relationship', 'min_quality', 'city', 'state_code',
];

/**
 * Keep only the recognised keys, drop the empty ones.
 *
 * Two reasons this is not just a spread. An unknown key would be stored and
 * then silently ignored at query time, so a segment would claim a constraint
 * it does not apply. And an empty string is not a filter — `{city: ''}` reads
 * as "pinned to no city" and would make two identical segments compare
 * unequal.
 */
export function cleanDefinition(raw: unknown): SegmentDefinition {
  const src = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const key of KEYS) {
    const v = src[key];
    if (v === null || v === undefined) continue;
    if (typeof v === 'string') {
      const t = v.trim();
      if (t) out[key] = t;
    } else if (typeof v === 'number') {
      if (Number.isFinite(v)) out[key] = v;
    } else if (typeof v === 'boolean') {
      out[key] = v;
    }
  }
  return out as SegmentDefinition;
}

/** True when a definition constrains nothing — i.e. "every company". */
export const isEmptyDefinition = (d: SegmentDefinition): boolean =>
  Object.keys(d).length === 0;

/** Human summary for a screen or a toast: "pharma · has a website". */
export function describeDefinition(d: SegmentDefinition): string {
  const parts: string[] = [];
  if (d.industry_sub) parts.push(d.industry_sub);
  else if (d.industry_canonical) parts.push(d.industry_canonical);
  if (d.domain === 'has') parts.push('has a website');
  if (d.domain === 'none') parts.push('no website');
  if (d.city) parts.push(d.city);
  if (d.state_code) parts.push(d.state_code);
  if (d.relationship) parts.push(d.relationship);
  if (d.tag_id) parts.push('tagged');
  if (d.min_quality) parts.push(`quality ≥ ${d.min_quality}`);
  if (d.search) parts.push(`"${d.search}"`);
  return parts.length > 0 ? parts.join(' · ') : 'every company';
}
