-- The tenant's edit, as a NEW version of their family's shape.
--
-- Append-only (V-14): v1 stays readable, so a JD published against it can
-- still be explained months later. `approved_by` is the person who made the
-- change — the schema asks for a named human, and "who set this bar" is the
-- first question after a rejected candidate complains.
--
-- max(version)+1 scoped to (tenant, family) because the unique key is
-- (tenant_id, family_id, version); two tenants' families never collide.
INSERT INTO vara_scoring_config
  (tenant_id, family_id, version, weights, components, threshold_default, approved_by)
SELECT $vani_tenant_id, $family_id,
       COALESCE(MAX(version), 0) + 1,
       $weights::jsonb, $components::jsonb, $threshold, $approved_by
  FROM vara_scoring_config
 WHERE tenant_id = $vani_tenant_id AND family_id = $family_id
RETURNING id, version
