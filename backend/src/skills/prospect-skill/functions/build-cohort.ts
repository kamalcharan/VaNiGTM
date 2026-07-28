/**
 * prospect-skill: build_cohort
 *
 * Step 1 of documents/POA-manufacturing-pilot.md.
 *
 * Turns "the manufacturers in this import" from a thing you eyeball into a
 * thing you can select: classify every prospect against a cluster rule, store
 * the collapsed value, and tag the matches so one tag pulls the cohort up in
 * /prospects.
 *
 * ── WHY THE RULES LIVE IN JS AND NOT IN SQL ───────────────────────────
 *
 * The same rules have to be unit-testable without a database, and they will
 * be read by a human deciding whether the cohort is right. 2,882 rows is a
 * trivial read; correctness matters more than avoiding the round trip.
 *
 * ── WHAT IT WILL NOT DO ───────────────────────────────────────────────
 *
 * It never removes a tag. A tag is a human-visible assertion and someone may
 * have applied it by hand; a rule that revokes tags on re-run would silently
 * rewrite a human's decision. Rows tagged but no longer matching are COUNTED
 * and returned as `tagged_no_longer_matching` for a human to act on
 * (CLAUDE.md rule 12).
 *
 * `dry_run: true` reports exactly what would change and writes nothing.
 */

import { SkillContext } from '../../../shared/types';
import { canonicalIndustry, getCluster, clusterNames } from '../../../etl/industry-normalizer';

interface BuildCohortParams {
  /** Cluster canonical name, e.g. 'manufacturing'. */
  cluster: string;
  /** Tag applied to every match. Created for this tenant if new. */
  tag_label?: string;
  /** Classify and report, write nothing. */
  dry_run?: boolean;
}

interface ExcludedSample {
  industry_raw: string;
  excluded_by: string;
  rows: number;
}

interface BuildCohortResult {
  cluster: string;
  dry_run: boolean;
  scanned: number;
  matched: number;
  excluded: number;
  no_rule: number;
  no_industry: number;
  /** Of the matches — the number the pilot is actually sized on. */
  with_domain: number;
  without_domain: number;
  /** Distinct raw strings that collapsed onto the canonical value. */
  variants: { industry_raw: string; rows: number }[];
  /** Every exclusion, so the rule can be argued with. */
  excluded_samples: ExcludedSample[];
  tag: { id: number; label: string } | null;
  tagged: number;
  tagged_no_longer_matching: number;
  recipe: 'cohort-report';
}

interface ProspectRow {
  id: number;
  industry_raw: string | null;
  domain_normalized: string | null;
  industry_canonical: string | null;
}

/** Count rows per key, biggest first — used for both variants and exclusions. */
function tally<T>(items: T[], key: (t: T) => string): Map<string, { rows: number; sample: T }> {
  const out = new Map<string, { rows: number; sample: T }>();
  for (const item of items) {
    const k = key(item);
    const hit = out.get(k);
    if (hit) hit.rows += 1;
    else out.set(k, { rows: 1, sample: item });
  }
  return out;
}

