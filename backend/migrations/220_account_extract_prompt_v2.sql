-- ============================================================
-- Migration: 220_account_extract_prompt_v2.sql
-- Purpose:   Tell the extraction prompt that it may now be reading TWO
--            sources, and that they are not equally trustworthy.
--
-- The agent now searches the web for every company as a second source
-- (NEXT item 6). Each block in the user message is labelled "their own
-- website" or "a web search result, NOT their own site".
--
-- ── WHY THE PROMPT HAS TO CHANGE ──────────────────────────────────────
--
-- The old prompt was written for one source and says "the page text". Handed
-- two, a small model will happily merge a trade-journal claim and a homepage
-- claim into one sentence — and then the excerpt it quotes matches whichever
-- block it happened to copy from, so the evidence tier recorded against it is
-- effectively random. Tiering that cannot be trusted is worse than none: it
-- puts a confidence marker on a coin toss.
--
-- The instruction added is therefore narrow and mechanical: quote from ONE
-- block per claim, and never blend.
--
-- Updates the SYSTEM row only (tenant_id IS NULL). A tenant override is a
-- separate row and is theirs.
-- ============================================================

UPDATE gt_prompts
   SET version = 2,
       content = 'You extract structured facts about a company from source material.

You will be given the company name and one or more SOURCE blocks. Each block is labelled either "their own website" or "a web search result, NOT their own site". Both are usable. They are not equally reliable, and the labelling exists so a human reviewer can tell them apart afterwards.

Return JSON, nothing else:
{
  "what_they_make": "one or two sentences, or null",
  "scale_signals": "plants, units, capacity, headcount, exports — or null",
  "service_signals": "service, AMC, support offerings — or null",
  "digital_maturity": "named systems, ERP, portals, automation — or null",
  "certifications": ["exact names as printed"],
  "named_contacts": [{"name":"", "title":"", "email":"", "phone":""}],
  "evidence": [{"claim":"", "url":"", "excerpt":"a VERBATIM span copied from one source block"}]
}

RULES:
- Every claim in `evidence` must quote an excerpt copied VERBATIM from ONE source block, and `url` must be that block''s URL. An excerpt that appears in no block is discarded, and the claim resting on it goes with it.
- NEVER blend two blocks into one claim. If their website and a search result say related things, that is two entries with two urls, not one.
- Prefer their own website when both say the same thing.
- A field you have nothing for is null. A LIST you have nothing for is [] — never the string "not stated".
- Do not infer, estimate or round. "Multiple units" is not "three units".
- Do not repeat marketing adjectives as facts. "Leading manufacturer of APIs" is evidence that they make APIs, not that they lead.
- Certifications must be named exactly as printed (WHO-GMP, USFDA, CEP, DMF, ISO 9001). Never expand, never abbreviate.
- Respond with ONLY the JSON object. No markdown fences, no commentary.',
       notes = 'Account research stage 1 — source material to structured facts. v2 handles a second source (web search) and forbids blending blocks, so the evidence tier recorded per claim is meaningful. Pilot: documents/POA-manufacturing-pilot.md'
 WHERE prompt_key = 'research-skill.account_extract'
   AND tenant_id IS NULL
   -- Idempotent, and it will not stamp over a hand-edited system row.
   AND version = 1;
