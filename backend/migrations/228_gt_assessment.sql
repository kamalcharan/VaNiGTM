-- ============================================================================
-- Migration 228: gt_assessment — VaNi AI public assessment platform
--
-- VaNi AI (vikuna.io/vani, launching before vani.vikuna.io) is a separate
-- product from this GTM engine, but reuses this database and this backend's
-- auth/db-layer infrastructure rather than standing up its own (Charan,
-- 2026-07-31 — "you can use login/auth and all other things from VaNiGTM ...
-- it will bring down the time"). Scored assessment -> teaser -> email
-- capture -> tokenized report -> owner/partner console, same flow as any
-- other tenant-scoped GTM feature, EXCEPT the assessment-taking itself is
-- anonymous (no JWT) — see assessment-skill's routes file for how that's
-- handled without touching auth/token.service.ts.
--
-- Six tables, gt_ prefix per CLAUDE.md rule 5, tenant_id + is_live per rule
-- 8. All rows live under one tenant (Vikuna Consulting — created by this
-- migration if it doesn't already exist) since VaNi AI is Vikuna's own
-- product, not a tenant-facing GTM feature; tenant_id is kept anyway for
-- consistency with every other table and in case that ever changes.
--
-- gt_partner doubles as the console-identity table (role: 'owner' |
-- 'partner') rather than adding a 7th table or coupling to vn_roles/
-- vn_user_roles — VaNi AI owns its own console-access mapping, looked up by
-- user_id inside assessment-skill functions from SkillContext.user_id.
--
-- RLS policies follow the gt_segments (migration 219) pattern exactly:
-- tenant_isolation via current_setting('app.current_tenant_id', true)::uuid.
-- Per CLAUDE.md "RLS — current reality," this is currently dormant (runtime
-- connects as vikuna_admin, BYPASSRLS) — the actual enforced boundary is the
-- application-layer tenant_id filter in every query, same as everywhere
-- else in this codebase. The anonymous public routes are the one place that
-- needs extra care since there's no JWT to resolve tenant_id from — they
-- resolve it once from the 'vikuna-consulting' tenant slug, same way the
-- storyteller share route resolves its row by an unguessable token instead
-- of a tenant filter.
--
-- Idempotent; safe to re-run. Apply manually: cd backend && npm run db:migrate
-- ============================================================================

DO $$
DECLARE missing TEXT;
BEGIN
    SELECT string_agg(t, ', ') INTO missing
    FROM   unnest(ARRAY['vn_tenants', 'vn_users']) AS t
    WHERE  to_regclass('public.' || t) IS NULL;

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'Missing prerequisite table(s): %', missing;
    END IF;
END $$;

BEGIN;

-- ── 0. Vikuna Consulting tenant ─────────────────────────────────────────────
-- Real UUID, not the all-zero "vikuna" sentinel tenant that already exists
-- in vn_tenants (that row predates this product and is a bootstrap
-- placeholder — never hang real lead data off it).
--
-- is_active is NOT in this column list on purpose — CLAUDE.md lesson #8:
-- "vn_tenants.is_active is a generated column — never INSERT into it."
-- (GENERATED ALWAYS AS (status = 'active') STORED.) The first draft of this
-- migration violated that lesson anyway and failed exactly as documented
-- when run locally (Task A1, 2026-07-31) — status='active' below is
-- sufficient; is_active computes itself.
INSERT INTO vn_tenants (id, slug, status, activated_at, customer_id_type_code, is_admin)
SELECT gen_random_uuid(), 'vikuna-consulting', 'active', now(), 'IWELL_CODE', false
WHERE NOT EXISTS (SELECT 1 FROM vn_tenants WHERE slug = 'vikuna-consulting');

-- ── 1. gt_partner — console identity (owner or referral partner) ───────────
CREATE TABLE IF NOT EXISTS gt_partner (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID        NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    is_live       BOOLEAN     NOT NULL DEFAULT true,

    user_id       UUID        NOT NULL REFERENCES vn_users(id) ON DELETE CASCADE,
    role          VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'partner')),
    -- ?ref=<ref_code> on the public assessment URL. Required for role=partner
    -- (the referral link IS the point), NULL for role=owner.
    ref_code      VARCHAR(60) UNIQUE,
    display_name  VARCHAR(120) NOT NULL,

    is_active     BOOLEAN     NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT gt_partner_user_unique UNIQUE (user_id),
    CONSTRAINT gt_partner_ref_code_matches_role CHECK (
        (role = 'partner' AND ref_code IS NOT NULL) OR
        (role = 'owner' AND ref_code IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_gt_partner_tenant ON gt_partner(tenant_id, is_live);

ALTER TABLE gt_partner ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY gt_partner_tenant_isolation ON gt_partner
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE gt_partner IS
    'VaNi AI console identity — role owner or referral partner. Looked up by user_id inside assessment-skill functions; not part of the vn_roles/vn_user_roles RBAC system.';

-- ── 2. gt_assessment_def — the instrument, config-driven ────────────────────
-- One row per assessment per version. `definition` is the ENTIRE Pilot Pack
-- JSON verbatim — this is what makes "second assessment = one DB row, zero
-- code" true: nothing in assessment-skill hardcodes ai-recovery's ten
-- failure modes, its question count, or its scoring bands.
CREATE TABLE IF NOT EXISTS gt_assessment_def (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID        NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    is_live           BOOLEAN     NOT NULL DEFAULT true,

    service_slug      VARCHAR(80) NOT NULL,
    version           VARCHAR(20) NOT NULL,
    definition        JSONB       NOT NULL,
    public            BOOLEAN     NOT NULL DEFAULT true,
    hold_for_review   BOOLEAN     NOT NULL DEFAULT false,
    is_active         BOOLEAN     NOT NULL DEFAULT true,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT gt_assessment_def_unique_version UNIQUE (tenant_id, is_live, service_slug, version)
);

CREATE INDEX IF NOT EXISTS idx_gt_assessment_def_tenant ON gt_assessment_def(tenant_id, is_live);
CREATE INDEX IF NOT EXISTS idx_gt_assessment_def_slug ON gt_assessment_def(service_slug) WHERE public AND is_active;

ALTER TABLE gt_assessment_def ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY gt_assessment_def_tenant_isolation ON gt_assessment_def
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE gt_assessment_def IS
    'VaNi AI assessment definitions, config-driven. definition JSONB is the Pilot Pack instrument verbatim — questions, failure modes, scoring weights and bands, report copy. Scoring is computed deterministically off this JSON; nothing is hardcoded to any one assessment.';
COMMENT ON COLUMN gt_assessment_def.definition IS
    'Verbatim source-of-truth JSON: landing/scoring/modes/questions/teaser/capture/report/narrative_prompt. See vikunawebsite repo docs/vani-ai-recovery-assessment-definition.json for the ai-recovery seed.';

-- ── 3. gt_lead — captured leads, self-contained ─────────────────────────────
-- Deliberately no FK to gt_prospects/gt_contacts. VaNi AI leads are
-- individual assessment respondents (name/email/company/role), not the
-- company-level CRM records gt_prospects models — forcing that shape would
-- lose information, not gain reuse. A sync into the GTM funnel, if ever
-- wanted, is a later job reading from here, not a foreign key.
CREATE TABLE IF NOT EXISTS gt_lead (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID        NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    is_live       BOOLEAN     NOT NULL DEFAULT true,

    partner_id    UUID        REFERENCES gt_partner(id),  -- NULL = Direct
    lead_no       TEXT,                                    -- gt_next_seq(tenant, 'vani_lead')

    name          VARCHAR(200) NOT NULL,
    email         VARCHAR(320) NOT NULL,
    company       VARCHAR(200) NOT NULL,
    role_title    VARCHAR(200) NOT NULL,
    phone         VARCHAR(40),

    status        VARCHAR(20) NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new', 'contacted', 'l2_booked', 'engaged', 'closed_won', 'closed_lost')),

    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gt_lead_tenant ON gt_lead(tenant_id, is_live);
CREATE INDEX IF NOT EXISTS idx_gt_lead_partner ON gt_lead(partner_id);

ALTER TABLE gt_lead ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY gt_lead_tenant_isolation ON gt_lead
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE gt_lead IS
    'VaNi AI captured leads. No FK to gt_prospects/gt_contacts by design — a per-respondent lead is a different shape than a company-level CRM record; any future sync is a job reading this table, not a foreign key.';

-- ── 4. gt_assessment_response — created on first answer, not on landing ────
-- anon_token is the bearer capability that lets an anonymous browser resume
-- or complete its own response. It is a separate column from id (never
-- expose id as the token) and is only ever checked inside assessment-skill
-- functions — there is no JWT/RLS identity for an anonymous respondent to
-- check against.
CREATE TABLE IF NOT EXISTS gt_assessment_response (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID        NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    is_live                 BOOLEAN     NOT NULL DEFAULT true,

    assessment_def_id       UUID        NOT NULL REFERENCES gt_assessment_def(id),
    anon_token              UUID        NOT NULL DEFAULT gen_random_uuid(),
    referred_by_partner_id  UUID        REFERENCES gt_partner(id),

    answers                 JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- {question_id: option_index}
    status                  VARCHAR(20) NOT NULL DEFAULT 'in_progress'
                              CHECK (status IN ('in_progress', 'completed', 'abandoned')),

    health_score            INTEGER,
    band                    VARCHAR(20),
    top_modes               JSONB,

    lead_id                 UUID        REFERENCES gt_lead(id),

    started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at            TIMESTAMPTZ,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT gt_assessment_response_anon_token_unique UNIQUE (anon_token)
);

CREATE INDEX IF NOT EXISTS idx_gt_assessment_response_tenant ON gt_assessment_response(tenant_id, is_live);
CREATE INDEX IF NOT EXISTS idx_gt_assessment_response_lead ON gt_assessment_response(lead_id);

ALTER TABLE gt_assessment_response ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY gt_assessment_response_tenant_isolation ON gt_assessment_response
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE gt_assessment_response IS
    'One row per assessment attempt, created on the FIRST answer (not on landing) so nobody who bounces leaves a row behind. anon_token is the bearer capability for resuming/completing anonymously — never expose id as if it were the token.';
COMMENT ON COLUMN gt_assessment_response.answers IS
    '{question_id: option_index} — the option INDEX, never the score value directly. The score is always re-derived server-side from gt_assessment_def.definition, so a tampered client answer can only select a different valid option, never inject an arbitrary score.';

-- ── 5. gt_report — tokenized report ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gt_report (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                UUID        NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    is_live                  BOOLEAN     NOT NULL DEFAULT true,

    assessment_response_id   UUID        NOT NULL REFERENCES gt_assessment_response(id),
    report_token             UUID        NOT NULL DEFAULT gen_random_uuid(),
    ref                      TEXT,                                     -- gt_next_seq(tenant, 'vani_report')

    narrative                TEXT,
    narrative_source         VARCHAR(20) NOT NULL DEFAULT 'pending'
                               CHECK (narrative_source IN ('pending', 'llm', 'fallback')),

    emailed_at               TIMESTAMPTZ,
    revoked_at               TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT gt_report_response_unique UNIQUE (assessment_response_id),
    CONSTRAINT gt_report_token_unique UNIQUE (report_token)
);

CREATE INDEX IF NOT EXISTS idx_gt_report_tenant ON gt_report(tenant_id, is_live);

ALTER TABLE gt_report ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY gt_report_tenant_isolation ON gt_report
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE gt_report IS
    'VaNi AI tokenized report. report_token is a bearer capability, same model as gt_presentations.share_token (storyteller-skill) — security is token unguessability, not row filtering; revoked_at is the one thing the public route enforces beyond the token match.';

-- ── 6. gt_lead_event — timeline ──────────────────────────────────────────────
-- Keyed primarily off assessment_response_id because the funnel starts
-- (response_started, response_completed) before a lead exists; lead_id is
-- filled in once/if capture happens.
CREATE TABLE IF NOT EXISTS gt_lead_event (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                UUID        NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    is_live                  BOOLEAN     NOT NULL DEFAULT true,

    assessment_response_id   UUID        NOT NULL REFERENCES gt_assessment_response(id),
    lead_id                  UUID        REFERENCES gt_lead(id),

    event_type               VARCHAR(40) NOT NULL,
    payload                  JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_by                UUID       REFERENCES vn_users(id),

    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gt_lead_event_lead ON gt_lead_event(lead_id);
CREATE INDEX IF NOT EXISTS idx_gt_lead_event_response ON gt_lead_event(assessment_response_id);

ALTER TABLE gt_lead_event ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY gt_lead_event_tenant_isolation ON gt_lead_event
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE gt_lead_event IS
    'VaNi AI lead/response timeline. Keyed off assessment_response_id (always exists first); lead_id fills in once capture happens.';

-- ── 7. gt_next_seq prefix seeds ──────────────────────────────────────────────
-- gt_next_seq() auto-derives a 4-char prefix from the type name on first use
-- (UPPER(LEFT(type,4))), which would give 'VANI' for 'vani_lead'/'VANI' for
-- 'vani_report' (collision) rather than something readable. Pre-seed the
-- counters with explicit prefixes instead. Idempotent — ON CONFLICT DO
-- NOTHING leaves any already-seeded counter (and its last_value) untouched.
INSERT INTO gt_seq_counters (tenant_id, sequence_type, prefix)
SELECT t.id, 'vani_lead', 'LEAD'
FROM vn_tenants t WHERE t.slug = 'vikuna-consulting'
ON CONFLICT (tenant_id, sequence_type) DO NOTHING;

INSERT INTO gt_seq_counters (tenant_id, sequence_type, prefix)
SELECT t.id, 'vani_report', 'VN'
FROM vn_tenants t WHERE t.slug = 'vikuna-consulting'
ON CONFLICT (tenant_id, sequence_type) DO NOTHING;

COMMIT;

-- ── Post-apply verification ─────────────────────────────────────────────────
-- SELECT slug, id FROM vn_tenants WHERE slug = 'vikuna-consulting';
-- SELECT count(*) FROM gt_assessment_def;   -- 0 until seeded (see assessment-skill/functions/seed notes)
-- SELECT gt_next_seq((SELECT id FROM vn_tenants WHERE slug = 'vikuna-consulting'), 'vani_lead');   -- LEAD-0001
