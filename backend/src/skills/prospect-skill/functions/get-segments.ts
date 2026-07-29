/**
 * prospect-skill: get_segments
 *
 * The saved segments, with the count they were saved with, a live count, and
 * — the number that actually matters — how much of each has been researched.
 *
 * ── WHAT A RULE CHANGE CAN AND CANNOT DO ──────────────────────────────
 *
 * User question, 2026-07-29: "when Research is done, any changes happening
 * might impact Research data already in?"
 *
 * It cannot. A brief hangs off `prospect_id`, and prospects do not move. The
 * only classification that reaches the fit prompt is `industry_raw` — the
 * ORIGINAL imported text, never recomputed — and `judgementFingerprint`
 * covers offers, corrections and lessons but deliberately NOT industry, so
 * reclassifying nothing stales nothing. No brief is altered, invalidated or
 * lost when a rule moves.
 *
 * What moves is MEMBERSHIP, and the damage is coverage rather than
 * corruption:
 *
 *   - the segment gains companies → they have no research
 *   - the segment loses companies → you researched things it no longer covers
 *
 * That was invisible: the card said "101" and gave no hint that eight of them
 * had never been read. So the counts below are not decoration — they are the
 * only way the consequence of a rule change is legible in terms anyone acts
 * on. `rules_moved` says the definition may now cover different companies;
 * `unresearched` says how much that actually costs you.
 */

import { SkillContext } from '../../../shared/types';
import { describeDefinition, cleanDefinition } from '../segments';
import { segmentPredicate } from '../segment-sql';
import { rulesVersion } from '../../../etl/industry-normalizer';

export async function get_segments(
  _params: Record<string, unknown>,
  ctx: SkillContext,
) {
  const current = rulesVersion();
  const match = segmentPredicate('p', 's.definition');

  const res = await ctx.db.query<Record<string, unknown>>(
    `SELECT s.id, s.name, s.note, s.definition,
            s.member_count, s.counted_at, s.rules_version,
            s.created_at, s.updated_at,
            m.*
       FROM gt_segments s
       -- One pass over the members, so every number on a card comes from the
       -- same moment. Separate subqueries would let the live count and the
       -- research counts disagree by a write.
       LEFT JOIN LATERAL (
         SELECT count(*)::int                                        AS live_count,
                count(*) FILTER (WHERE p.domain_normalized IS NOT NULL)::int
                                                                     AS with_website,
                count(*) FILTER (WHERE b.facts_at IS NOT NULL)::int   AS researched,
                count(*) FILTER (WHERE b.decided_at IS NOT NULL)::int AS decided,
                count(*) FILTER (WHERE b.status IN ('extract_failed','unreadable'))::int
                                                                     AS research_failed,
                -- Reachable, and nobody has read it. The number a rule change
                -- actually costs.
                count(*) FILTER (WHERE p.domain_normalized IS NOT NULL
                                   AND b.facts_at IS NULL)::int       AS unresearched
           FROM gt_prospects p
           LEFT JOIN gt_account_briefs b
                  ON b.prospect_id = p.id
                 AND b.tenant_id   = s.tenant_id
                 AND b.is_live     = s.is_live
          WHERE p.tenant_id = s.tenant_id
            AND p.is_live   = s.is_live
            AND p.is_active = true
            AND ${match}
       ) m ON true
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
      researched: Number(r.researched ?? 0),
      decided: Number(r.decided ?? 0),
      research_failed: Number(r.research_failed ?? 0),
      unresearched: Number(r.unresearched ?? 0),
      counted_at: r.counted_at,
      // Two different problems with two different fixes: data moving under a
      // stable rule, versus the rule itself moving.
      drifted: saved !== null && saved !== live,
      rules_moved: r.rules_version !== null && r.rules_version !== current,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  });

  return { segments, rules_version: current, recipe: 'segment-list' as const };
}
