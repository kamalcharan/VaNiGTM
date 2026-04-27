-- get_steps: all steps for a sequence with templates
-- Named params: $tenant_id, $is_live, $sequence_id

SELECT
    st.id, st.step_type, st.title, st.description,
    st.day_offset, st.wait_duration_hours,
    st.condition_type, st.condition_yes_step_id, st.condition_no_step_id,
    st.channel_id, st.total_sent, st.open_rate, st.reply_rate,
    st.sort_order,
    ch.name AS channel_name, ch.channel_type AS channel_channel_type,
    COALESCE(
        json_agg(
            json_build_object(
                'id', t.id,
                'variant_label', t.variant_label,
                'subject', t.subject,
                'body', t.body,
                'total_sent', t.total_sent,
                'open_rate', t.open_rate,
                'reply_rate', t.reply_rate,
                'click_rate', t.click_rate
            ) ORDER BY t.variant_label
        ) FILTER (WHERE t.id IS NOT NULL),
        '[]'::json
    ) AS templates
FROM gt_sequence_steps st
LEFT JOIN gt_channels ch
    ON ch.id = st.channel_id AND ch.is_live = $is_live
LEFT JOIN gt_step_templates t
    ON t.step_id = st.id AND t.is_live = $is_live AND t.is_active = true
WHERE st.sequence_id = $sequence_id
  AND st.tenant_id   = $tenant_id
  AND st.is_live     = $is_live
GROUP BY st.id, ch.name, ch.channel_type
ORDER BY st.sort_order ASC;
