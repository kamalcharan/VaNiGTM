-- This workspace's DPDP outreach acknowledgements, newest first. The first
-- row is the one in force (append-only: latest row decides, D9-e).
-- vani_current_tenant() bridges the JWT's vn_tenants id to vani_tenant.id
-- (migration 248); RLS on vani_tenant_acknowledgement applies the same rule.
SELECT a.id, a.action, a.at, a.notice_id, t.version AS notice_version,
       u.name AS actor_name, u.email AS actor_email
  FROM vani_tenant_acknowledgement a
  LEFT JOIN vani_consent_text t ON t.id = a.notice_id
  LEFT JOIN vn_users u ON u.id = a.actor_id AND u.tenant_id = $tenant_id
 WHERE a.tenant_id = vani_current_tenant()
   AND a.kind = 'gtm_outreach_dpdp'
 ORDER BY a.at DESC, a.id DESC
 LIMIT 20;
