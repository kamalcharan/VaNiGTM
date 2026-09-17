-- Which platform pack version this tenant took, and who took it.
--
-- pack_id is a FK to one ROW of vani_domain_pack, and rows are (code, version)
-- — so this records the exact version copied. That is what later lets Vara say
-- "the industry playbook has moved on, want to look?" without ever having
-- mutated the tenant's copy.
INSERT INTO vani_tenant_pack_binding (tenant_id, pack_id, bound_by)
VALUES ($vani_tenant_id, $pack_id, $bound_by)
ON CONFLICT (tenant_id, pack_id) DO NOTHING
