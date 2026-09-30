-- ============================================================================
-- Migration 260: consent wording, suppression, and the tenant's DPDP
-- acknowledgement (POA D9)
--
-- Design and every decision: documents/design-notes-consent.md (§6, §6a–c).
-- Approved in principle by Charan on 2026-09-30; THIS FILE is written for his
-- review and is not applied until he says so. Apply on the VPS with
-- `docker exec vani-backend node dist/migrate.js` (DEPLOY.md §4).
--
-- ── WHAT IT ADDS ───────────────────────────────────────────────────────────
--
--   vani_consent_text            the exact words a person or tenant agreed to,
--                                versioned. Tenant-authored (candidate consent)
--                                or platform-authored (tenant_id NULL: the DPDP
--                                outreach notice).
--   vani_suppression             "do not contact": one address (as a keyed hash),
--                                one channel or all, one agent or all, one
--                                tenant or platform-wide. Events, not flags.
--   vani_tenant_acknowledgement  the tenant's "I agree" to the DPDP notice that
--                                switches GTM sending on, and its revocation.
--
-- All three are APPEND-ONLY (vani_forbid_mutation): "were we allowed to send
-- this, on that date?" must stay answerable after the fact. Current state is
-- always the latest row.
--
-- ── WHAT IT DOES NOT TOUCH ─────────────────────────────────────────────────
--
-- vara_consent (241) is kept as it is. Its consent_version holds the id of a
-- vani_consent_text row. No existing table, column or policy changes, and
-- nothing reads these tables until the gate (comms/may-contact.ts) is built,
-- so applying this changes no behaviour.
--
-- ── AGENTS ARE CODES, NOT A FOREIGN KEY ────────────────────────────────────
--
-- vani_agent holds only 'vara' today; GTM's status in the console's agent
-- list is derived elsewhere (skills/agents/functions/list.ts). Seeding 'gtm'
-- there would change what that list shows, so agent scope is a checked code:
-- a person can opt out of GTM marketing and keep a Vara job application open
-- (Charan, 2026-09-30: "agent-wise blocking").
--
-- ── RLS ────────────────────────────────────────────────────────────────────
--
-- Tenant ids are vani_tenant.id (D9-c), policies use vani_current_tenant()
-- (248). Platform rows (tenant_id NULL) are READABLE by every tenant and
-- WRITABLE by none — the migration-235 pattern. Platform-wide suppression is
-- written only through vani_suppress_platform(), SECURITY DEFINER, which
-- accepts only the reasons D9-a made platform-wide. ENABLE, not FORCE, like
-- the rest of the vani_ spine: the runtime role is not the owner, so every
-- policy applies to it; the owner (migrations, the definer function) is not
-- the app.
--
-- Guarded and idempotent: IF NOT EXISTS throughout, DROP POLICY/TRIGGER IF
-- EXISTS before create, CREATE OR REPLACE for functions.
-- ============================================================================

DO $$
DECLARE missing TEXT;
BEGIN
  SELECT string_agg(o, ', ') INTO missing
    FROM unnest(ARRAY['public.vani_tenant']) AS o
   WHERE to_regclass(o) IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION '[260] missing prerequisite table(s): %', missing;
  END IF;
  IF to_regprocedure('public.vani_forbid_mutation()') IS NULL
     OR to_regprocedure('public.vani_current_tenant()') IS NULL THEN
    RAISE EXCEPTION '[260] missing vani_forbid_mutation() or vani_current_tenant() (migrations 240, 248)';
  END IF;
END $$;

BEGIN;

-- ── 1. vani_consent_text ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vani_consent_text (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        REFERENCES vani_tenant(id) ON DELETE CASCADE,  -- NULL = platform-authored
  agent_code        text        NOT NULL CHECK (agent_code IN ('vara','gtm','edge','nova')),
  kind              text        NOT NULL CHECK (kind IN ('candidate_consent','outreach_notice')),
  version           int         NOT NULL CHECK (version >= 1),
  body              text        NOT NULL CHECK (length(btrim(body)) > 0),     -- the exact words shown
  retention_months  int         CHECK (retention_months BETWEEN 1 AND 120),   -- candidate consent only
  published_at      timestamptz NOT NULL DEFAULT now(),
  published_by      uuid,                                                    -- vani_user; NULL = platform
  CONSTRAINT consent_text_retention_for_candidates
    CHECK ((kind = 'candidate_consent') = (retention_months IS NOT NULL))
);

