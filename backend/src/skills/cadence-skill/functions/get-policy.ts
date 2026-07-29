/**
 * cadence-skill: get_policy
 *
 * The rules in force, and where each came from.
 */

import { SkillContext } from '../../../shared/types';
import { DEFAULT_POLICY } from '../governor';

export async function get_policy(_params: Record<string, unknown>, ctx: SkillContext) {
  const res = await ctx.db.query<Record<string, unknown>>(
    `SELECT id::text, scope, channel, max_touches, window_days, quiet_dows,
            to_char(quiet_from, 'HH24:MI') AS quiet_from,
            to_char(quiet_to,   'HH24:MI') AS quiet_to,
            timezone, is_active
       FROM gt_cadence_policy
      WHERE tenant_id = $tenant_id AND is_live = $is_live
      ORDER BY scope, channel NULLS FIRST`,
    { tenant_id: ctx.tenant_id, is_live: ctx.is_live },
  );

  return {
    policies: res.rows,
    // Reported rather than hidden: an unconfigured tenant runs on the
    // built-in, and that must not read as a deliberate choice.
    built_in: DEFAULT_POLICY,
    using_built_in: res.rows.length === 0,
    recipe: 'cadence-policy' as const,
  };
}
