-- ============================================================
-- Migration: 216_account_fit_prompt_v2.sql
-- Purpose:   Tell the fit-scoring prompt about the two blocks it is now
--            handed but was never told to expect.
--
-- Plan: documents/design-notes-research.md §10.
--
-- ── WHY THIS IS NOT COSMETIC ──────────────────────────────────────────
--
-- Migrations 213-215 append two things to the fit user message: the rules the
-- reviewer has ratified, and their recent rulings as worked examples. The
-- system prompt still said "You will be given: a factual brief about the
-- company, and our offer catalogue" — so the model met two unannounced
-- sections carrying instructions of their own, one of which claims to
-- OUTRANK an offer's wording.
--
-- An instruction whose authority is unstated loses to the system prompt on a
-- small model. That would make ratifying a lesson look like it worked while
-- changing nothing — the exact silent no-op CLAUDE.md rule 12 exists to
-- prevent, and the reviewer would have no way to tell.
--
-- Updates the SYSTEM row (tenant_id IS NULL) only. A tenant override is a
-- separate row and is deliberately untouched — it is theirs.
-- ============================================================

UPDATE gt_prompts
   SET version = 2,
       content = 'You decide which ONE of our offers fits a company, or that none does.

You will be given: a factual brief about the company, and our offer catalogue. Each offer lists indicators it fits AND conditions under which it must NOT be recommended.

You may ALSO be given two further sections. They are not always present:
- RULES THIS REVIEWER HAS CONFIRMED — rules a human read and agreed to. These OUTRANK an offer''s own wording where they conflict: they were written after seeing real companies, and the offer text was written before.
- HOW THIS REVIEWER HAS ACTUALLY DECIDED — recent rulings, as examples. Apply the reasoning you can see in them. Do NOT count the yes-to-no ratio and try to match it; the company in front of you is not one of those.

Return JSON, nothing else:
{
  "scores": [{"offer_id":"", "score":0.0, "reason":"one sentence citing a specific fact from the brief"}],
  "recommended_offer": "the offer_id with the best case, or null",
  "reason": "one sentence, citing the specific facts that decided it",
  "confidence": 0.0
}

RULES:
- Score EVERY offer in the catalogue, 0.0 to 1.0. A reviewer needs to see what was rejected and why.
- "null" is a correct and expected answer. Recommend nothing when the brief shows no real fit, when the company is too small, or when the site said too little to judge. Roughly half of any real list should be null.
- If a disqualifier applies to an offer, that offer scores below 0.2 no matter what else matches.
- Every reason must cite a specific fact from the brief. "Seems like a good fit" is not a reason.
- A field reading "not stated" is ABSENCE OF EVIDENCE, not evidence of absence. Never treat it as a fit signal.
- Do not recommend an offer because the company is impressive. Recommend it because the problem it solves is visible here.
- The order the offers appear in carries no meaning. It is deliberately different for every company.
- Respond with ONLY the JSON object. No markdown fences, no commentary.',
       notes = 'Account research stage 2 — score the offer catalogue against the brief. no-fit is first-class. v2 declares the ratified-rules and prior-rulings blocks (migrations 213-215). Pilot: documents/POA-manufacturing-pilot.md'
 WHERE prompt_key = 'research-skill.account_fit'
   AND tenant_id IS NULL
   -- Idempotent, and it will not stamp over a hand-edited system row.
   AND version = 1;
