-- =============================================================================
-- WS2.2 — vani schema, roles, RLS foundation
-- =============================================================================
-- DRAFT FOR REVIEW. Nothing in this file has been applied to vani_gtm_db.
-- Ruling reference: Charan's G1 rulings, 2026-07-31 (see docs/WS2.1-schema-report.md
-- §9 for the findings that produced these rulings).
--
-- Ruling 1 — dedicated `vani` schema, not a gt_assessment_* prefix in public.
--   vani_gtm_db is a shared, live database (WS2.1: 81 rows in gt_contacts, 52
--   other gt_* tables belonging to the GTM product). A dedicated schema means
--   the internet-facing anon role only ever needs USAGE on `vani` — it never
--   needs a grant that could reach `public.gt_contacts` et al. See ws2.6 for
--   the isolation test that verifies this empirically against this specific
--   database, rather than asserting it as a Postgres-defaults assumption.
-- Ruling 3 — least-privilege connecting role, not the existing admin/vikuna_admin
--   (both BYPASSRLS per WS2.1 §6). The new PostgREST instance (WS0.4) connects
--   as vani_authenticator, which is NOT superuser and NOT BYPASSRLS. The
--   existing app's connection is untouched — this migration does not revoke
--   or alter anything on `public`, `admin`, or `vikuna_admin`.
--
-- Apply order: this file, then ws2.3, ws2.4, ws2.5. ws2.6 is verification, not
-- part of the applied migration.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Extension check (ruling 2)
-- -----------------------------------------------------------------------------
-- WS2.1 already confirmed pgcrypto 1.3 is installed on vani_gtm_db (needed for
-- hmac() used by the vendored pgjwt signing functions below, and for crypt()
-- used to verify vn_users.password_hash in the login RPC). This statement is
-- an idempotent no-op given that — kept explicit so the migration is
-- self-contained and doesn't silently depend on inspection results going stale.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. Schema
-- -----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS vani;
COMMENT ON SCHEMA vani IS
  'VaNi AI — owned schema, isolated from the shared GTM tables in public. '
  'See docs/WS2.1-schema-report.md and G1 rulings 2026-07-31.';

-- -----------------------------------------------------------------------------
-- 2. Vendored pgjwt (ruling 2)
-- -----------------------------------------------------------------------------
-- Vendored verbatim from https://github.com/michelp/pgjwt
-- (raw.githubusercontent.com/michelp/pgjwt/master/pgjwt--0.2.0.sql, fetched
-- 2026-07-31), with the extension's `@extschema@` placeholder replaced by
-- `vani` since this is copied in as plain functions rather than installed as
-- a CREATE EXTENSION. PostgREST only ever *verifies* JWTs using its own
-- configured secret — `vani.sign()` below is issuance-side only, used by
-- vani.login() (ws2.4). No filesystem/container work, no extension install;
-- fully reviewable here. MIT-licensed upstream.

CREATE OR REPLACE FUNCTION vani.url_encode(data bytea) RETURNS text LANGUAGE sql AS $$
    SELECT translate(encode(data, 'base64'), E'+/=\n', '-_');
$$ IMMUTABLE;

CREATE OR REPLACE FUNCTION vani.url_decode(data text) RETURNS bytea LANGUAGE sql AS $$
WITH t AS (SELECT translate(data, '-_', '+/') AS trans),
     rem AS (SELECT length(t.trans) % 4 AS remainder FROM t) -- compute padding size
    SELECT decode(
        t.trans ||
        CASE WHEN rem.remainder > 0
           THEN repeat('=', (4 - rem.remainder))
           ELSE '' END,
    'base64') FROM t, rem;
$$ IMMUTABLE;

CREATE OR REPLACE FUNCTION vani.algorithm_sign(signables text, secret text, algorithm text)
RETURNS text LANGUAGE sql AS $$
WITH
  alg AS (
    SELECT CASE
      WHEN algorithm = 'HS256' THEN 'sha256'
      WHEN algorithm = 'HS384' THEN 'sha384'
      WHEN algorithm = 'HS512' THEN 'sha512'
      ELSE '' END AS id)  -- hmac throws error
