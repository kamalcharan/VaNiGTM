-- ════════════════════════════════════════════════════════════════════════════
-- 013_vn_users_identity.sql
-- Adds identity columns to vn_users that auth.service.register() expects
-- but were missing from the original 001_vn_foundation schema:
--   - first_name, last_name (split name for display + personalization)
--   - country_code, mobile (separate fields per CLAUDE.md lesson #5)
-- All nullable — registration sets them, legacy rows can stay NULL.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

ALTER TABLE vn_users ADD COLUMN IF NOT EXISTS first_name   VARCHAR(100);
ALTER TABLE vn_users ADD COLUMN IF NOT EXISTS last_name    VARCHAR(100);
ALTER TABLE vn_users ADD COLUMN IF NOT EXISTS country_code VARCHAR(5);
ALTER TABLE vn_users ADD COLUMN IF NOT EXISTS mobile       VARCHAR(20);

COMMENT ON COLUMN vn_users.first_name   IS 'Given name. Set by auth.service.register() from the user input.';
COMMENT ON COLUMN vn_users.last_name    IS 'Family name. Optional — empty string is valid.';
COMMENT ON COLUMN vn_users.country_code IS 'ISO country code from VdfMobileInput (e.g. IN, US). Paired with mobile.';
COMMENT ON COLUMN vn_users.mobile       IS 'Mobile number digits only, no country prefix. Validated per country in constants/countries.ts.';

COMMIT;
