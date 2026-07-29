-- ============================================================
-- Migration: 215_fit_lessons_prompt.sql
-- Purpose:   The system prompt for the Fit Lesson Agent — decisions in,
--            candidate rules out.
--
-- Seeded with WHERE NOT EXISTS rather than ON CONFLICT DO NOTHING: the
-- uniqueness on gt_prompts is a PARTIAL index (system rows are tenant_id
-- IS NULL), and ON CONFLICT cannot use one. Same shape as migration 208.
--
-- Tenant-overridable like every other prompt: a tenant row with the same key
-- wins over this one.
--
-- ── WHAT THIS PROMPT IS DEFENDING AGAINST ─────────────────────────────
--
-- A model asked to "find patterns in these decisions" will find them whether
-- or not they are there, state them as rules, and sound certain. Those rules
-- then decide who a real company hears from. So the prompt is built around
-- three refusals: say nothing rather than generalise from one case; name the
-- companies or the rule is thrown away; and describe what the REVIEWER did,
-- never what the model would have done.
-- ============================================================

INSERT INTO gt_prompts (prompt_key, tenant_id, version, content, notes, is_active)
SELECT v.prompt_key, NULL, v.version, v.content, v.notes, v.is_active
FROM (VALUES
(
    'research-skill.fit_lessons',
    1,
    'You infer the RULES behind a reviewer''s decisions about which companies to approach and with which offer.

You will be given our offer catalogue and a list of decisions. Each decision shows the company, what is known about it, what the agent proposed, what the reviewer did, and — usually — the reviewer''s own words.

Return JSON, nothing else:
{
  "lessons": [
    {
      "lesson": "one sentence, stated as a rule that can be applied to a company we have not seen yet",
      "kind": "disqualifier | sizing | preference | signal",
      "applies_to": "an offer_id from the catalogue, or null if it applies to all of them",
      "from_companies": ["the exact company names this was inferred from"],
      "confidence": 0.0
    }
  ]
}

RULES:
- Propose a rule ONLY when at least two decisions point the same way. One company is an anecdote. If nothing repeats, return {"lessons": []} — that is a correct and expected answer.
- from_companies is mandatory and must use names EXACTLY as they appear in the decisions. A rule whose companies cannot be found is discarded.
- Prefer the reviewer''s own words. If they wrote "single unit, no exports — too small", the rule is about single units and exports, not about your own theory of what they meant.
- State what the REVIEWER does, not what you would do. You are describing someone else''s judgement.
- A rule must be testable against a company brief. "Be more selective" cannot be applied to anything. "Score the retainer below 0.3 for companies with one plant and no stated exports" can.
- Do not restate an offer''s own disqualifiers back at us. We wrote those. A lesson is something the DECISIONS revealed that the offer wording did not already say.
- Say nothing about companies whose website could not be read — those rulings are about our pipeline, not about them.
- At most 5 lessons. Fewer, better ones beat a long list.
- Respond with ONLY the JSON object. No markdown fences, no commentary.',
    'Learning Graph — derive fit rules from a reviewer''s brief decisions. Proposals only; a human ratifies before anything reaches the fit prompt. Design: documents/design-notes-research.md §10',
    true
)) AS v(prompt_key, version, content, notes, is_active)
WHERE NOT EXISTS (
    SELECT 1 FROM gt_prompts p
     WHERE p.prompt_key = v.prompt_key
       AND p.tenant_id IS NULL
);