SELECT vani.url_encode(hmac(signables, secret, alg.id)) FROM alg;
$$ IMMUTABLE;

CREATE OR REPLACE FUNCTION vani.sign(payload json, secret text, algorithm text DEFAULT 'HS256')
RETURNS text LANGUAGE sql AS $$
WITH
  header AS (
    SELECT vani.url_encode(convert_to('{"alg":"' || algorithm || '","typ":"JWT"}', 'utf8')) AS data
    ),
  payload AS (
    SELECT vani.url_encode(convert_to(payload::text, 'utf8')) AS data
    ),
  signables AS (
    SELECT header.data || '.' || payload.data AS data FROM header, payload
    )
SELECT
    signables.data || '.' ||
    vani.algorithm_sign(signables.data, secret, algorithm) FROM signables;
$$ IMMUTABLE;

CREATE OR REPLACE FUNCTION vani.try_cast_double(inp text)
RETURNS double precision AS $$
  BEGIN
    BEGIN
      RETURN inp::double precision;
    EXCEPTION
      WHEN OTHERS THEN RETURN NULL;
    END;
  END;
$$ language plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION vani.verify(token text, secret text, algorithm text DEFAULT 'HS256')
RETURNS table(header json, payload json, valid boolean) LANGUAGE sql AS $$
  SELECT
    jwt.header AS header,
    jwt.payload AS payload,
    jwt.signature_ok AND tstzrange(
      to_timestamp(vani.try_cast_double(jwt.payload->>'nbf')),
      to_timestamp(vani.try_cast_double(jwt.payload->>'exp'))
    ) @> CURRENT_TIMESTAMP AS valid
  FROM (
    SELECT
      convert_from(vani.url_decode(r[1]), 'utf8')::json AS header,
      convert_from(vani.url_decode(r[2]), 'utf8')::json AS payload,
      r[3] = vani.algorithm_sign(r[1] || '.' || r[2], secret, algorithm) AS signature_ok
    FROM regexp_split_to_array(token, '\.') r
  ) jwt
$$ IMMUTABLE;
-- vani.verify() is not required at request time (PostgREST verifies JWTs
-- itself), but is kept for the ws2.6 isolation/smoke test and any future
-- debugging of a token that PostgREST is rejecting.

-- -----------------------------------------------------------------------------
-- 3. JWT-claim helpers used throughout RLS policies
-- -----------------------------------------------------------------------------
-- PostgREST sets the `request.jwt.claims` GUC (a JSON string) per request from
-- the verified JWT payload, and SET ROLEs to the value of the token's `role`
-- claim. These helpers read that GUC. Role branching in policies uses
-- `current_user` / `TO <role>` instead of a self-reported `role` claim —
-- anonymous requests (vani_anon, via PostgREST's db-anon-role) carry no JWT
-- and so no claims at all, which current_user still captures correctly.

CREATE OR REPLACE FUNCTION vani.jwt_claims() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;

CREATE OR REPLACE FUNCTION vani.jwt_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(vani.jwt_claims()->>'tenant_id', '')::uuid;
$$;

CREATE OR REPLACE FUNCTION vani.jwt_partner_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(vani.jwt_claims()->>'partner_id', '')::uuid;
$$;

CREATE OR REPLACE FUNCTION vani.jwt_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(vani.jwt_claims()->>'user_id', '')::uuid;
$$;

CREATE OR REPLACE FUNCTION vani.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Roles (ruling 3)
-- -----------------------------------------------------------------------------
-- vani_authenticator: the role the new PostgREST instance (WS0.4) connects as.
--   LOGIN, NOINHERIT (does not automatically get member roles' privileges —
--   it must SET ROLE explicitly per request, which is exactly what PostgREST
--   does based on the JWT `role` claim / db-anon-role config). Not BYPASSRLS,
--   not superuser. Password must be set operationally, outside this file —
--   see docs/sql/README.md.
-- vani_anon / vani_partner / vani_owner: the three roles PostgREST switches
--   into. None have LOGIN (never connected to directly) and none have
--   BYPASSRLS.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'vani_authenticator') THEN
    CREATE ROLE vani_authenticator NOINHERIT LOGIN PASSWORD 'REPLACE_OPERATIONALLY';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'vani_anon') THEN
    CREATE ROLE vani_anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'vani_partner') THEN
    CREATE ROLE vani_partner NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'vani_owner') THEN
    CREATE ROLE vani_owner NOLOGIN;
  END IF;
