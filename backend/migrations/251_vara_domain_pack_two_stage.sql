-- ============================================================================
-- 251_vara_domain_pack_two_stage.sql
--
-- Split domain research into two prompts, because one call cannot fit the
-- answer. Data only — no new tables, columns, enums or indexes.
--
-- WHY. v2 (migration 250) asked for 5-8 families with 10-15 titles each in a
-- single response. Run 87 produced 10,317 characters and died at position
-- 10,302: truncated mid-JSON against max_tokens 2600. The content was good —
-- 15 titles including SRE, DevOps Engineer and Platform Engineer, must-haves
-- like "Ships code to production regularly" with a real `why` — it simply had
-- nowhere to finish.
--
-- Raising the cap does not work. Run 86 spent 221 seconds generating ~2600
-- tokens on the VPS model, so an 8000-token budget lands past the deployed
-- LLM_PRIMARY_TIMEOUT_MS of 280000 before it completes. The output has to get
-- SMALLER PER CALL, not the budget bigger.
--
-- Also worth recording: run 87 ran on claude-haiku-4-5, not qwen3-4b. Its step
-- log says "VPS model unavailable — claude-haiku-4-5 took over", so the
-- failover fired. The quality of that output says nothing about what the
-- deployed model produces, and nothing here should be tuned on the assumption
-- it does.
--
-- SHAPE. Stage 1 names the families and their titles — the match key, and the
-- only thing the doorway needs to be useful. Stage 2 runs once per family for
-- its scoring shape, a few hundred tokens each. Every call is small enough for
-- a 4B model inside the timeout, and the agent checkpoints between them, so a
-- timeout on family four keeps families one to three.
--
-- vara.domain_pack.research v2 is DEACTIVATED, not deleted. Nothing resolves
-- it any more; v1 and v2 stay readable because vani_domain_pack rows record
-- the prompt version that produced them and run 86 must remain traceable.
-- ============================================================================

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM vani_prompt
     WHERE key = 'vara.domain_pack.families' AND scope = 'system' AND version = 1
  ) THEN
    RAISE NOTICE '251: two-stage prompts already present — nothing to do';
    RETURN;
  END IF;

  -- Retire the single-call prompt. Leaving it active would mean two prompts
  -- claiming to do the same job, and the next person could not tell which one
  -- runs.
  UPDATE vani_prompt
     SET active = false
   WHERE key = 'vara.domain_pack.research' AND scope = 'system' AND active = true;

  -- ── Stage 1: the families and, above all, their titles ──────────────────
  INSERT INTO vani_prompt (key, version, scope, body, variables, active, approved_by, approved_at)
  VALUES (
    'vara.domain_pack.families', 1, 'system',
    $prompt$You are a talent-market researcher. Name the role families an industry hires for.

Industry, as the tenant typed it: {{industry}}
Canonical slug: {{domain_slug}}

A role family is a cluster of roles sharing a skill profile and a hiring bar — "Backend Engineering", not "Senior Backend Engineer at a Series B".

Return AT LEAST 5 families, up to 8. Fewer than 5 means you have under-described the industry: go wider, and include the operational and support functions it hires for, not only the obvious headline roles.

Ground every family in what this industry actually hires. A hospital group hires clinicians, billing and compliance staff; a logistics firm hires fleet, warehouse and route planners. If you are describing software engineers for a non-software industry, you have the wrong answer — except for the small in-house technology function such an industry genuinely has, which belongs only if it is one of its most common hires.

TITLES ARE THE POINT OF THIS STEP

`suggested_titles` is how a hiring manager finds the family: they type a job title and it is matched against your list. A title you leave out is a manager who gets no help at all.

Give 10-15 titles per family. Include:
  - the plain form and the senior/junior/lead/staff/principal variants
  - the synonyms real companies use (Engineer and Developer; Manager and Lead)
  - adjacent specialisations that would sensibly start from this family's shape

Public market knowledge ONLY. You have not been given, and must not invent, anything about a specific employer. Leave a field out rather than fill it with a guess.

Return ONLY JSON:
{
  "families": [
    {
      "family_name": "<cluster name>",
      "hint": "<one line — what this family owns>",
      "suggested_titles": ["<title>", "... 10-15 of them"],
      "role_summary_hint": "<one line a JD could open with>"
    }
  ]
}$prompt$,
    '["industry","domain_slug"]'::jsonb, true, NULL, now()
  );

  -- ── Stage 2: the scoring shape, one family at a time ────────────────────
  INSERT INTO vani_prompt (key, version, scope, body, variables, active, approved_by, approved_at)
  VALUES (
    'vara.domain_pack.starter', 1, 'system',
    $prompt$You are a talent-market researcher. Describe how ONE role family is assessed, so a hiring manager starts from a real shape rather than a blank page.

Industry: {{industry}}
Role family: {{family_name}}
What it owns: {{family_hint}}
Typical titles: {{family_titles}}

Describe 4-6 must-haves, the knockouts if any, and the handover threshold.

RULES

1. Public market knowledge ONLY. Nothing about any specific employer.
2. Weights MUST sum to exactly 100.
3. A must-have has to DISCRIMINATE. If it would be true of every applicant for this family, it is not a signal — "Proficiency in programming languages" separates nobody applying for an engineering role. Name the capability that separates a strong candidate from a plausible one.
4. `why` states what the signal is FOR, in one line, and must not restate the name.
   Bad:  "Proficiency in programming languages" → "To develop and maintain software applications"
   Good: "Owns a service in production" → "Can be paged at 2am and resolve it unaided"
5. `years` is optional and belongs only where this family really gates on tenure. Omit it rather than guessing — a fabricated number becomes a filter that rejects real people.
6. KNOCKOUTS ARE ALMOST ALWAYS THE SAME THREE. A knockout is a hard, binary, checkable gate that rejects a candidate with NO score, so a wrong one rejects everybody. Use only:
      - work authorization for the country the role is in
      - notice period
      - a statutory licence or registration that legally BARS unlicensed practice, and only where one exists — medicine, law, aviation, accountancy, commercial driving
   If you cannot name the body that issues it and the law that requires it, IT IS NOT A KNOCKOUT. There is no licence to write software, no certification required to manage a product, no registration needed to engineer data. Inventing one rejects every real candidate in the industry.
   Anything desirable but not legally required is a must-have, never a knockout. An empty knockouts list is a correct answer.
7. `threshold` is the score at which Vara hands a candidate to a human, NOT a pass mark. 30 is the platform default and the usual answer; 25 is a wider net, 40 is strict. Above 50 almost nobody reaches a human. Stay in 25-40 unless this family genuinely justifies otherwise.

Return ONLY JSON:
{
  "musthaves": [
    { "name": "<capability>", "weight": <int>, "years": <int, optional>, "why": "<what this signal is for>" }
  ],
  "knockouts": [ { "label": "<gate>", "rule": "<checkable condition>" } ],
  "threshold": <int, usually 30>,
  "band_hint": "<compensation shape, or a note that it varies>"
}$prompt$,
    '["industry","family_name","family_hint","family_titles"]'::jsonb, true, NULL, now()
  );

  RAISE NOTICE '251: two-stage prompts active; vara.domain_pack.research retired';
END
$mig$;
