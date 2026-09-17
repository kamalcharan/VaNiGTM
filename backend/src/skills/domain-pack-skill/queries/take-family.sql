-- One family copied out of the platform catalogue into the tenant's space.
--
-- COPY, never reference. The tenant edits their copy and the industry pack is
-- untouched; a later pack version does not silently rewrite what they decided
-- (user ruling, 2026-09-17: "enrichment is global data ... tenant copies to
-- his own tenant workspace and modifies -- global wont").
--
-- ON CONFLICT DO UPDATE rather than DO NOTHING so the row is returned either
-- way: the caller needs the id whether it just created the family or found one
-- the tenant had already taken.
INSERT INTO vani_role_family (tenant_id, name, description)
VALUES ($vani_tenant_id, $name, $description)
ON CONFLICT (tenant_id, name) DO UPDATE
  SET description = COALESCE(vani_role_family.description, EXCLUDED.description)
RETURNING id, (xmax = 0) AS created