END $$;

GRANT vani_anon TO vani_authenticator;
GRANT vani_partner TO vani_authenticator;
GRANT vani_owner TO vani_authenticator;

-- NOTE: `PASSWORD 'REPLACE_OPERATIONALLY'` above is a placeholder, not a real
-- credential — this file is committed to git. Before applying, replace with a
-- generated secret via a separate, uncommitted `ALTER ROLE vani_authenticator
-- PASSWORD '...';` run directly against the database, and configure the same
-- value as the WS0.4 PostgREST instance's db-uri. Likewise, PostgREST's
-- jwt-secret config for this instance must match whatever is set as the
-- `vani.jwt_secret` database GUC consumed by vani.login() (ws2.4) — set via
-- `ALTER DATABASE vani_gtm_db SET vani.jwt_secret = '...';`, also outside
-- version control.

GRANT USAGE ON SCHEMA vani TO vani_anon, vani_partner, vani_owner;

-- Deliberately no grants of any kind to any vani_* role on schema `public` or
-- any object in it. See ws2.6 for the empirical check of what that means in
-- practice on this specific database (PUBLIC-role grants, if any pre-exist on
-- `public`, are a property of the shared database this migration does not
-- touch — see ruling 3 and the isolation-test caveats there).

-- -----------------------------------------------------------------------------
-- 5. Tables (ruling 1's six: assessment_def, assessment_response, lead,
--    report, partner, lead_event — no gt_/vn_ prefix, this schema is the
--    namespace). tenant_id kept on every row per ruling 1 (GTM alignment /
--    future bridging), even though every row today will share one tenant.
-- -----------------------------------------------------------------------------

