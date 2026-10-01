-- Serialise accept/revoke per workspace, so two clicks (or two admins) cannot
-- interleave the "read latest → append" step. Released at COMMIT.
-- vani_tenant_id is NULL when the workspace has no vani_tenant row yet
-- (Domain step not done); the lock is then keyed on the vn_tenants id.
SELECT vani_current_tenant() AS vani_tenant_id
  FROM (SELECT pg_advisory_xact_lock(
          hashtext('gtm_outreach_dpdp:' || COALESCE(vani_current_tenant()::text, $tenant_id::text)))) AS l;