-- One version number per (tenant, agent, kind); platform rows have their own
-- sequence. Two partial indexes because a NULL tenant never equals another.
CREATE UNIQUE INDEX IF NOT EXISTS uq_consent_text_tenant
  ON vani_consent_text (tenant_id, agent_code, kind, version) WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_consent_text_platform
  ON vani_consent_text (agent_code, kind, version) WHERE tenant_id IS NULL;

COMMENT ON TABLE vani_consent_text IS
  'The exact consent or notice wording, versioned and append-only. vara_consent.consent_version and vani_tenant_acknowledgement.notice_id point here (D9, design-notes-consent.md).';

-- ── 2. vani_suppression ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vani_suppression (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        REFERENCES vani_tenant(id) ON DELETE CASCADE,  -- NULL = platform-wide
  agent_code       text        CHECK (agent_code IN ('vara','gtm','edge','nova')), -- NULL = every agent
  channel          text        NOT NULL CHECK (channel IN
                                 ('email','sms','whatsapp','call','linkedin','x','all')),
  identifier_kind  text        NOT NULL CHECK (identifier_kind IN ('email','phone','profile_url','domain')),
  identifier_hash  text        NOT NULL CHECK (identifier_hash ~ '^[0-9a-f]{64}$'), -- HMAC-SHA256 hex (D9-b)
  action           text        NOT NULL CHECK (action IN ('suppress','lift')),
  reason           text        NOT NULL CHECK (reason IN
                                 ('unsubscribed','bounced','complained','manual','never_contact',
                                  'consent_withdrawn','erasure','reconsented','admin_lift')),
  source           text        NOT NULL CHECK (length(btrim(source)) > 0),
  actor_type       text        NOT NULL CHECK (actor_type IN ('human','subject','rule','system')),
  actor_id         uuid,
  at               timestamptz NOT NULL DEFAULT now(),
  -- A lift says why; a suppress never carries a lift reason and vice versa.
  CONSTRAINT suppression_reason_matches_action CHECK (
    (action = 'lift')     = (reason IN ('reconsented','admin_lift'))
  )
);

CREATE INDEX IF NOT EXISTS idx_suppression_lookup
  ON vani_suppression (identifier_hash, channel, at DESC);
CREATE INDEX IF NOT EXISTS idx_suppression_tenant
  ON vani_suppression (tenant_id, at DESC);

COMMENT ON TABLE vani_suppression IS
  'Do-not-contact events, append-only. Latest row per (tenant scope, agent scope, channel, identifier) decides. Holds a keyed hash, never the address, so it survives an erasure (D9, design-notes-consent.md).';

