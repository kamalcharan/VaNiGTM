-- ============================================================
-- Migration: 208_account_research_prompts.sql
-- Purpose:   The three prompts the account research agent runs, one per
--            stage.
--
-- Plan: documents/POA-manufacturing-pilot.md, Step 2.
--
-- Many small prompts, never one big one — same reasoning as research-skill:
-- each stage is its own call, the per-call context stays lean, and slow VPS
-- inference stays inside the timeout. It also means a bad extraction can be
-- diagnosed separately from a bad fit judgement.
--
-- ── THE ONE RULE ALL THREE SHARE ──────────────────────────────────────
--
-- Nothing may be asserted that is not in the supplied page text. These
-- prompts are read by a small local model (qwen3:8b) which will happily
-- invent a plausible certification for a pharma company if the format
-- invites it, and an invented detail in a first touch is the one mistake
-- that cannot be walked back. So: every claim carries the URL it came from,
-- and "not stated" is an accepted, expected answer.
--
-- ── IDEMPOTENCE, EXPLICITLY ───────────────────────────────────────────
--
-- Guarded with WHERE NOT EXISTS rather than ON CONFLICT DO NOTHING. The
-- uniqueness that would catch a re-run is a PARTIAL index
-- (idx_gt_prompts_active_system, on prompt_key WHERE tenant_id IS NULL AND
-- is_active), so ON CONFLICT works only while that index exists exactly as
-- migration 181 wrote it. Lesson 3 in CLAUDE.md is that migration history
-- drifts from schema reality; a duplicate system prompt would then make
-- loadPrompt's LIMIT 1 pick one of two arbitrarily, which is the kind of
-- bug that takes a day to see.
--
-- Tenant overrides (gt_prompts.tenant_id NOT NULL) take priority at load
-- time and are untouched here.
-- ============================================================

DO $$ BEGIN
    IF to_regclass('public.gt_prompts') IS NULL THEN
        RAISE EXCEPTION
            'Missing prerequisite table gt_prompts — it comes from migration 181 and must really exist, not merely be recorded as applied in vn_migrations.';
    END IF;
END $$;

INSERT INTO gt_prompts (prompt_key, version, content, notes, is_active)
SELECT v.prompt_key, v.version, v.content, v.notes, v.is_active
FROM (VALUES
(
    'research-skill.account_extract',
    1,
    'You read a company''s own website and record ONLY what it actually says.

You will be given page text, each block prefixed with the URL it came from.

Return JSON, nothing else:
{
  "what_they_make": "one or two sentences, concrete products",
  "scale_signals": "sites, plants, staff, turnover, export markets, years — only if stated",
  "service_signals": "servicing, AMC, maintenance, installation, support offerings — only if stated",
  "digital_maturity": "named systems (ERP, LIMS, SAP), digital or automation initiatives, tech roles being hired — only if stated",
  "certifications": ["exact certification names as printed"],
  "named_contacts": [{"name":"", "title":"", "email":"", "phone":""}],
  "evidence": [{"claim":"the claim, copied from a field above", "url":"the source url", "excerpt":"<=200 chars of the page text supporting it"}]
}

RULES — these matter more than completeness:
- Never state anything the page text does not support. Write "not stated" for any field the site does not cover.
- EVERY non-empty field must appear in `evidence` with the url and an excerpt containing it. A claim with no excerpt is a mistake.
- Copy names, certifications and numbers exactly as printed. Do not expand abbreviations, do not tidy them.
- Do not infer scale from tone. "Leading manufacturer" is marketing, not a scale signal.
- Only list contacts actually printed on the site. Never construct an email address from a pattern.
- Respond with ONLY the JSON object. No markdown fences, no commentary.',
    'Account research stage 1 — extract facts from the company site, evidence-bound. Pilot: documents/POA-manufacturing-pilot.md',
    true
),
(
    'research-skill.account_fit',
    1,
    'You decide which ONE of our offers fits a company, or that none does.

You will be given: a factual brief about the company, and our offer catalogue. Each offer lists indicators it fits AND conditions under which it must NOT be recommended.

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
- Respond with ONLY the JSON object. No markdown fences, no commentary.',
    'Account research stage 2 — score the offer catalogue against the brief. no-fit is first-class. Pilot: documents/POA-manufacturing-pilot.md',
    true
),
(
    'research-skill.account_hook',
    1,
    'You write ONE opening observation for a first approach to a company.

You will be given a factual brief about them and the offer we intend to discuss.

Return JSON, nothing else:
{
  "hook": "one or two sentences",
  "evidence_url": "the url that supports it"
}

RULES:
- It must be specific to THIS company and verifiable on their own website. If it could be said to any manufacturer, it is wrong.
- Anchor it to something concrete: a product line, a second unit, a certification, an export market, a stated plan.
- Do not flatter. Do not open with "I was impressed by". Do not mention our offer, our company, or ask for a meeting — this is the observation only.
- Do not state a problem they have not shown. You may note what follows from a fact ("three plants, each with its own batch records"), never invent a complaint.
- If the brief is too thin to say anything specific, return {"hook": null, "evidence_url": null}. A missing hook is a correct answer and better than a generic one.
- Under 40 words.
- Respond with ONLY the JSON object. No markdown fences, no commentary.',
    'Account research stage 3 — the one specific observation a first touch opens with. Pilot: documents/POA-manufacturing-pilot.md',
    true
)) AS v(prompt_key, version, content, notes, is_active)
WHERE NOT EXISTS (
    SELECT 1 FROM gt_prompts p
     WHERE p.prompt_key = v.prompt_key
       AND p.tenant_id IS NULL
);
