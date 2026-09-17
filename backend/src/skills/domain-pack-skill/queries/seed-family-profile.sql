-- The 1:1 talent overlay. `active_config_id` is what every reader follows to
-- find the live version, so pointing it at the config just written is what
-- makes the family usable rather than merely present.
--
-- DO NOTHING on conflict: family_id is unique, so a replay of the same take
-- lands here harmlessly. That is what makes taking a family idempotent by
-- construction rather than by a stored request key.
INSERT INTO vara_family_profile
  (tenant_id, family_id, default_threshold, active_config_id)
VALUES ($vani_tenant_id, $family_id, $threshold, $config_id)
ON CONFLICT (family_id) DO NOTHING
RETURNING id