export async function build_cohort(
  params: BuildCohortParams,
  ctx: SkillContext,
): Promise<BuildCohortResult> {
  const clusterName = String(params.cluster ?? '').trim();
  const cluster = getCluster(clusterName);
  if (!cluster) {
    throw new Error(
      `Unknown cluster "${clusterName}". Defined clusters: ${clusterNames().join(', ')}.`,
    );
  }
  const dryRun = params.dry_run === true;
  const tagLabel = (params.tag_label ?? '').trim() || null;

  return ctx.db.transaction(async (tx) => {
    // Active rows only: a deactivated record is not a prospect anyone will
    // research, and including it would inflate the cohort size the pilot is
    // planned against.
    const scan = await tx.query<ProspectRow>(
      `SELECT id, industry_raw, domain_normalized, industry_canonical
       FROM   gt_prospects
       WHERE  tenant_id = $tenant_id
         AND  is_live   = $is_live
         AND  is_active = true`,
      { $tenant_id: ctx.tenant_id, $is_live: ctx.is_live },
    );

    const matched: ProspectRow[] = [];
    const excluded: { row: ProspectRow; excluded_by: string }[] = [];
    let noRule = 0;
    let noIndustry = 0;
    /** Rows carrying THIS canonical that the rule no longer claims. */
    const staleCanonical: number[] = [];

    for (const row of scan.rows) {
      const verdict = canonicalIndustry(row.industry_raw);
      if (verdict.reason === 'matched' && verdict.canonical === cluster.canonical) {
        matched.push(row);
        continue;
      }
      if (row.industry_canonical === cluster.canonical) staleCanonical.push(row.id);

      if (verdict.reason === 'excluded' && verdict.cluster === cluster.canonical) {
        excluded.push({ row, excluded_by: verdict.excluded_by ?? '?' });
      } else if (verdict.reason === 'no_industry') {
        noIndustry += 1;
      } else if (verdict.reason === 'no_rule') {
        noRule += 1;
      }
    }

    const matchedIds = matched.map((r) => r.id);
    const withDomain = matched.filter((r) => r.domain_normalized !== null).length;

    const variants = [...tally(matched, (r) => r.industry_raw ?? '(blank)')]
      .map(([industry_raw, v]) => ({ industry_raw, rows: v.rows }))
      .sort((a, b) => b.rows - a.rows);

    const excludedSamples: ExcludedSample[] = [
      ...tally(excluded, (e) => `${e.row.industry_raw ?? '(blank)'}|${e.excluded_by}`),
    ]
      .map(([, v]) => ({
        industry_raw: v.sample.row.industry_raw ?? '(blank)',
        excluded_by: v.sample.excluded_by,
        rows: v.rows,
      }))
      .sort((a, b) => b.rows - a.rows);

    const report = (
      tag: { id: number; label: string } | null,
      tagged: number,
      staleTagged: number,
    ): BuildCohortResult => ({
      cluster: cluster.canonical,
      dry_run: dryRun,
      scanned: scan.rows.length,
      matched: matched.length,
      excluded: excluded.length,
      no_rule: noRule,
      no_industry: noIndustry,
      with_domain: withDomain,
      without_domain: matched.length - withDomain,
      variants,
      excluded_samples: excludedSamples,
      tag,
      tagged,
      tagged_no_longer_matching: staleTagged,
      recipe: 'cohort-report' as const,
    });

    if (dryRun) return report(null, 0, 0);

    // ── Write the collapsed value ────────────────────────────────────
    // Every match takes the SAME canonical, so this is one statement rather
    // than a batched VALUES update.
    if (matchedIds.length > 0) {
      await tx.query(
        `UPDATE gt_prospects
         SET    industry_canonical = $canonical, updated_at = now()
         WHERE  id = ANY($ids::bigint[])
           AND  tenant_id = $tenant_id
           AND  is_live   = $is_live
           AND  industry_canonical IS DISTINCT FROM $canonical`,
        {
          $canonical: cluster.canonical, $ids: matchedIds,
          $tenant_id: ctx.tenant_id, $is_live: ctx.is_live,
        },
      );
    }

    // Re-running after a rule is tightened must not leave the old verdict
    // behind. Clearing a DERIVED column is not the same as revoking a tag —
    // nobody asserted this value by hand.
    if (staleCanonical.length > 0) {
      await tx.query(
        `UPDATE gt_prospects
         SET    industry_canonical = NULL, updated_at = now()
         WHERE  id = ANY($ids::bigint[])
           AND  tenant_id = $tenant_id
           AND  is_live   = $is_live`,
        { $ids: staleCanonical, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live },
      );
    }

    if (!tagLabel) return report(null, 0, 0);

    // ── Tag the cohort ───────────────────────────────────────────────
    // Tenant-scoped, never a platform tag: this is one tenant's working set.
    // The slug is generated, so ON CONFLICT targets the partial unique index
    // from migration 199.
    await tx.query(
      `INSERT INTO gt_tags (tenant_id, label, created_by)
       VALUES ($tenant_id, $label, $user_id)
       ON CONFLICT DO NOTHING`,
      { $tenant_id: ctx.tenant_id, $label: tagLabel, $user_id: ctx.user_id },
    );

    const found = await tx.query<{ id: number; label: string }>(
      `SELECT id, label FROM gt_tags
       WHERE  tenant_id = $tenant_id
         AND  slug = LOWER(BTRIM(REGEXP_REPLACE(
                       REGEXP_REPLACE($label, '[^A-Za-z0-9]+', ' ', 'g'), '\\s+', ' ', 'g')))`,
      { $tenant_id: ctx.tenant_id, $label: tagLabel },
    );
    if (found.rows.length === 0) {
      throw new Error(`Tag "${tagLabel}" could not be created or found.`);
    }
    const tag = found.rows[0];

    let tagged = 0;
    if (matchedIds.length > 0) {
      const ins = await tx.query<{ prospect_id: number }>(
        `INSERT INTO gt_prospect_tags (prospect_id, tag_id, tenant_id, created_by)
         SELECT p.id, $tag_id, $tenant_id, $user_id
         FROM   gt_prospects p
         WHERE  p.id = ANY($ids::bigint[])
           AND  p.tenant_id = $tenant_id
           AND  p.is_live   = $is_live
         ON CONFLICT DO NOTHING
         RETURNING prospect_id`,
        {
          $tag_id: tag.id, $tenant_id: ctx.tenant_id, $user_id: ctx.user_id,
          $ids: matchedIds, $is_live: ctx.is_live,
        },
      );
      tagged = ins.rows.length;
    }

    // Not removed — surfaced. See the header.
    const stale = await tx.query<{ prospect_id: number }>(
      `SELECT pt.prospect_id
       FROM   gt_prospect_tags pt
       WHERE  pt.tag_id    = $tag_id
         AND  pt.tenant_id = $tenant_id
         AND  NOT (pt.prospect_id = ANY($ids::bigint[]))`,
      { $tag_id: tag.id, $tenant_id: ctx.tenant_id, $ids: matchedIds },
    );

    return report(tag, tagged, stale.rows.length);
  });
}
