-- ============================================================================
-- 245_vani_prompt.sql
--
-- Prompt store: system authorship + tenant overrides. Two-layer, one table.
--
-- Every LLM-driven worker inside every agent (vara.composer.ask_next,
-- vara.extractor.field_schema, vara.candidate.turn, gtm.vani.gather, ...)
-- reads its prompt from here at call time. The key namespaces the agent
-- and the function ('<agent>.<worker>.<slot>'), matching gt_prompts'
-- '<skill>.<name>' shape so a screen moving between the repos resolves
-- the same way.
--
-- ── Why one table with two scopes ─────────────────────────────────────
-- Because a tenant override MUST resolve against the same key a system
-- prompt exists at; putting them in separate tables makes the resolver
-- do two lookups and pick a winner. One table + a scope column keeps
-- resolution to one SELECT with an ORDER BY.
--
-- ── Versioning is append-only ────────────────────────────────────────
-- A "fix" is a new row with version = max + 1. Old rows stay; audit rows
-- citing v3 can still resolve v3 for context. Rollback = flip `active`
-- on an older row.
--
-- ── Approval is required for active ──────────────────────────────────
-- V-11: no LLM prompt goes live without a human approving. `approved_by`
-- is NOT NULL when active=true, CHECK-enforced. For MVP tenant admins
-- self-approve their own overrides; the shape stays right for a future
-- "separate approver" flow.
--
-- ── One active per (key, scope, tenant_id) ───────────────────────────
-- Partial unique index. A tenant can carry many versions of an override
-- in history; exactly one is active. Same for the system side.
-- ============================================================================

CREATE TABLE IF NOT EXISTS vani_prompt (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- '<agent>.<worker>.<slot>' e.g. 'vara.composer.ask_next'. Free-form; the
  -- runtime resolver is what enforces callers use a known key.
  key          text NOT NULL,

  version      int  NOT NULL,
  scope        text NOT NULL CHECK (scope IN ('system','tenant')),

  -- NULL for scope='system'; required for scope='tenant'. CHECK below.
  tenant_id    uuid REFERENCES vani_tenant(id) ON DELETE CASCADE,

  body         text NOT NULL,

  -- Names of the variables the caller must supply. Empty array is valid.
  -- Used by the Prompt Studio to validate an override against the system
  -- prompt's contract — an override that drops a variable would silently
  -- break the caller.
  variables    jsonb NOT NULL DEFAULT '[]'::jsonb,

  active       boolean NOT NULL DEFAULT false,
  approved_by  uuid REFERENCES vani_user(id),
  approved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),

  -- scope carries tenant_id nullability
  CONSTRAINT vani_prompt_scope_shape CHECK (
    (scope = 'system' AND tenant_id IS NULL) OR
    (scope = 'tenant' AND tenant_id IS NOT NULL)
  ),

  -- active rows must be approved by someone
  CONSTRAINT vani_prompt_active_needs_approver CHECK (
    active = false OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
  ),

  -- version uniqueness within a scope (per-tenant for overrides, global for system)
  UNIQUE (key, scope, tenant_id, version)
);

-- Only one active row per (key, scope, tenant_id). Uses coalesce so the
-- partial-unique treats system rows as a single group and each tenant as
-- their own group. Without this, a "rollback = flip active" step could
-- accidentally leave two rows active.
CREATE UNIQUE INDEX IF NOT EXISTS vani_prompt_one_active
  ON vani_prompt (key, scope, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE active = true;

CREATE INDEX IF NOT EXISTS vani_prompt_key_lookup
  ON vani_prompt (key, scope, tenant_id) WHERE active = true;

-- Prompts are append-only. Fix = new version; rollback = flip active on
-- an older row. The active flag itself CAN change (that's how rollback
-- works), so we don't guard UPDATE outright — but body/variables of a
-- committed row cannot change. Enforce that with a trigger.
CREATE OR REPLACE FUNCTION vani_prompt_body_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.body <> OLD.body OR NEW.variables <> OLD.variables
     OR NEW.key <> OLD.key OR NEW.scope <> OLD.scope
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.version <> OLD.version THEN
    RAISE EXCEPTION 'vani_prompt row is append-only for content; make a new version';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vani_prompt_content_immutable ON vani_prompt;
CREATE TRIGGER vani_prompt_content_immutable
  BEFORE UPDATE ON vani_prompt
  FOR EACH ROW EXECUTE FUNCTION vani_prompt_body_immutable();

-- ── RLS: system rows readable by everyone, tenant rows only by their tenant ──
--
-- Same platform+tenant pattern migration 235 uses on gt_tags / gt_content_kinds.
-- System rows (tenant_id IS NULL) must be visible to every tenant so the
-- resolver can fall back to them; tenant override writes are confined to the
-- caller's tenant. System writes ride on the BYPASSRLS operator role (seed
-- migrations, deploy scripts) — no tenant path can mint a system row.

ALTER TABLE vani_prompt ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prompt_read ON vani_prompt;
CREATE POLICY prompt_read ON vani_prompt
  FOR SELECT
  USING (
    tenant_id IS NULL OR tenant_id = vani_current_tenant()
  );

DROP POLICY IF EXISTS prompt_write ON vani_prompt;
CREATE POLICY prompt_write ON vani_prompt
  FOR ALL
  USING (tenant_id IS NOT NULL AND tenant_id = vani_current_tenant())
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = vani_current_tenant());

COMMENT ON TABLE vani_prompt IS
  'Two-layer prompt store: scope=system (Vikuna-authored) + scope=tenant '
  '(per-tenant override). Resolver picks tenant override if active, else '
  'newest active system version. Append-only for content; active can flip '
  'for rollback. RLS: system readable by all, tenant writes confined to '
  'their tenant. Owner (vanigtm_app) needs FORCE ROW LEVEL SECURITY '
  'applied by a later migration if the deployment role owns this table.';

-- ── First seed: proof-of-shape ────────────────────────────────────────
--
-- Composer is still scripted (pack-driven) in Phase 1, so this prompt
-- isn't wired to a caller yet. It exists so the resolver, the Prompt
-- Studio, and the eval harness have a real row to point at from day one.
-- The Composer's real prompt lands with Phase 2 alongside the Extractor.

INSERT INTO vani_prompt (key, version, scope, body, variables, active, approved_by, approved_at)
SELECT
  'vara.composer.ask_next', 1, 'system',
  $prompt$You are Vara, a talent-side agent helping a hiring manager shape a job description.

The tenant is {{tenant_name}} in {{industry}}. The role family is {{family}}. The role title is {{title}}.

You have gathered these facts so far:
{{facts_so_far_json}}

The starter shape from the {{family}} playbook is:
{{starter_shape_json}}

Your job: ask ONE next question that produces the highest-signal fact for this role. Prefer:
1. A question that fires or rules out a knockout early (cheap reject before deep interviews).
2. A question that resolves the top-weighted must-have.
3. A question about compensation band if it is still missing.

Return ONLY JSON matching this schema:
{
  "question": "<the question, phrased in the tenant's brand voice if known>",
  "kind": "knockout" | "musthave" | "band" | "policy",
  "chip_options": [{"label": "<button text>", "contributes": <structured fact JSON>}, ...]
}

Never commit to a decision. Never say "shortlisted" or "rejected". You gather facts; humans decide.$prompt$,
  '["tenant_name","industry","family","title","facts_so_far_json","starter_shape_json"]'::jsonb,
  true,
  (SELECT id FROM vani_user LIMIT 1),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM vani_prompt WHERE key='vara.composer.ask_next' AND scope='system' AND version=1
);