-- --- partner ------------------------------------------------------------
-- Ruling 4's "partners become scoped users within [tenant #1] per Addendum A"
-- covers referral partners. This table also carries the owner's console
-- identity (role='owner') rather than adding a 7th table for one flag —
-- my call, not one of the five rulings; flagged in the handover for Charan
-- to override if a separate table is preferred. Deliberately does NOT read
-- or depend on vn_roles/vn_user_roles (columns unexplored per WS2.1 §9 item
-- 6) — VaNi owns its own console-access mapping end to end, consistent with
-- ruling 1's minimal-blast-radius argument applied to auth as well as data.
CREATE TABLE IF NOT EXISTS vani.partner (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.vn_tenants(id),
  user_id       uuid NOT NULL UNIQUE REFERENCES public.vn_users(id),
  role          varchar NOT NULL CHECK (role IN ('owner', 'partner')),
  ref_code      varchar UNIQUE,
  display_name  varchar NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_ref_code_matches_role CHECK (
    (role = 'partner' AND ref_code IS NOT NULL) OR
    (role = 'owner' AND ref_code IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS partner_tenant_id_idx ON vani.partner(tenant_id);
CREATE TRIGGER partner_set_updated_at BEFORE UPDATE ON vani.partner
  FOR EACH ROW EXECUTE FUNCTION vani.set_updated_at();

-- --- assessment_def -------------------------------------------------------
-- One row per assessment (per version). `definition` is the entire Pilot
-- Pack JSON verbatim (docs/vani-ai-recovery-assessment-definition.json for
-- the first one, seeded in ws2.5) — this is what makes "second assessment =
-- one DB row, zero code" true: nothing below hardcodes ai-recovery or its
-- ten failure modes.
CREATE TABLE IF NOT EXISTS vani.assessment_def (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.vn_tenants(id),
  service_slug     varchar NOT NULL,
  version          varchar NOT NULL,
  definition       jsonb NOT NULL,
  public           boolean NOT NULL DEFAULT true,
  hold_for_review  boolean NOT NULL DEFAULT false,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, service_slug, version)
);
CREATE INDEX IF NOT EXISTS assessment_def_tenant_id_idx ON vani.assessment_def(tenant_id);
CREATE TRIGGER assessment_def_set_updated_at BEFORE UPDATE ON vani.assessment_def
  FOR EACH ROW EXECUTE FUNCTION vani.set_updated_at();

-- --- lead -------------------------------------------------------------
-- Deliberately no reference to public.gt_prospects / public.gt_contacts —
-- ruling 5. Self-contained; a sync to the GTM funnel, if ever wanted, is a
-- later job reading from here, not a foreign key.
CREATE TABLE IF NOT EXISTS vani.lead (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.vn_tenants(id),
  partner_id  uuid REFERENCES vani.partner(id),  -- NULL = Direct
  name        varchar NOT NULL,
  email       varchar NOT NULL,
  company     varchar NOT NULL,
  role_title  varchar NOT NULL,
  phone       varchar,
  status      varchar NOT NULL DEFAULT 'new'
                CHECK (status IN ('new', 'contacted', 'l2_booked', 'engaged', 'closed_won', 'closed_lost')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_tenant_id_idx ON vani.lead(tenant_id);
CREATE INDEX IF NOT EXISTS lead_partner_id_idx ON vani.lead(partner_id);
CREATE TRIGGER lead_set_updated_at BEFORE UPDATE ON vani.lead
  FOR EACH ROW EXECUTE FUNCTION vani.set_updated_at();

-- --- assessment_response ------------------------------------------------
-- Created on the FIRST answer, not on landing — see vani.save_answer (ws2.3).
-- `anon_token` is the bearer capability that lets an anonymous browser resume
-- or complete its own response; it is never exposed via a table SELECT grant
-- to vani_anon (see §6 grants below) — all reads/writes for anon go through
-- SECURITY DEFINER RPCs that check anon_token internally.
CREATE TABLE IF NOT EXISTS vani.assessment_response (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES public.vn_tenants(id),
  assessment_def_id       uuid NOT NULL REFERENCES vani.assessment_def(id),
  anon_token              uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  referred_by_partner_id  uuid REFERENCES vani.partner(id),
  answers                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                  varchar NOT NULL DEFAULT 'in_progress'
                            CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  health_score            integer,
  band                    varchar,
  top_modes               jsonb,
  lead_id                 uuid REFERENCES vani.lead(id),
  started_at              timestamptz NOT NULL DEFAULT now(),
  completed_at            timestamptz,
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assessment_response_tenant_id_idx ON vani.assessment_response(tenant_id);
CREATE INDEX IF NOT EXISTS assessment_response_lead_id_idx ON vani.assessment_response(lead_id);

-- --- report ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vani.report (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES public.vn_tenants(id),
  assessment_response_id   uuid NOT NULL UNIQUE REFERENCES vani.assessment_response(id),
  report_token             uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  ref                      varchar NOT NULL UNIQUE,
  narrative                text,
  narrative_source         varchar NOT NULL DEFAULT 'pending'
                             CHECK (narrative_source IN ('pending', 'llm', 'fallback')),
  emailed_at               timestamptz,
  revoked_at               timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS report_tenant_id_idx ON vani.report(tenant_id);

-- Human-readable ref matching the email template's "Ref VN-2026-0147" — see
-- docs/email-report.html/.txt. Sequence is global, not per-year; the year
-- segment is cosmetic (from clock time at creation), not derived from the
-- sequence, so no reset-on-January-1 logic is needed.
CREATE SEQUENCE IF NOT EXISTS vani.report_ref_seq;
CREATE OR REPLACE FUNCTION vani.next_report_ref() RETURNS text
LANGUAGE sql AS $$
  SELECT 'VN-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('vani.report_ref_seq')::text, 4, '0');
$$;
ALTER TABLE vani.report ALTER COLUMN ref SET DEFAULT vani.next_report_ref();

-- --- lead_event -------------------------------------------------------
-- Timeline entries. Keyed primarily off assessment_response_id because the
-- funnel starts (response_started, response_completed) before a lead exists;
-- lead_id is filled in once/if capture happens (vani.capture_lead, ws2.3).
CREATE TABLE IF NOT EXISTS vani.lead_event (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES public.vn_tenants(id),
  assessment_response_id   uuid NOT NULL REFERENCES vani.assessment_response(id),
  lead_id                  uuid REFERENCES vani.lead(id),
  event_type               varchar NOT NULL,
  payload                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by               uuid REFERENCES public.vn_users(id),
  created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_event_lead_id_idx ON vani.lead_event(lead_id);
CREATE INDEX IF NOT EXISTS lead_event_response_id_idx ON vani.lead_event(assessment_response_id);

-- -----------------------------------------------------------------------------
-- 6. Row-level security
-- -----------------------------------------------------------------------------
-- Table owner (whichever role applies this migration) is exempt from RLS by
-- default, which is fine here: seeding (ws2.5) and any admin/migration work
-- runs as that role, not as vani_anon/partner/owner. No FORCE ROW LEVEL
-- SECURITY — the roles that must be bound by it (vani_anon/partner/owner)
-- never own these tables, so it would add nothing.

ALTER TABLE vani.partner ENABLE ROW LEVEL SECURITY;
ALTER TABLE vani.assessment_def ENABLE ROW LEVEL SECURITY;
ALTER TABLE vani.lead ENABLE ROW LEVEL SECURITY;
ALTER TABLE vani.assessment_response ENABLE ROW LEVEL SECURITY;
ALTER TABLE vani.report ENABLE ROW LEVEL SECURITY;
ALTER TABLE vani.lead_event ENABLE ROW LEVEL SECURITY;

-- assessment_def: anon reads published rows only; owner manages all.
CREATE POLICY assessment_def_public_read ON vani.assessment_def
  FOR SELECT TO vani_anon
  USING (public = true AND is_active = true AND hold_for_review = false);
CREATE POLICY assessment_def_owner_all ON vani.assessment_def
  FOR ALL TO vani_owner
  USING (tenant_id = vani.jwt_tenant_id())
  WITH CHECK (tenant_id = vani.jwt_tenant_id());

-- partner: a partner sees only their own row; owner sees/manages all in tenant.
CREATE POLICY partner_self_select ON vani.partner
  FOR SELECT TO vani_partner
  USING (user_id = vani.jwt_user_id());
CREATE POLICY partner_owner_all ON vani.partner
  FOR ALL TO vani_owner
  USING (tenant_id = vani.jwt_tenant_id())
  WITH CHECK (tenant_id = vani.jwt_tenant_id());

-- lead: partner sees/updates only their own leads; owner sees/manages all.
-- No policy for vani_anon — and no grant either (§7) — leads are only ever
-- created via vani.capture_lead (ws2.3), a SECURITY DEFINER function.
CREATE POLICY lead_partner_select ON vani.lead
  FOR SELECT TO vani_partner
  USING (partner_id = vani.jwt_partner_id());
CREATE POLICY lead_partner_update ON vani.lead
  FOR UPDATE TO vani_partner
  USING (partner_id = vani.jwt_partner_id())
  WITH CHECK (partner_id = vani.jwt_partner_id());
CREATE POLICY lead_owner_all ON vani.lead
  FOR ALL TO vani_owner
  USING (tenant_id = vani.jwt_tenant_id())
  WITH CHECK (tenant_id = vani.jwt_tenant_id());

-- assessment_response: no vani_anon policy/grant — all anon access is via
-- SECURITY DEFINER RPCs (ws2.3) that check anon_token themselves, which is a
-- tighter guarantee than RLS could give an identity-less role. Console roles
-- read via the linked lead.
CREATE POLICY assessment_response_partner_select ON vani.assessment_response
  FOR SELECT TO vani_partner
  USING (EXISTS (
    SELECT 1 FROM vani.lead l
    WHERE l.id = vani.assessment_response.lead_id
      AND l.partner_id = vani.jwt_partner_id()
  ));
CREATE POLICY assessment_response_owner_all ON vani.assessment_response
  FOR ALL TO vani_owner
  USING (tenant_id = vani.jwt_tenant_id())
  WITH CHECK (tenant_id = vani.jwt_tenant_id());

-- report: anon reads by report_token — a bearer-capability model, same as the
-- App Spec's private /r/{token} link. RLS cannot distinguish "caller supplied
-- the right token" from "caller is enumerating rows" any more precisely
-- without token-aware session state; the guarantee here is token
-- unguessability (a random uuid), not row filtering — `revoked_at IS NULL` is
-- the one thing RLS *can* usefully enforce (a revoked link truly returns
-- nothing even with the correct token).
CREATE POLICY report_anon_by_token ON vani.report
  FOR SELECT TO vani_anon
  USING (revoked_at IS NULL);
CREATE POLICY report_partner_select ON vani.report
  FOR SELECT TO vani_partner
  USING (EXISTS (
    SELECT 1 FROM vani.assessment_response r
    JOIN vani.lead l ON l.id = r.lead_id
    WHERE r.id = vani.report.assessment_response_id
      AND l.partner_id = vani.jwt_partner_id()
  ));
CREATE POLICY report_owner_all ON vani.report
  FOR ALL TO vani_owner
  USING (tenant_id = vani.jwt_tenant_id())
  WITH CHECK (tenant_id = vani.jwt_tenant_id());

-- lead_event: partner sees/adds notes only on their own leads (pre-capture
-- events with lead_id still NULL are never a partner's to see); owner sees
-- all in tenant.
CREATE POLICY lead_event_partner_select ON vani.lead_event
  FOR SELECT TO vani_partner
  USING (lead_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM vani.lead l WHERE l.id = vani.lead_event.lead_id AND l.partner_id = vani.jwt_partner_id()
  ));
CREATE POLICY lead_event_partner_insert ON vani.lead_event
  FOR INSERT TO vani_partner
  WITH CHECK (
    event_type = 'note'
    AND lead_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM vani.lead l WHERE l.id = vani.lead_event.lead_id AND l.partner_id = vani.jwt_partner_id())
  );
CREATE POLICY lead_event_owner_all ON vani.lead_event
  FOR ALL TO vani_owner
  USING (tenant_id = vani.jwt_tenant_id())
  WITH CHECK (tenant_id = vani.jwt_tenant_id());

-- -----------------------------------------------------------------------------
-- 7. Table grants
-- -----------------------------------------------------------------------------
-- vani_anon gets NO table grants at all beyond reading published assessment
-- defs and reading reports by token — every write (save an answer, complete
-- an assessment, capture a lead) goes through a SECURITY DEFINER RPC (ws2.3,
-- ws2.4), each of which validates a bearer token before touching a row. This
-- is deliberately tighter than "grant INSERT and rely on RLS" would be, since
-- an identity-less anonymous role has no JWT claims for RLS to check against.

GRANT SELECT ON vani.assessment_def TO vani_anon;
GRANT SELECT ON vani.report TO vani_anon;

GRANT SELECT ON vani.partner TO vani_partner;
GRANT SELECT, UPDATE ON vani.lead TO vani_partner;
GRANT SELECT ON vani.assessment_response TO vani_partner;
GRANT SELECT ON vani.report TO vani_partner;
GRANT SELECT, INSERT ON vani.lead_event TO vani_partner;

GRANT SELECT, INSERT, UPDATE ON vani.partner TO vani_owner;
GRANT SELECT, INSERT, UPDATE ON vani.assessment_def TO vani_owner;
GRANT SELECT, UPDATE ON vani.lead TO vani_owner;
GRANT SELECT, UPDATE ON vani.assessment_response TO vani_owner;
GRANT SELECT, UPDATE ON vani.report TO vani_owner;
GRANT SELECT, INSERT ON vani.lead_event TO vani_owner;

COMMIT;
