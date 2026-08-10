-- =============================================================================
-- WS2.4 — vani.login() RPC
-- =============================================================================
-- DRAFT FOR REVIEW. Depends on ws2.2 (vani.sign, roles) having been applied.
-- Nothing here has been applied to vani_gtm_db.
--
-- Replaces the App Spec's vn_login() — same shape (email+password in,
-- JWT+role+partner_id out), but implemented in the vani schema against
-- vani.partner for role/partner_id rather than vn_roles/vn_user_roles, whose
-- columns WS2.1 didn't inspect (see docs/WS2.1-schema-report.md §9 item 6).
-- Deliberately not coupling to that unexplored structure — VaNi owns its own
-- console-access mapping (vani.partner.role), consistent with keeping VaNi's
-- footprint self-contained wherever the ruling already established that
-- principle for data (ruling 5).
--
-- Still reads FROM public.vn_users (email, password_hash, is_active,
-- locked_until, failed_login_count) — that table is not touched structurally,
-- only read, and this function's own login-throttling writes back to it
-- (failed_login_count / locked_until / last_login_at) using the same columns
-- the App Spec already expects an auth RPC to maintain.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION vani.login(p_email text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vani, pg_temp
AS $$
DECLARE
  v_user public.vn_users%ROWTYPE;
  v_access vani.partner%ROWTYPE;
  v_secret text := current_setting('vani.jwt_secret', true);
  v_claims jsonb;
  v_token text;
BEGIN
  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE EXCEPTION 'vani.jwt_secret is not configured on this database' USING ERRCODE = 'P0003';
  END IF;

  SELECT * INTO v_user FROM public.vn_users
    WHERE lower(email) = lower(p_email) AND is_active;

  IF NOT FOUND OR (v_user.locked_until IS NOT NULL AND v_user.locked_until > now()) THEN
    RAISE EXCEPTION 'invalid credentials' USING ERRCODE = 'P0001';
  END IF;

  IF v_user.password_hash IS NULL OR crypt(p_password, v_user.password_hash) <> v_user.password_hash THEN
    UPDATE public.vn_users
      SET failed_login_count = failed_login_count + 1,
          locked_until = CASE WHEN failed_login_count + 1 >= 5
                               THEN now() + interval '15 minutes'
                               ELSE locked_until END
      WHERE id = v_user.id;
    RAISE EXCEPTION 'invalid credentials' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_access FROM vani.partner WHERE user_id = v_user.id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'this account has no VaNi console access' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.vn_users SET failed_login_count = 0, last_login_at = now() WHERE id = v_user.id;

  v_claims := jsonb_build_object(
    'role', CASE v_access.role WHEN 'owner' THEN 'vani_owner' ELSE 'vani_partner' END,
    'user_id', v_user.id,
    'tenant_id', v_access.tenant_id,
    'partner_id', CASE WHEN v_access.role = 'partner' THEN v_access.id ELSE NULL END,
    'exp', extract(epoch FROM now() + interval '12 hours')::int
  );

  v_token := vani.sign(v_claims, v_secret, 'HS256');

  RETURN jsonb_build_object(
    'token', v_token,
    'role', v_access.role,
    'name', v_user.name,
    'email', v_user.email
  );
END;
$$;

REVOKE ALL ON FUNCTION vani.login(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION vani.login(text, text) TO vani_anon;

COMMIT;

-- Operational note (not part of the migration): `vani.jwt_secret` is a custom
-- Postgres GUC, set outside version control via:
--   ALTER DATABASE vani_gtm_db SET vani.jwt_secret = '<generated secret>';
-- The WS0.4 PostgREST instance's own jwt-secret config must be set to the
-- exact same value, since PostgREST verifies what vani.sign() issues.
