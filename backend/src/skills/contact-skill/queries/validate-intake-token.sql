-- validate-intake-token: look up token + tenant brand + contact pre-fill
-- Named params: $token
-- Returns one row if token is valid (active, not expired), zero rows otherwise.

SELECT
    t.id                AS token_id,
    t.tenant_id,
    t.contact_id,
    t.created_by_user_id,
    t.expires_at,
    t.status,
    t.lead_name,
    t.lead_mobile,
    t.lead_email,

    -- Tenant brand for intake page styling
    tp.display_name     AS tenant_display_name,
    tp.name             AS tenant_name,
    tp.brand_color,
    tp.theme_id,

    -- MFD who generated the link
    u.name              AS mfd_name,

    -- Contact pre-fill (Flow 1 only — NULL for Flow 2)
    c.prefix            AS contact_prefix,
    c.name              AS contact_name,
    -- Primary mobile
    (SELECT ch.channel_value
     FROM ki_contact_channels ch
     WHERE ch.contact_id = c.id
       AND ch.channel_type = 'mobile'
       AND ch.is_active = true
     ORDER BY ch.is_primary DESC, ch.id ASC
     LIMIT 1)           AS contact_mobile,
    -- Primary email
    (SELECT ch.channel_value
     FROM ki_contact_channels ch
     WHERE ch.contact_id = c.id
       AND ch.channel_type = 'email'
       AND ch.is_active = true
     ORDER BY ch.is_primary DESC, ch.id ASC
     LIMIT 1)           AS contact_email

FROM   ki_intake_tokens t
JOIN   vn_tenants       tn ON tn.id = t.tenant_id
LEFT JOIN vn_tenant_profiles tp ON tp.tenant_id = t.tenant_id
LEFT JOIN vn_users      u  ON u.id  = t.created_by_user_id
LEFT JOIN ki_contacts   c  ON c.id  = t.contact_id
WHERE  t.token    = $token
  AND  t.status   = 'active'
  AND  t.expires_at > now();