-- ── 3. vani_tenant_acknowledgement ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vani_tenant_acknowledgement (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES vani_tenant(id) ON DELETE CASCADE,
  kind       text        NOT NULL CHECK (kind IN ('gtm_outreach_dpdp')),
  action     text        NOT NULL CHECK (action IN ('accept','revoke')),
  notice_id  uuid        REFERENCES vani_consent_text(id),   -- the notice shown; required to accept
  actor_id   uuid        NOT NULL,                           -- the user who ticked or unticked
  at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ack_accept_names_notice CHECK ((action = 'accept') = (notice_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_tenant_ack_latest
  ON vani_tenant_acknowledgement (tenant_id, kind, at DESC);

COMMENT ON TABLE vani_tenant_acknowledgement IS
  'The tenant''s "I agree" to the DPDP outreach notice (switches GTM sending on) and its revocation from Settings. Append-only; latest row decides (D9-e).';

-- ── 4. Append-only guards ──────────────────────────────────────────────────

DROP TRIGGER IF EXISTS consent_text_append_only ON vani_consent_text;
CREATE TRIGGER consent_text_append_only BEFORE UPDATE OR DELETE ON vani_consent_text
  FOR EACH ROW EXECUTE FUNCTION vani_forbid_mutation();

DROP TRIGGER IF EXISTS suppression_append_only ON vani_suppression;
CREATE TRIGGER suppression_append_only BEFORE UPDATE OR DELETE ON vani_suppression
  FOR EACH ROW EXECUTE FUNCTION vani_forbid_mutation();

DROP TRIGGER IF EXISTS tenant_ack_append_only ON vani_tenant_acknowledgement;
CREATE TRIGGER tenant_ack_append_only BEFORE UPDATE OR DELETE ON vani_tenant_acknowledgement
  FOR EACH ROW EXECUTE FUNCTION vani_forbid_mutation();

-- ── 5. RLS ─────────────────────────────────────────────────────────────────

ALTER TABLE vani_consent_text           ENABLE ROW LEVEL SECURITY;
ALTER TABLE vani_suppression            ENABLE ROW LEVEL SECURITY;
ALTER TABLE vani_tenant_acknowledgement ENABLE ROW LEVEL SECURITY;

-- Read: own rows and platform rows.
DROP POLICY IF EXISTS consent_text_read ON vani_consent_text;
CREATE POLICY consent_text_read ON vani_consent_text FOR SELECT
  USING (tenant_id = vani_current_tenant() OR tenant_id IS NULL);
-- Write: own rows only (a tenant can never publish a platform notice).
DROP POLICY IF EXISTS consent_text_write ON vani_consent_text;
CREATE POLICY consent_text_write ON vani_consent_text FOR INSERT
  WITH CHECK (tenant_id = vani_current_tenant());

DROP POLICY IF EXISTS suppression_read ON vani_suppression;
CREATE POLICY suppression_read ON vani_suppression FOR SELECT
  USING (tenant_id = vani_current_tenant() OR tenant_id IS NULL);
DROP POLICY IF EXISTS suppression_write ON vani_suppression;
CREATE POLICY suppression_write ON vani_suppression FOR INSERT
  WITH CHECK (tenant_id = vani_current_tenant());

DROP POLICY IF EXISTS tenant_ack_isolation ON vani_tenant_acknowledgement;
CREATE POLICY tenant_ack_isolation ON vani_tenant_acknowledgement FOR ALL
  USING (tenant_id = vani_current_tenant())
  WITH CHECK (tenant_id = vani_current_tenant());

-- ── 6. The only way to write a platform-wide suppression ───────────────────
-- D9-a: bounce, complaint and erasure span every tenant. Called by provider
-- webhooks and the erasure path, never with a caller-chosen reason.

CREATE OR REPLACE FUNCTION vani_suppress_platform(
  p_channel          text,
  p_identifier_kind  text,
  p_identifier_hash  text,
  p_reason           text,
  p_source           text,
  p_agent_code       text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_reason NOT IN ('bounced','complained','erasure') THEN
    RAISE EXCEPTION 'vani_suppress_platform: reason % is tenant-scoped, not platform-wide (D9-a)', p_reason;
  END IF;
  INSERT INTO vani_suppression
    (tenant_id, agent_code, channel, identifier_kind, identifier_hash,
     action, reason, source, actor_type)
  VALUES
    (NULL, p_agent_code, p_channel, p_identifier_kind, p_identifier_hash,
     'suppress', p_reason, p_source, 'system')
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

COMMENT ON FUNCTION vani_suppress_platform(text,text,text,text,text,text) IS
  'Writes a platform-wide suppression (tenant_id NULL). Only bounced, complained, erasure (D9-a). Migration 260.';

REVOKE ALL ON FUNCTION vani_suppress_platform(text,text,text,text,text,text) FROM PUBLIC;

-- ── 7. Grants for the runtime role (no UPDATE/DELETE: append-only) ─────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vanigtm_app') THEN
    GRANT SELECT, INSERT ON vani_consent_text, vani_suppression, vani_tenant_acknowledgement TO vanigtm_app;
    GRANT EXECUTE ON FUNCTION vani_suppress_platform(text,text,text,text,text,text) TO vanigtm_app;
  END IF;
END $$;

COMMIT;
