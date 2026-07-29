/**
 * research-skill: pilot_result
 *
 * The answer, read against criteria that were written down before anything
 * was built.
 *
 * ── WHY THIS IS FUSSY ABOUT WHAT IT WILL SAY ──────────────────────────
 *
 * Pre-registration is worthless if the reading can be taken early and retaken
 * until it looks better. Three rules follow from that, and all three make the
 * number LESS flattering:
 *
 * 1. A send with no outcome yet, inside the response window, is counted as
 *    NEITHER a reply nor a non-reply. It is pending. Counting pending sends
 *    as non-replies drives the rate down early; excluding them from the
 *    denominator drives it up. Both are wrong, so they are reported
 *    separately and excluded from the rate entirely.
 * 2. Silence past the window IS an answer. A send nobody replied to in two
 *    weeks counts as a non-reply whether or not a human remembered to mark
 *    it. Otherwise the rate quietly measures only the touches somebody
 *    bothered to close.
 * 3. Below MIN_CONCLUDED_FOR_VERDICT the verdict is withheld. At fifteen
 *    concluded sends a single reply moves the rate by seven points and can
 *    cross a criterion boundary on its own.
 *
 * ── THE QUALITATIVE GATE IS NOT COMPUTED ──────────────────────────────
 *
 * The plan's second gate — "read the sent messages side by side; if a
 * researched message says roughly what a template would have said, the
 * research did no work" — is a human judgement and is returned as an
 * unanswered question, not as a box this function can tick. A screen that
 * showed only the rate would let the pilot pass on half its criteria.
 */

import { SkillContext } from '../../../shared/types';
import {
  REPLY_OUTCOMES, RESPONSE_WINDOW_DAYS, MIN_CONCLUDED_FOR_VERDICT,
  verdictFor, VERDICT_TEXT,
} from '../touches';

interface Row {
  scope: 'researched' | 'unresearched';
  sends: string;
  concluded: string;
  pending: string;
  replies: string;
  meetings: string;
  bounced: string;
  companies: string;
}

export async function pilot_result(
  _params: Record<string, unknown>,
  ctx: SkillContext,
) {
  const res = await ctx.db.query<Row>(
    `SELECT CASE WHEN had_brief THEN 'researched' ELSE 'unresearched' END AS scope,
            count(*)::text                                          AS sends,
            count(DISTINCT prospect_id)::text                       AS companies,
            -- Concluded = answered, OR the window has closed. Silence past the
            -- window is an answer; without that the rate would only measure
            -- the touches somebody remembered to close.
            count(*) FILTER (
              WHERE outcome IS NOT NULL
                 OR touched_at < now() - ($window::int || ' days')::interval)::text
                                                                    AS concluded,
            count(*) FILTER (
              WHERE outcome IS NULL
                AND touched_at >= now() - ($window::int || ' days')::interval)::text
                                                                    AS pending,
            count(*) FILTER (WHERE outcome = ANY($reply_outcomes::text[]))::text
                                                                    AS replies,
            count(*) FILTER (WHERE outcome = 'meeting')::text        AS meetings,
            -- Never reached them. Not a rejection, and the plan calls
            -- reachability the least-tested assumption in the thesis.
            count(*) FILTER (WHERE outcome = 'bounced')::text        AS bounced
       FROM gt_touch_log
      WHERE tenant_id = $tenant_id AND is_live = $is_live
      GROUP BY 1`,
    {
      tenant_id: ctx.tenant_id, is_live: ctx.is_live,
      window: RESPONSE_WINDOW_DAYS,
      reply_outcomes: REPLY_OUTCOMES,
    },
  );

  const pick = (scope: string) => {
    const r = res.rows.find((x) => x.scope === scope);
    const n = (v: string | undefined) => Number(v ?? 0);
    const concluded = n(r?.concluded);
    const replies = n(r?.replies);
    return {
      sends: n(r?.sends),
      companies: n(r?.companies),
      concluded,
      pending: n(r?.pending),
      replies,
      meetings: n(r?.meetings),
      bounced: n(r?.bounced),
      // Null rather than 0 when nothing has concluded: "0%" and "no reading
      // yet" are different statements and only one of them is true.
      reply_rate: concluded > 0 ? replies / concluded : null,
    };
  };

  const researched = pick('researched');
  const unresearched = pick('unresearched');

  const verdict = verdictFor(researched.reply_rate ?? 0, researched.concluded);

  // Both channels of the comparison, when there is one. Unresearched sends
  // were never part of the plan, but if any exist they are the only control
  // the pilot has and ignoring them would waste them.
  const comparison = unresearched.concluded > 0 && researched.concluded > 0
    ? {
      researched_rate: researched.reply_rate,
      unresearched_rate: unresearched.reply_rate,
      difference: (researched.reply_rate ?? 0) - (unresearched.reply_rate ?? 0),
    }
    : null;

  return {
    researched,
    unresearched,
    comparison,
    verdict,
    verdict_text: VERDICT_TEXT[verdict],
    response_window_days: RESPONSE_WINDOW_DAYS,
    min_concluded_for_verdict: MIN_CONCLUDED_FOR_VERDICT,
    /**
     * The second gate, returned as a question because no query can answer it.
     * A screen showing only the rate would let the pilot pass on half its
     * criteria.
     */
    qualitative_gate:
      'Read the sent messages side by side. If a researched message says '
      + 'roughly what a template would have said, the research did no work — '
      + 'and that is a failure even at a 10% reply rate.',
    recipe: 'pilot-result' as const,
  };
}
