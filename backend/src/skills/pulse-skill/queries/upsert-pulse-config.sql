-- pulse-skill: upsert_pulse_config
-- Creates or updates the active pulse config for a client.
-- ON CONFLICT targets the partial unique index (tenant_id, client_id, is_live)
-- WHERE is_active = true, so each client can only have one active config per env.

INSERT INTO ki_pulse_config (
    tenant_id,
    is_live,
    client_id,
    contact_id,
    frequency,
    custom_days,
    template,
    medium,
    preferred_day,
    preferred_time,
    jtd_auto_schedule,
    vani_auto_brief,
    vani_include_gaps,
    client_reminder,
    assigned_to,
    is_active,
    created_by
)
VALUES (
    $tenant_id,
    $is_live,
    $client_id::INT,
    $contact_id::BIGINT,
    $frequency::TEXT,
    $custom_days::INT,
    $template::TEXT,
    $medium::TEXT,
    $preferred_day::TEXT,
    $preferred_time::TEXT,
    $jtd_auto_schedule::BOOLEAN,
    $vani_auto_brief::BOOLEAN,
    $vani_include_gaps::BOOLEAN,
    $client_reminder::BOOLEAN,
    $assigned_to::TEXT,
    true,
    $created_by::TEXT
)
ON CONFLICT (tenant_id, client_id, is_live)
    WHERE is_active = true
DO UPDATE SET
    contact_id          = COALESCE($contact_id::BIGINT,      ki_pulse_config.contact_id),
    frequency           = COALESCE($frequency::TEXT,         ki_pulse_config.frequency),
    custom_days         = COALESCE($custom_days::INT,        ki_pulse_config.custom_days),
    template            = COALESCE($template::TEXT,          ki_pulse_config.template),
    medium              = COALESCE($medium::TEXT,            ki_pulse_config.medium),
    preferred_day       = COALESCE($preferred_day::TEXT,     ki_pulse_config.preferred_day),
    preferred_time      = COALESCE($preferred_time::TEXT,    ki_pulse_config.preferred_time),
    jtd_auto_schedule   = COALESCE($jtd_auto_schedule::BOOLEAN, ki_pulse_config.jtd_auto_schedule),
    vani_auto_brief     = COALESCE($vani_auto_brief::BOOLEAN,    ki_pulse_config.vani_auto_brief),
    vani_include_gaps   = COALESCE($vani_include_gaps::BOOLEAN,  ki_pulse_config.vani_include_gaps),
    client_reminder     = COALESCE($client_reminder::BOOLEAN,    ki_pulse_config.client_reminder),
    assigned_to         = COALESCE($assigned_to::TEXT,       ki_pulse_config.assigned_to),
    updated_at          = NOW()
RETURNING
    id, tenant_id, is_live, client_id, contact_id,
    frequency, custom_days, template, medium,
    preferred_day, preferred_time,
    jtd_auto_schedule, vani_auto_brief, vani_include_gaps, client_reminder,
    assigned_to, is_active, created_at, updated_at;
