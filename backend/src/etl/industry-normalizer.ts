/**
 * VaNi GTM — Industry cluster rules
 *
 * Collapses the free-text `industry_raw` a source file carried onto a
 * canonical cluster name, so a segment can be selected at all.
 *
 * ⚠️ THIS IS NOT THE INDUSTRY TAXONOMY. The FTCCI import landed 2,149
 * distinct industry strings; a real taxonomy (canonical list, aliases, a
 * mapping UI, gt_industries) is a separate piece of work. This file holds
 * rules for the clusters a running pilot actually needs, and returns
 * `no_rule` for everything else. Adding a cluster means adding one entry to
 * CLUSTERS — never widening a regex until it swallows the tail.
 *
 * ── EXCLUSIONS ARE REPORTED, NEVER SILENT ─────────────────────────────
 *
 * "Manufacturers Association" contains the manufacturing token and is not a
 * manufacturer. So does "Manufacturing Consultancy". Both are excluded — but
 * the caller gets the row back with `reason: 'excluded'` and the rule that
 * excluded it, so a human can see what the rule threw away and overrule it.
 * A rule that quietly drops rows is indistinguishable from a rule that is
 * wrong (CLAUDE.md rule 12).
 */

export interface IndustryCluster {
  /** Stored in gt_prospects.industry_canonical. Fits VARCHAR(60). */
  canonical: string;
  /** Human label for the report. */
  label: string;
  include: RegExp;
  /**
   * Organisations that SERVE the cluster rather than belong to it. Applied
   * only after `include` matched, so it can stay narrow.
   */
  exclude: RegExp;
}

export type IndustryReason = 'matched' | 'excluded' | 'no_rule' | 'no_industry';

export interface IndustryMatch {
  canonical: string | null;
  reason: IndustryReason;
  /** Which cluster looked at it — set for 'matched' and 'excluded'. */
  cluster?: string;
  /** The exclusion term that fired, so the report can explain itself. */
  excluded_by?: string;
}

/**
 * Lower-case, punctuation to spaces, collapsed. '&' becomes a space, so
 * "Manufacturer & Exporter" and "Manufacturer and Exporter" normalise alike.
 */
export const normalizeIndustryText = (raw: unknown): string | null => {
  if (raw === null || raw === undefined) return null;
  const s = String(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  return s.length > 0 ? s : null;
};

export const CLUSTERS: IndustryCluster[] = [
  {
    canonical: 'manufacturing',
    label: 'Manufacturing',
    // manufactur* covers manufacturer / manufacturers / manufacturing /
    // manufactures. mfg / mfr / mfrs are the abbreviations FTCCI members use.
    // A company that both makes and exports still makes — "Manufacturer &
    // Exporter" belongs in the cohort.
    include: /\b(manufactur[a-z]*|mfg|mfrs?)\b/,
    // Bodies and advisers that exist BECAUSE of manufacturers. Kept short
    // and defensible; every hit is reported rather than dropped quietly.
    exclude: /\b(association|associations|federation|chamber|council|society|consultant|consultants|consultancy|consulting|recruitment|staffing|placement)\b/,
  },
];

const byCanonical = new Map(CLUSTERS.map((c) => [c.canonical, c]));

export const getCluster = (canonical: string): IndustryCluster | undefined =>
  byCanonical.get(canonical);

export const clusterNames = (): string[] => CLUSTERS.map((c) => c.canonical);

/**
 * Classify one raw industry string.
 *
 * Only the FIRST matching cluster wins. With one cluster defined that is
 * moot; when a second is added, order in CLUSTERS is the precedence and must
 * be chosen deliberately rather than discovered.
 */
export function canonicalIndustry(raw: unknown): IndustryMatch {
  const text = normalizeIndustryText(raw);
  if (text === null) return { canonical: null, reason: 'no_industry' };

  for (const cluster of CLUSTERS) {
    if (!cluster.include.test(text)) continue;

    const hit = text.match(cluster.exclude);
    if (hit) {
      return {
        canonical: null,
        reason: 'excluded',
        cluster: cluster.canonical,
        excluded_by: hit[0],
      };
    }
    return { canonical: cluster.canonical, reason: 'matched', cluster: cluster.canonical };
  }

  return { canonical: null, reason: 'no_rule' };
}
