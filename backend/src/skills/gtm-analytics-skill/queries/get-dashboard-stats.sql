-- get_dashboard_stats: top-level KPIs across all active campaigns
-- Named params: $tenant_id, $is_live

SELECT
    COALESCE(ca.total_contacts, 0)::int    AS total_contacts,
    COALESCE(ca.total_engaged, 0)::int     AS total_engaged,
    CASE WHEN COALESCE(ch.total_sent, 0) > 0
         THEN ROUND(COALESCE(ch.total_replied, 0)::numeric / ch.total_sent * 100, 1)
         ELSE 0 END                        AS reply_rate_pct,
    COALESCE(mb.meetings, 0)::int          AS meetings_booked,
    COALESCE(ac.cnt, 0)::int               AS active_campaigns,
    COALESCE(sq.cnt, 0)::int               AS active_sequences,
    COALESCE(ag.cnt, 0)::int               AS recent_agent_runs
FROM
    (SELECT COUNT(*)::int AS total_contacts,
            COUNT(*) FILTER (WHERE stage IN ('engaged','interested','qualified','converted'))::int AS total_engaged
     FROM gt_contact_assignments WHERE tenant_id = $tenant_id AND is_live = $is_live) ca,
    (SELECT SUM(total_sent)::int AS total_sent, SUM(total_replies)::int AS total_replied
     FROM gt_channels WHERE tenant_id = $tenant_id AND is_live = $is_live AND is_active = true) ch,
    (SELECT COUNT(*)::int AS meetings
     FROM gt_activity_feed WHERE tenant_id = $tenant_id AND is_live = $is_live AND event_type = 'meeting_booked'
       AND created_at > now() - interval '30 days') mb,
    (SELECT COUNT(*)::int AS cnt
     FROM gt_campaigns WHERE tenant_id = $tenant_id AND is_live = $is_live AND is_active = true AND status = 'active') ac,
    (SELECT COUNT(*)::int AS cnt
     FROM gt_sequences WHERE tenant_id = $tenant_id AND is_live = $is_live AND is_active = true AND status = 'live') sq,
    (SELECT COUNT(*)::int AS cnt
     FROM gt_agent_runs WHERE tenant_id = $tenant_id AND is_live = $is_live
       AND created_at > now() - interval '24 hours') ag;
