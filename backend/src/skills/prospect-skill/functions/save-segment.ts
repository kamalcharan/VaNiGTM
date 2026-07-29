/**
 * prospect-skill: save_segment
 *
 * Name the filter you are looking at, and keep it.
 *
 * The pilot's cohort — 144 pharma manufacturers, 101 with a website — came out
 * of a CLI script. It worked, and it meant the person who owns the go-to-market
 * could not see, change or repeat their own segment without a terminal. This
 * is that, on the screen where the filter already lives.
 *
 * The member count is computed HERE rather than trusted from the caller: a
 * screen showing 144 while the definition matches 12 is worse than no number
 * at all, and the two can only be guaranteed to agree if the same query
 * produces both.
 */

import { SkillContext } from '../../../shared/types';
import { cleanDefinition, describeDefinition, isEmptyDefinition } from '../segments';
import { rulesVersion } from '../../../etl/industry-normalizer';

interface SaveSegmentParams {
  /** Omit to create; pass to rename or redefine an existing one. */
  segment_id?: number;
  name: string;
  note?: string;
  definition?: Record<string, unknown>;
}

export async function save_segment(params: SaveSegmentParams, ctx: SkillContext) {
  const name = String(params.name ?? '').trim();
  if (!name) throw new Error('A segment needs a name — it is how you will find it again.');
  if (name.length > 120) throw new Error('That name is too long (120 characters max).');

  const definition = cleanDefinition(params.definition);

  // "Every company" is not a segment. Saving it would create a name that
  // looks like a decision and constrains nothing — and the first campaign
  // built on it would go to the whole list.
  if (isEmptyDefinition(definition)) {
    throw new Error(
      'That filter selects every company, so there is nothing to name. Narrow it '
      + 'first — an industry, a website filter, a tag — then save.',
    );
  }

  return ctx.db.transaction(async (tx) => {
    // Counted with the SAME clauses get_records uses, so the number on the
    // card is the number you see when you open it.
    const counted = await tx.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM gt_prospects p
        WHERE p.tenant_id = $tenant_id
          AND p.is_live   = $is_live
          AND p.is_active = true
          AND ($industry_canonical::text IS NULL
               OR p.industry_canonical = $industry_canonical::text)
          AND ($industry_sub::text IS NULL OR p.industry_sub = $industry_sub::text)
          AND ($relationship::text IS NULL OR p.relationship = $relationship::text)
          AND ($city::text IS NULL OR p.city ILIKE $city::text)
          AND ($state_code::text IS NULL OR p.state_code = $state_code::text)
          AND ($min_quality::numeric IS NULL
               OR COALESCE(p.completeness, 0) >= $min_quality::numeric)
          AND ($domain::text IS NULL
               OR ($domain::text = 'has'  AND p.domain_normalized IS NOT NULL)
               OR ($domain::text = 'none' AND p.domain_normalized IS NULL))
          AND ($tag_id::bigint IS NULL OR EXISTS (
                SELECT 1 FROM gt_prospect_tags pt
                 WHERE pt.prospect_id = p.id AND pt.tag_id = $tag_id::bigint))
          AND ($search::text IS NULL
               OR p.name ILIKE '%' || $search::text || '%'
               OR p.domain_normalized ILIKE '%' || $search::text || '%'
               OR p.industry_raw ILIKE '%' || $search::text || '%')`,
      {
        tenant_id: ctx.tenant_id, is_live: ctx.is_live,
        industry_canonical: definition.industry_canonical ?? null,
        industry_sub: definition.industry_sub ?? null,
        relationship: definition.relationship ?? null,
        city: definition.city ?? null,
        state_code: definition.state_code ?? null,
        min_quality: definition.min_quality ?? null,
        domain: definition.domain ?? null,
        tag_id: definition.tag_id ?? null,
        search: definition.search ?? null,
      },
    );
    const memberCount = Number(counted.rows[0]?.n ?? 0);

    const res = await tx.query<{ id: number }>(
      params.segment_id
        ? `UPDATE gt_segments
              SET name          = $name,
                  note          = $note,
                  definition    = $definition::jsonb,
                  member_count  = $member_count,
                  counted_at    = now(),
                  rules_version = $rules_version,
                  updated_at    = now()
            WHERE id = $segment_id
              AND tenant_id = $tenant_id
              AND is_live   = $is_live
            RETURNING id`
        : `INSERT INTO gt_segments
             (tenant_id, is_live, name, note, definition,
              member_count, counted_at, rules_version, created_by)
           VALUES
             ($tenant_id, $is_live, $name, $note, $definition::jsonb,
              $member_count, now(), $rules_version, $user_id)
           RETURNING id`,
      {
        ...(params.segment_id ? { segment_id: Number(params.segment_id) } : { user_id: ctx.user_id }),
        tenant_id: ctx.tenant_id, is_live: ctx.is_live,
        name,
        note: String(params.note ?? '').trim() || null,
        definition: JSON.stringify(definition),
        member_count: memberCount,
        rules_version: rulesVersion(),
      },
    );

    if (res.rows.length === 0) throw new Error('No such segment.');

    return {
      segment_id: Number(res.rows[0].id),
      name,
      member_count: memberCount,
      summary: describeDefinition(definition),
      recipe: 'segment-card' as const,
    };
  });
}
