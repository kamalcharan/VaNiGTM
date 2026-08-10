-- =============================================================================
-- WS2.3 — scoring function + assessment/lead flow RPCs
-- =============================================================================
-- DRAFT FOR REVIEW. Depends on ws2.2 having been applied first. Nothing here
-- has been applied to vani_gtm_db.
--
-- vani.score_response() is the deterministic SQL scoring the guardrails
-- require ("Deterministic SQL scoring... LLM writes prose only, never
-- blocks"). It is generic over ANY assessment_def.definition JSONB — nothing
-- below hardcodes ai-recovery's ten modes, its question count, or its band
-- thresholds. A second assessment is one new vani.assessment_def row; this
-- function does not change.
--
-- The three RPCs (save_answer, complete_assessment, capture_lead) are the
-- only way vani_anon ever writes data — see ws2.2 §7 for why no direct table
-- grants were given to that role.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- vani.score_response(definition, answers) -> jsonb
-- -----------------------------------------------------------------------------
-- Pure, STABLE, no side effects. `answers` is {question_id: option_index}
-- (integer index into that question's options array) — NOT the option's
-- score value directly, so a tampered client can't submit an arbitrary score;
-- the score is always looked up server-side from `definition`.
--
-- Implements exactly the two formulas from the assessment_def JSON's
-- `scoring` block:
--   exposure_m = 100 * SUM(w_qm * score_q) / SUM(w_qm * max_option_score)
--   health     = round(100 - SUM(mode_weight_m * exposure_m) / SUM(mode_weight_m))
-- reading option_scale's max dynamically (not hardcoded to 3), so a future
-- assessment with a different option scale scores correctly with zero code
-- changes here.
--
-- Malformed input (an option_index the definition doesn't have) is NOT
-- guarded against inside this function — it assumes well-formed input and
-- lets a bad cast raise a Postgres error. Validation belongs to the caller
-- (vani.complete_assessment, below), which checks every scored question has
-- an answer before invoking this. Keeping this function's contract simple
-- ("valid definition + valid answers in, deterministic scores out") makes it
-- easy to unit-test in isolation.
CREATE OR REPLACE FUNCTION vani.score_response(p_definition jsonb, p_answers jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
WITH max_option_score AS (
  SELECT max((elem)::numeric) AS v
  FROM jsonb_array_elements_text(p_definition->'scoring'->'option_scale') AS elem
),
scored_questions AS (
  SELECT
    q->>'id' AS qid,
    q->'options'->((p_answers->>(q->>'id'))::int)->>'score' AS score_text,
    q->'modes' AS modes
  FROM jsonb_array_elements(p_definition->'questions') AS q
  WHERE COALESCE((q->>'context_only')::boolean, false) = false
    AND p_answers ? (q->>'id')
),
question_mode_contrib AS (
  SELECT
    sq.qid,
    m.key AS mode_key,
    (m.value)::numeric AS mode_weight,
    (sq.score_text)::numeric AS score
  FROM scored_questions sq
  CROSS JOIN LATERAL jsonb_each_text(COALESCE(sq.modes, '{}'::jsonb)) AS m(key, value)
  WHERE sq.score_text IS NOT NULL
),
mode_exposure AS (
  SELECT
    mode_key,
    100.0 * SUM(mode_weight * score) / NULLIF(SUM(mode_weight * (SELECT v FROM max_option_score)), 0) AS exposure_pct
  FROM question_mode_contrib
  GROUP BY mode_key
),
mode_defs AS (
  SELECT
    m->>'key' AS mode_key,
    m->>'name' AS name,
    (m->>'composite_weight')::numeric AS composite_weight,
    m->>'symptom' AS symptom,
    m->>'remediation' AS remediation,
    m->>'route_service' AS route_service,
    m->>'route_label' AS route_label,
    m->>'referral_line' AS referral_line
  FROM jsonb_array_elements(p_definition->'modes') AS m
),
mode_full AS (
  SELECT
    md.mode_key, md.name, md.composite_weight, md.symptom, md.remediation,
    md.route_service, md.route_label, md.referral_line,
    COALESCE(me.exposure_pct, 0) AS exposure_pct
  FROM mode_defs md
  LEFT JOIN mode_exposure me ON me.mode_key = md.mode_key
),
health_calc AS (
  SELECT round(100 - SUM(composite_weight * exposure_pct) / NULLIF(SUM(composite_weight), 0)) AS health
  FROM mode_full
),
bands AS (
  SELECT
    b->>'key' AS key, b->>'label' AS label, b->>'color' AS color,
    b->>'verdict' AS verdict, b->>'next_step' AS next_step,
    (b->>'min')::numeric AS min, (b->>'max')::numeric AS max
  FROM jsonb_array_elements(p_definition->'scoring'->'bands') AS b
),
band_match AS (
  SELECT bands.* FROM bands, health_calc
  WHERE health_calc.health BETWEEN bands.min AND bands.max
  LIMIT 1
),
top_modes AS (
  SELECT jsonb_agg(t.* ORDER BY t.exposure_pct DESC) AS modes
  FROM (
    SELECT mode_key AS key, name, round(exposure_pct) AS exposure_pct, symptom,
           remediation, route_service, route_label, referral_line
    FROM mode_full
    ORDER BY exposure_pct DESC
    LIMIT COALESCE((p_definition->'scoring'->>'top_modes_reported')::int, 3)
  ) t
),
all_modes AS (
  SELECT jsonb_agg(
           jsonb_build_object('key', mode_key, 'name', name, 'exposure_pct', round(exposure_pct))
           ORDER BY exposure_pct DESC
         ) AS modes
  FROM mode_full
)
SELECT jsonb_build_object(
  'health', (SELECT health FROM health_calc),
  'band', (SELECT to_jsonb(band_match) FROM band_match),
  'top_modes', (SELECT modes FROM top_modes),
  'all_modes', (SELECT modes FROM all_modes)
);
$$;

-- -----------------------------------------------------------------------------
-- vani.save_answer(...) — first call creates the response row, later calls
-- merge one more answer into it.
-- -----------------------------------------------------------------------------
-- Matches the App Spec's fixed flow order: "response row on first answer
-- (anon token)" — no row exists for someone who loads the page and bounces.
-- `p_ref`, if given on the first call, resolves a partner referral link
-- (?ref=rk-associates) to a vani.partner row; unknown/inactive refs are
-- silently treated as Direct rather than erroring, since a bad ref code
-- should never block someone from taking the assessment.
CREATE OR REPLACE FUNCTION vani.save_answer(
  p_response_id   uuid,
  p_anon_token    uuid,
  p_service_slug  text,
  p_question_id   text,
  p_option_index  int,
  p_ref           text DEFAULT NULL
) RETURNS TABLE(response_id uuid, anon_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vani, pg_temp
AS $$
DECLARE
  v_def vani.assessment_def%ROWTYPE;
  v_partner_id uuid;
  v_response_id uuid;
  v_anon_token uuid;
BEGIN
  IF p_response_id IS NULL OR p_anon_token IS NULL THEN
    SELECT * INTO v_def FROM vani.assessment_def
      WHERE service_slug = p_service_slug AND public = true AND is_active = true AND hold_for_review = false
      ORDER BY version DESC LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'unknown or inactive assessment: %', p_service_slug USING ERRCODE = 'P0001';
    END IF;

    IF p_ref IS NOT NULL THEN
      SELECT id INTO v_partner_id FROM vani.partner
        WHERE ref_code = p_ref AND role = 'partner' AND is_active;
    END IF;

    INSERT INTO vani.assessment_response (tenant_id, assessment_def_id, referred_by_partner_id, answers)
    VALUES (v_def.tenant_id, v_def.id, v_partner_id, jsonb_build_object(p_question_id, p_option_index))
    RETURNING id, vani.assessment_response.anon_token INTO v_response_id, v_anon_token;

    INSERT INTO vani.lead_event (tenant_id, assessment_response_id, event_type, payload)
    VALUES (v_def.tenant_id, v_response_id, 'response_started', jsonb_build_object('ref', p_ref));
  ELSE
    UPDATE vani.assessment_response
      SET answers = answers || jsonb_build_object(p_question_id, p_option_index),
          updated_at = now()
      WHERE id = p_response_id AND anon_token = p_anon_token AND status = 'in_progress'
      RETURNING id, vani.assessment_response.anon_token INTO v_response_id, v_anon_token;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'response not found, wrong token, or already completed' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN QUERY SELECT v_response_id, v_anon_token;
END;
$$;

-- -----------------------------------------------------------------------------
-- vani.complete_assessment(...) — validates all scored questions are
-- answered, calls score_response, persists the result.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION vani.complete_assessment(
  p_response_id uuid,
  p_anon_token  uuid
) RETURNS vani.assessment_response
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vani, pg_temp
AS $$
DECLARE
  v_response vani.assessment_response%ROWTYPE;
  v_def vani.assessment_def%ROWTYPE;
  v_result jsonb;
  v_required_ids text[];
  v_answered_ids text[];
BEGIN
  SELECT * INTO v_response FROM vani.assessment_response
    WHERE id = p_response_id AND anon_token = p_anon_token AND status = 'in_progress';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'response not found, wrong token, or already completed' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_def FROM vani.assessment_def WHERE id = v_response.assessment_def_id;

  SELECT array_agg(q->>'id') INTO v_required_ids
    FROM jsonb_array_elements(v_def.definition->'questions') q
    WHERE COALESCE((q->>'context_only')::boolean, false) = false;
  SELECT array_agg(key) INTO v_answered_ids FROM jsonb_object_keys(v_response.answers) AS key;

  IF NOT (v_required_ids <@ COALESCE(v_answered_ids, ARRAY[]::text[])) THEN
    RAISE EXCEPTION 'not all scored questions are answered' USING ERRCODE = 'P0001';
  END IF;

  v_result := vani.score_response(v_def.definition, v_response.answers);

  UPDATE vani.assessment_response
    SET status = 'completed',
        completed_at = now(),
        updated_at = now(),
        health_score = (v_result->>'health')::int,
        band = v_result->'band'->>'key',
        top_modes = v_result->'top_modes'
    WHERE id = p_response_id
    RETURNING * INTO v_response;

  INSERT INTO vani.lead_event (tenant_id, assessment_response_id, event_type, payload)
  VALUES (v_response.tenant_id, v_response.id, 'response_completed',
          jsonb_build_object('health_score', v_response.health_score, 'band', v_response.band));

  RETURN v_response;
END;
$$;

-- -----------------------------------------------------------------------------
-- vani.capture_lead(...) — turns a completed, uncaptured response into a lead.
-- -----------------------------------------------------------------------------
-- Report creation and email dispatch are explicitly NOT done here — that's a
-- WS3/WS4 orchestration concern (n8n / the event worker reading gt_events-
-- style, per the handover's "known facts"). This RPC's job ends at "a lead
-- row now exists, linked to its response."
CREATE OR REPLACE FUNCTION vani.capture_lead(
  p_response_id  uuid,
  p_anon_token   uuid,
  p_name         text,
  p_email        text,
  p_company      text,
  p_role_title   text,
  p_phone        text DEFAULT NULL
) RETURNS vani.lead
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vani, pg_temp
AS $$
DECLARE
  v_response vani.assessment_response%ROWTYPE;
  v_lead vani.lead%ROWTYPE;
BEGIN
  SELECT * INTO v_response FROM vani.assessment_response
    WHERE id = p_response_id AND anon_token = p_anon_token AND status = 'completed';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'response not found, wrong token, or not yet completed' USING ERRCODE = 'P0002';
  END IF;

  IF v_response.lead_id IS NOT NULL THEN
    RAISE EXCEPTION 'lead already captured for this response' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO vani.lead (tenant_id, partner_id, name, email, company, role_title, phone)
  VALUES (v_response.tenant_id, v_response.referred_by_partner_id, p_name, p_email, p_company, p_role_title, p_phone)
  RETURNING * INTO v_lead;

  UPDATE vani.assessment_response SET lead_id = v_lead.id, updated_at = now() WHERE id = v_response.id;

  INSERT INTO vani.lead_event (tenant_id, assessment_response_id, lead_id, event_type, payload)
  VALUES (v_response.tenant_id, v_response.id, v_lead.id, 'lead_captured', '{}'::jsonb);

  RETURN v_lead;
END;
$$;

REVOKE ALL ON FUNCTION vani.save_answer(uuid, uuid, text, text, int, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION vani.complete_assessment(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION vani.capture_lead(uuid, uuid, text, text, text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION vani.save_answer(uuid, uuid, text, text, int, text) TO vani_anon;
GRANT EXECUTE ON FUNCTION vani.complete_assessment(uuid, uuid) TO vani_anon;
GRANT EXECUTE ON FUNCTION vani.capture_lead(uuid, uuid, text, text, text, text, text) TO vani_anon;

COMMIT;
