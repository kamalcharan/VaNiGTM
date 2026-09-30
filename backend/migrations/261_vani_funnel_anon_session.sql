-- ============================================================================
-- Migration 261: crawl before signup (POA Track E1, decision D3)
--
-- Design and decisions: documents/design-notes-funnel-anon-session.md
-- (approved as recommended by Charan, 2026-09-30: D3-a…h, reuse 30 days).
-- Written for review; NOT applied until Charan says so. Apply on the VPS with
-- `docker exec vani-backend node dist/migrate.js` (DEPLOY.md §4).
--
-- ── WHAT IT ADDS ───────────────────────────────────────────────────────────
--
--   vani_anon_site_read   one read of one public website: page text, the
--                         drafted card, status. Shared by every visitor who
--                         enters the same site inside the reuse window — the
--                         reason a revisit never pays for Haiku twice (D3-h).
--   vani_anon_session     one visitor: the token (hashed), the read it points
--                         at, the IP (hashed), and — after signup — the tenant
--                         it was claimed into. Never shared between visitors.
--   vn_tenants 'vikuna-funnel'   the system tenant that owns the JOB (event,
--                         run) and the MODEL SPEND of pre-signup reads, so its
--                         daily token cap is the ceiling on anonymous cost
--                         (D3-a). Visitors' data never enters its tables.
--
-- ── RLS: DISABLED BY DESIGN (D3-e) ─────────────────────────────────────────
--
-- Neither table has a tenant until a claim, and both are reached by token,
-- which a tenant GUC cannot express. Same posture as gt_events (185) and
-- gt_agent_runs (237): a named, visible exemption. All access goes through
-- one module (src/funnel), which always filters by token hash or by the
-- caller's own tenant once claimed. The data is a public website's text and a
-- card drafted from it, plus two hashes; unclaimed rows are deleted.
--
-- No existing table, column or policy changes. Nothing reads these tables
-- until the funnel routes are deployed, so applying this changes no behaviour.
--
-- Guarded and idempotent.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.vn_tenants') IS NULL THEN
    RAISE EXCEPTION '[261] vn_tenants is missing';
  END IF;
END $$;

BEGIN;

-- ── 1. One read of one website ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vani_anon_site_read (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  website_host  text        NOT NULL CHECK (website_host = lower(website_host) AND website_host !~ '^www\.'),
  website_url   text        NOT NULL,               -- the page actually read
  status        text        NOT NULL DEFAULT 'queued'
                            CHECK (status IN ('queued','reading','read','failed')),
  failure       text,                                -- the real reason (rule 12)
  page_text     text,                                -- what was read
  draft         jsonb,                               -- the drafter's own validated card (D3-g)
  run_id        bigint,                              -- under the funnel system tenant
  created_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  CONSTRAINT site_read_outcome CHECK (
    (status = 'read'   AND draft IS NOT NULL AND finished_at IS NOT NULL) OR
    (status = 'failed' AND failure IS NOT NULL AND finished_at IS NOT NULL) OR
    (status IN ('queued','reading'))
  )
);

CREATE INDEX IF NOT EXISTS idx_anon_site_read_host
  ON vani_anon_site_read (website_host, created_at DESC);

COMMENT ON TABLE vani_anon_site_read IS
  'Pre-signup read of a public website, shared by every visitor entering the same host inside FUNNEL_REUSE_HOURS. RLS disabled by design; reached only through src/funnel (D3, migration 261).';

-- ── 2. One visitor ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vani_anon_session (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash       text        NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'), -- sha256; the token is never stored
  site_read_id     uuid        NOT NULL REFERENCES vani_anon_site_read(id) ON DELETE CASCADE,
  ip_hash          text        NOT NULL CHECK (ip_hash ~ '^[0-9a-f]{64}$'),           -- HMAC; for limits only
  started_read     boolean     NOT NULL DEFAULT false,  -- this visit started a NEW read (the only kind the rate limit counts)
  bound_tenant_id  uuid        REFERENCES vn_tenants(id) ON DELETE SET NULL,
  bound_at         timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  CONSTRAINT session_bound_together CHECK ((bound_tenant_id IS NULL) = (bound_at IS NULL))
);

-- Self-healing on purpose (2026-09-30): an early copy of this file without
-- started_read was run by hand on production before it was recorded. CREATE
-- TABLE IF NOT EXISTS skips an existing table, so the column is added here too.
ALTER TABLE vani_anon_session
  ADD COLUMN IF NOT EXISTS started_read boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_anon_session_ip
  ON vani_anon_session (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anon_session_expiry
  ON vani_anon_session (expires_at) WHERE bound_at IS NULL;

COMMENT ON TABLE vani_anon_session IS
  'A pre-signup visitor: hashed token, the site read it points at, hashed IP, and the tenant it was claimed into. RLS disabled by design; reached only through src/funnel (D3, migration 261).';

ALTER TABLE vani_anon_site_read DISABLE ROW LEVEL SECURITY;
ALTER TABLE vani_anon_session   DISABLE ROW LEVEL SECURITY;

-- ── 3. The system tenant (D3-a) ────────────────────────────────────────────
-- Owns the job and the model spend of pre-signup reads; never logged into.
-- Its daily token limit is set from .env (FUNNEL_DAILY_TOKEN_LIMIT) by the
-- funnel module before every read, never by this file.

INSERT INTO vn_tenants (slug, status)
SELECT 'vikuna-funnel', 'active'
 WHERE NOT EXISTS (SELECT 1 FROM vn_tenants WHERE slug = 'vikuna-funnel');

-- ── 4. Grants for the runtime role ─────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vanigtm_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON vani_anon_site_read, vani_anon_session TO vanigtm_app;
  END IF;
END $$;

COMMIT;
