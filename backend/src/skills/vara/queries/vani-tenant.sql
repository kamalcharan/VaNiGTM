-- vn_tenants.id → vani_tenant.id.
--
-- TWO TENANT IDS, joined by slug and never equal. The JWT carries the vn_ one;
-- every vani_*/vara_* row stores the vani_ one. Migration 240's policies
-- compared them directly and matched nothing.
--
-- Read-only on purpose: provisioning belongs to the domain step, and a skill
-- that silently created a vani_tenant would hide a tenant who never completed
-- it. No row here means "finish the Domain step first", which is a different
-- answer from "you have taken nothing".
SELECT vt.id
  FROM vani_tenant vt
  JOIN vn_tenants t ON t.slug = vt.slug
 WHERE t.id = $tenant_id
