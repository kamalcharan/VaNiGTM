-- v1 of a taken family's scoring contract: the pack's shape, copied verbatim.
--
-- `components` holds the must-haves and knockouts; `weights` holds the axis
-- split the family profile defaults to. Versioned from 1 and append-only — an
-- edit writes v2 and v1 stays readable, so a JD published against v1 can still
-- be explained months later.
INSERT INTO vara_scoring_config
  (tenant_id, family_id, version, weights, components, threshold_default, approved_by)
VALUES
  ($vani_tenant_id, $family_id, 1, $weights::jsonb, $components::jsonb, $threshold, $approved_by)
RETURNING id
