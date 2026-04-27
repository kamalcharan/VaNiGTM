-- get_metric_trends: time-series metrics for a campaign
-- Named params: $tenant_id, $is_live, $campaign_id, $period, $days

SELECT
    period_start,
    emails_sent, emails_opened, emails_replied, emails_clicked,
    whatsapp_sent, whatsapp_replied,
    linkedin_sent, linkedin_replied,
    open_rate, reply_rate, click_rate,
    meetings_booked, total_contacts
FROM gt_campaign_metrics
WHERE tenant_id   = $tenant_id
  AND is_live     = $is_live
  AND campaign_id = $campaign_id
  AND period      = $period
  AND period_start >= now() - ($days || ' days')::interval
ORDER BY period_start ASC;
