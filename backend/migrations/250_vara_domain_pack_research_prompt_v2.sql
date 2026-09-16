-- ============================================================================
-- 250_vara_domain_pack_research_prompt_v2.sql
--
-- Version 2 of vara.domain_pack.research. Data only — no new tables, columns,
-- enums or indexes. vani_prompt is append-only: v1 is deactivated, v2 inserted
-- active, so the pack researched on 2026-09-16 can still be traced to the
-- exact text that produced it (vani_domain_pack.payload.researched records the
-- prompt version).
--
-- WHAT v1 GOT WRONG, from its one real run (gt_agent_runs id 86,
-- technology-saas, qwen3-4b, 3m41s). It returned valid nested JSON first time,
-- which was the thing most in doubt. Everything below is a prompt failure, not
-- a model failure:
--
-- 1. INVENTED CREDENTIALS AS KNOCKOUTS. It produced "Valid software
--    development license", "Valid data engineering certification", "Valid
--    product management certification". None exist. A knockout rejects a
--    candidate outright with no score, so publishing those would have
--    rejected every real applicant across every tenant in the industry. v1
--    said "licence held" as an EXAMPLE and got licences back. v2 requires a
--    nameable issuing body and bans the category outright where none exists.
--
-- 2. THRESHOLDS ON THE WRONG SCALE — 85 / 80 / 75, where migration 244's
--    handwritten packs use 30 and vara_family_profile.default_threshold
--    defaults to 30. v1 said "<int 0-100>" and never explained what the number
--    gates, so the model answered like an exam pass mark.
--
-- 3. THREE FAMILIES, THREE TITLES EACH. v1 asked for "3-6" and got 3; small
--    models take the floor of a range. Measured consequence: matching real
--    typed titles against that pack, "SRE", "DevOps Engineer" and "QA
--    Engineer" found nothing at all.
--
--    Titles are now the MOST important field, because they are the match key.
--    A hiring manager types a title and the starter shape is found by matching
--    it; every title the pack omits is a tenant who gets nothing. Generic
--    must-haves cost little — the JD conversation sharpens them — but a missed
--    title costs the whole interaction.
--
-- 4. CIRCULAR `why`. "Proficiency in programming languages → To develop and
--    maintain software applications" restates the name. v2 shows the failure
--    rather than only the target.
--
-- Not fixed here, deliberately: v1 never saw the packs an industry already
-- has, so it reinvents a taxonomy instead of extending one. That needs a new
-- {{existing_families_json}} variable and a change in the agent, so it lands
-- with that code rather than in a data-only migration.
-- ============================================================================

DO $mig$
DECLARE
  v_sys_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM vani_prompt
     WHERE key = 'vara.domain_pack.research' AND scope = 'system' AND version = 2
  ) INTO v_sys_exists;

  IF v_sys_exists THEN
    RAISE NOTICE '250: vara.domain_pack.research v2 already present — nothing to do';
    RETURN;
  END IF;

  -- Append-only: v1 stays readable, it just stops being the active row. The
  -- partial unique index vani_prompt_one_active permits exactly one active row
  -- per (key, scope, tenant), so this order matters.
  UPDATE vani_prompt
     SET active = false
   WHERE key = 'vara.domain_pack.research' AND scope = 'system' AND active = true;

  INSERT INTO vani_prompt (key, version, scope, body, variables, active, approved_by, approved_at)
  VALUES (
    'vara.domain_pack.research', 2, 'system',
    $prompt$You are a talent-market researcher. Describe the hiring landscape of an industry so a hiring manager in it starts from a real shape rather than a blank page.

Industry, as the tenant typed it: {{industry}}
Canonical slug: {{domain_slug}}

Describe the role families this industry hires for. A role family is a cluster of roles sharing a skill profile and a hiring bar — "Backend Engineering", not "Senior Backend Engineer at a Series B".

Return AT LEAST 5 families, up to 8. Fewer than 5 means you have under-described the industry: go wider, and include the operational and support functions it hires for, not only the obvious headline roles.

Ground every family in what this industry actually hires. A hospital group hires clinicians, billing and compliance staff; a logistics firm hires fleet, warehouse and route planners. If you are describing software engineers for a non-software industry, you have the wrong answer — except for the small in-house technology function such an industry genuinely has, which belongs only if it is one of its most common hires.

TITLES MATTER MOST

`suggested_titles` is how a hiring manager finds this family: they type a job title and it is matched against your list. A title you leave out is a manager who gets no help at all.

Give 10-15 titles per family. Include:
  - the plain form and the senior/junior/lead/staff/principal variants
  - the common synonyms real companies use (Engineer and Developer; Manager and Lead)
  - adjacent specialisations that would sensibly start from this family's shape

RULES

1. Public market knowledge ONLY. You have not been given, and must not invent, anything about a specific employer.
2. Weights across musthaves in a family MUST sum to exactly 100.
3. `years` is optional and belongs only where the industry really gates on tenure. Omit it rather than guessing — a fabricated number becomes a filter that rejects real people.
4. `why` states what the signal is FOR, in one line, and must not restate the name.
   Bad:  "Proficiency in programming languages" → "To develop and maintain software applications"
   Good: "Owns a service in production" → "Can be paged at 2am and resolve it unaided"
5. KNOCKOUTS ARE ALMOST ALWAYS THE SAME THREE. A knockout is a hard, binary, checkable gate that rejects a candidate with NO score, so a wrong one rejects everybody. Use only:
      - work authorization for the country the role is in
      - notice period
      - a statutory licence or registration that legally BARS unlicensed practice, and only where one exists — medicine, law, aviation, accountancy, commercial driving
   If you cannot name the body that issues it and the law that requires it, IT IS NOT A KNOCKOUT. There is no licence to write software, no certification required to manage a product, no registration needed to engineer data. Inventing one rejects every real candidate in the industry.
   Anything desirable but not legally required is a musthave, never a knockout. An empty knockouts list is a correct answer.
6. `threshold` is the score at which Vara hands a candidate to a human, NOT a pass mark. 30 is the platform default and the usual answer; 25 is a wider net, 40 is strict. Above 50 almost nobody reaches a human. Stay in 25-40 unless the industry genuinely justifies otherwise.
7. Write nothing you cannot source to general knowledge of this industry. Leave a field out rather than fill it.

Return ONLY JSON matching this schema:
{
  "families": [
    {
      "family_name": "<cluster name>",
      "hint": "<one line — what this family owns>",
      "suggested_titles": ["<title>", "... 10-15 of them"],
      "role_summary_hint": "<one line a JD could open with>",
      "musthaves": [
        { "name": "<capability>", "weight": <int>, "years": <int, optional>, "why": "<what this signal is for>" }
      ],
      "knockouts": [ { "label": "<gate>", "rule": "<checkable condition>" } ],
      "threshold": <int, usually 30>,
      "band_hint": "<compensation shape, or a note that it varies>"
    }
  ]
}$prompt$,
    '["industry","domain_slug"]'::jsonb,
    true,
    NULL,
    now()
  );

  RAISE NOTICE '250: vara.domain_pack.research v2 active; v1 retained inactive';
END
$mig$;
