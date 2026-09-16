-- ============================================================================
-- 252_vara_starter_prompt_v2.sql
--
-- vara.domain_pack.starter v2. Data only. Append-only: v1 goes inactive and
-- stays readable, because published packs record the version that shaped them.
--
-- WHY. Run 90 was the first genuinely good output — eight families with real
-- coverage (Customer Success, Technical Support, Business Analysis, Security
-- & Compliance), every threshold 30, and knockouts confined to work
-- authorization and notice period with no invented licences. Rules 6 and 7 of
-- v1 landed exactly.
--
-- And then it put this as the TOP-WEIGHTED must-have in SIX of the eight:
--
--     31%  Owns a service in production
--          ↳ Can be paged at 2am and resolve it unaided
--
-- Including Product Management, Customer Success and Technical Support.
-- Nobody pages a CSM at 2am about a service.
--
-- That is verbatim from v1, which offered exactly those words as its
-- illustration of a good `why`. The model read the example as a template and
-- filled it in. My example, my bug.
--
-- Worth recording: the two families that escaped it — Security & Compliance
-- and Business Analysis — are also the two with by far the best must-haves,
-- and they are where the claude-haiku-4-5 failover took over. Copying the
-- example is what the smaller deployed model does. So this fix cannot be the
-- only one: `assertNoTemplateLeak` in domain-pack.agent.ts refuses any draft
-- where one must-have appears in more than half the families, whatever the
-- model or prompt does.
--
-- Two changes here:
--   - The example now comes from a HAULAGE firm. Copying "holds a clean
--     commercial licence" into a SaaS pack is self-evidently absurd in a way
--     that "owns a service in production" was not, so the form is still shown
--     without the content being reusable.
--   - A new rule makes specificity testable rather than aspirational: if a
--     must-have would make equal sense for a different family in the same
--     industry, it is not doing its job.
-- ============================================================================

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM vani_prompt
     WHERE key = 'vara.domain_pack.starter' AND scope = 'system' AND version = 2
  ) THEN
    RAISE NOTICE '252: vara.domain_pack.starter v2 already present — nothing to do';
    RETURN;
  END IF;

  UPDATE vani_prompt
     SET active = false
   WHERE key = 'vara.domain_pack.starter' AND scope = 'system' AND active = true;

  INSERT INTO vani_prompt (key, version, scope, body, variables, active, approved_by, approved_at)
  VALUES (
    'vara.domain_pack.starter', 2, 'system',
    $prompt$You are a talent-market researcher. Describe how ONE role family is assessed, so a hiring manager starts from a real shape rather than a blank page.

Industry: {{industry}}
Role family: {{family_name}}
What it owns: {{family_hint}}
Typical titles: {{family_titles}}

Describe 4-6 must-haves, the knockouts if any, and the handover threshold.

WRITE FOR THIS FAMILY AND NO OTHER

Every must-have must be specific to {{family_name}}. Before you keep one, ask whether it would make equal sense for a DIFFERENT family in this industry. If it would, it is not doing its job — it separates nobody, and scoring on it ranks every candidate the same.

"Strong communication skills" is true of every role ever advertised. "Can de-escalate a customer threatening to churn mid-renewal" is true of one.

Nothing in the instructions below is content to reuse. The examples show FORM. They are drawn from a different industry on purpose: if you find yourself writing about lorries in a software pack, or about production incidents in a customer-facing one, you are copying instead of describing.

RULES

1. Public market knowledge ONLY. Nothing about any specific employer.
2. Weights MUST sum to exactly 100.
3. A must-have has to DISCRIMINATE. Name the capability that separates a strong candidate from a plausible one, not the qualification everyone applying already has.
4. `why` states what the signal is FOR, in one line, and must not restate the name.
   For a haulage firm's Fleet Operations family:
     Bad:  "Fleet scheduling experience" → "To schedule the fleet"
     Good: "Has run a depot through a driver shortage" → "Keeps vehicles moving when the roster breaks, rather than escalating"
   Notice the good one names a situation and what the person does in it. Write that, about {{family_name}}.
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
    { "name": "<capability specific to this family>", "weight": <int>, "years": <int, optional>, "why": "<the situation, and what this person does in it>" }
  ],
  "knockouts": [ { "label": "<gate>", "rule": "<checkable condition>" } ],
  "threshold": <int, usually 30>,
  "band_hint": "<compensation shape, or a note that it varies>"
}$prompt$,
    '["industry","family_name","family_hint","family_titles"]'::jsonb,
    true, NULL, now()
  );

  RAISE NOTICE '252: vara.domain_pack.starter v2 active; v1 retained inactive';
END
$mig$;
