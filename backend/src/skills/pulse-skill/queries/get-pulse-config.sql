-- pulse-skill: get_pulse_config
-- Returns the active pulse config for a specific client, if one exists.

SELECT
    pc.id,
    pc.tenant_id,
    pc.is_live,
    pc.client_id,
    pc.contact_id,
    pc.frequency,
    pc.custom_days,
    pc.template,
    pc.medium,
    pc.preferred_day,
    pc.preferred_time,
    pc.jtd_auto_schedule,
    pc.vani_auto_brief,
    pc.vani_include_gaps,
    pc.client_reminder,
    pc.assigned_to,
    pc.is_active,
    pc.created_at,
    pc.updated_at
FROM  ki_pulse_config pc
WHERE pc.tenant_id = $tenant_id
  AND pc.is_live   = $is_live
  AND pc.client_id = $client_id::INT
  AND pc.is_active = true
LIMIT 1;
