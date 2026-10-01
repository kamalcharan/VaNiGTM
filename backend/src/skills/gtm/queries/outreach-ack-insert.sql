-- Append one acknowledgement event. notice_id is required for accept and
-- NULL for revoke (CHECK ack_accept_names_notice, migration 260).
INSERT INTO vani_tenant_acknowledgement (tenant_id, kind, action, notice_id, actor_id)
VALUES (vani_current_tenant(), 'gtm_outreach_dpdp', $action, $notice_id::uuid, $actor_id::uuid)
RETURNING id, action, at;
