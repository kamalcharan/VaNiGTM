/**
 * prospect-skill: get_segments
 *
 * The saved segments, each with a live count beside the one it was saved with.
 *
 * ── WHY BOTH NUMBERS ──────────────────────────────────────────────────
 *
 * A segment stores its DEFINITION, not a member list — deliberately, so a
 * company that gains a domain tomorrow joins "pharma with a website" on its
 * own. The cost is that the number you saw when you saved it can stop being
 * true, either because the data moved or because the industry rules did.
 *
 * Showing only the live count hides that anything changed. Showing only the
 * saved one is a lie with a timestamp. So both, plus `rules_moved` when the
 * classification itself has been edited since — because that is the case
 * where the same name silently covers different companies, and it is the one
 * the design note flagged as the standing risk.
 */

import { SkillContext } from '../../../shared/types';
import { describeDefinition, cleanDefinition } from '../segments';
import { rulesVersion } from '../../../etl/industry-normalizer';

export async function get_segments(
  _params: Record<string, unknown>,
  ctx: SkillContext,
) {
  const current = rulesVersion();

  const res = await ctx.db.query<Record<string, unknown>>(
    `SELECT s.id, s.name, s.note, s.definition,
            s.member_count, s.counted_at, s.rules_version,
            s.created_at, s.updated_at,
            -- The live count, in the same statement, so the two numbers on a
            -- card can never come from different moments.
            (SELECT count(*) FROM gt_prospects p
              WHERE p.tenant_id = s.tenant_id
                AND p.is_live   = s.is_live
                AND p.is_active = true
                AND (s.definition->>'industry_canonical' IS NULL
                     OR p.industry_canonical = s.definition->>'industry_canonical')
                AND (s.definition->>'industry_sub' IS NULL
                     OR p.industry_sub = s.definition->>'industry_sub')
                AND (s.definition->>'relationship' IS NULL
                     OR p.relationship = s.definition->>'relationship')
                AND (s.definition->>'city' IS NULL
                     OR p.city ILIKE s.definition->>'city')
                AND (s.definition->>'state_code' IS NULL
                     OR p.state_code = s.definition->>'state_code')
                AND (s.definition->>'min_quality' IS NULL
                     OR COALESCE(p.completeness, 0) >= (s.definition->>'min_quality')::numeric)
                AND (s.definition->>'domain' IS NULL
                     OR (s.definition->>'domain' = 'has'  AND p.domain_normalized IS NOT NULL)
                     OR (s.definition->>'domain' = 'none' AND p.domain_normalized IS NULL))
                AND (s.definition->>'tag_id' IS NULL OR EXISTS (
                      SELECT 1 FROM gt_prospect_tags pt
                       WHERE pt.prospect_id = p.id
                         AND pt.tag_id = (s.definition->>'tag_id')::bigint))
                AND (s.definition->>'search' IS NULL
                     OR p.name ILIKE '%' || (s.definition->>'search') || '%'
                     OR p.domain_normalized ILIKE '%' || (s.definition->>'search') || '%'
                     OR p.industry_raw ILIKE '%' || (s.definition->>'search') || '%')
            ) AS live_count,
            -- Reachability, because it is the number that decides how much of
            -- a segment can actually be researched.
            (SELECT count(*) FROM gt_prospects p
              WHERE p.tenant_id = s.tenant_id AND p.is_live = s.is_live
                AND p.is_active = true AND p.domain_normalized IS NOT NULL
                AND (s.definition->>'industry_canonical' IS NULL
                     OR p.industry_canonical = s.definition->>'industry_canonical')
                AND (s.definition->>'industry_sub' IS NULL
                     OR p.industry_sub = s.definition->>'industry_sub')
            ) AS with_website
       FROM gt_segments s
      WHERE s.tenant_id = $tenant_id
        AND s.is_live   = $is_live
        AND s.is_active = true
      ORDER BY s.updated_at DESC`,
    { tenant_id: ctx.tenant_id, is_live: ctx.is_live },
  );

  const segments = res.rows.map((r) => {
    const definition = cleanDefinition(r.definition);
    const saved = r.member_count === null ? null : Number(r.member_count);
    const live = Number(r.live_count ?? 0);
    return {
      id: Number(r.id),
      name: r.name,
      note: r.note,
      definition,
      summary: describeDefinition(definition),
      member_count: saved,
      live_count: live,
      with_website: Number(r.with_website ?? 0),
      counted_at: r.counted_at,
      // The two ways a saved segment stops meaning what it meant. Named
      // separately because the fixes are different: one is data moving under
      // a stable rule, the other is the rule itself moving.
      drifted: saved !== null && saved !== live,
      rules_moved: r.rules_version !== null && r.rules_version !== current,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  });

  return { segments, rules_version: current, recipe: 'segment-list' as const };
}
