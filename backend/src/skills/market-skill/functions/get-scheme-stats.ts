/**
 * get_scheme_stats — Global scheme statistics for the stats row.
 * Not tenant-scoped (ki_schemes is global).
 */

import { SkillContext } from '../../../shared/types';

interface SchemeStats {
  total_schemes: number;
  active_schemes: number;
  ended_schemes: number;
  with_nav_data: number;
  without_nav_data: number;
  stale_nav_7d: number;
  metrics_calculated: number;
  metrics_pending: number;
  recipe: 'stat-row';
}

const STATS_QUERY = `
SELECT
    COUNT(*)::integer AS total_schemes,
    COUNT(*) FILTER (WHERE s.active = true)::integer AS active_schemes,
    COUNT(*) FILTER (WHERE s.active = false)::integer AS ended_schemes,
    COUNT(DISTINCT ns.scheme_code)::integer AS with_nav_data,
    (COUNT(*) - COUNT(DISTINCT ns.scheme_code))::integer AS without_nav_data,
    COUNT(DISTINCT CASE
        WHEN ns.latest_date IS NOT NULL AND ns.latest_date < CURRENT_DATE - 7
        THEN s.scheme_code
    END)::integer AS stale_nav_7d,
    COUNT(DISTINCT CASE
        WHEN ns.has_metrics = true THEN s.scheme_code
    END)::integer AS metrics_calculated,
    COUNT(DISTINCT CASE
        WHEN ns.scheme_code IS NOT NULL AND (ns.has_metrics IS NULL OR ns.has_metrics = false)
        THEN s.scheme_code
    END)::integer AS metrics_pending
FROM ki_schemes s
LEFT JOIN LATERAL (
    SELECT
        nh.scheme_code,
        MAX(nh.nav_date) AS latest_date,
        (COUNT(nh.metrics_calculated_at) > 0) AS has_metrics
    FROM ki_nav_history nh
    WHERE nh.scheme_code = s.scheme_code
    GROUP BY nh.scheme_code
) ns ON true
`;

export async function get_scheme_stats(
  _params: Record<string, unknown>,
  ctx: SkillContext,
): Promise<SchemeStats> {
  const result = await ctx.db.query<any>(STATS_QUERY, {});
  const row = result.rows[0] || {};

  return {
    total_schemes: Number(row.total_schemes || 0),
    active_schemes: Number(row.active_schemes || 0),
    ended_schemes: Number(row.ended_schemes || 0),
    with_nav_data: Number(row.with_nav_data || 0),
    without_nav_data: Number(row.without_nav_data || 0),
    stale_nav_7d: Number(row.stale_nav_7d || 0),
    metrics_calculated: Number(row.metrics_calculated || 0),
    metrics_pending: Number(row.metrics_pending || 0),
    recipe: 'stat-row',
  };
}
