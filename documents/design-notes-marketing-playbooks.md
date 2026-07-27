# Design notes — Claude marketing playbooks → VaNi agent blueprints (2026-07-27)

> Source: the user's Claude marketing plugin (7 skills) + searchfit-seo plugin.
> Raw playbooks preserved verbatim in
> `documents/skill-references/claude-marketing-skills.txt` (97KB — read it
> when building any agent below; this note is the map, not the territory).
>
> Why this matters: these skills are professional-grade STRUCTURED PLAYBOOKS
> for exactly the jobs VaNi's stage-4/5 agents must do. They encode what a
> complete campaign brief / email sequence / competitive brief / brand
> review contains. VaNi's edge over the generic skills: our agents fill
> these structures FROM THE TENANT'S KNOWLEDGE GRAPH (ICP, pains, confirmed
> competitors, differentiation angles, journey stage, behavioural signals)
> instead of interviewing the user — agent-produces-human-confirms.

## The one pattern every skill shares (adopt globally)

1. Gather inputs — ask ONLY for what's missing (VaNi: pull from KG/profile,
   ask the human only for genuine gaps).
2. Produce a rigidly structured output (numbered sections, tables).
3. Embed benchmarks so numbers always have context.
4. End by offering concrete next actions ("draft the pieces from this
   calendar?") — every artifact is a doorway to the next agent.

## Skill → VaNi mapping

### 1. campaign-plan → Campaign agent (pipeline v2 stage 5) — THE spec
The 10-section brief IS gt_campaigns' target shape:
overview (SMART objective) · audience · key messages (core + 3-4 supporting,
each with PROOF POINTS) · channel strategy (owned/earned/paid tables with
effort + metrics per channel) · week-by-week calendar WITH DEPENDENCIES
("landing page live before ads") · content-pieces inventory (must-have vs
nice-to-have) · success metrics BY CAMPAIGN TYPE (awareness/lead-gen/launch/
retention/event each get their own KPI table) · budget split · risks ·
next steps.
- Framework: Objective → Audience → Message → Channel → Measure. Objective
  types (awareness/consideration/conversion/retention/advocacy) map 1:1 to
  our journey stages (customer-journey-maps.pdf).
- Message hierarchy = why care → what is it → why you → do what. "Why you"
  comes straight from our DIFFERENTIATES_FROM angles.
- KG fill-ins: audience ← ICP fields; pains ← PainPoint nodes; proof
  points ← Metric/CaseStudy PROVES edges; differentiation ← competitor
  angles. The human confirms the brief like they confirm the ICP.

### 2. email-sequence → Sequence agent (stage 5) — data model + logic spec
- Sequence architecture FIRST: narrative arc, journey mapping per email,
  escalation logic, explicit success/exit definition.
- Per-email spec (this is the gt_sequence_emails row shape): 2-3 subject
  options · preview text (40-90 chars, complements not repeats) · one-line
  purpose · body (hook/body/CTA, 2-3 sentence paragraphs, personalization
  tokens) · ONE primary CTA · timing (days after trigger/previous, adjust
  on engagement) · segment conditions.
- Flow control — this implements the user's ruling "story differs based on
  response, history, behaviour": branching (opened-not-clicked → softer
  re-ask), exit on conversion, re-entry rules, suppression rules (in
  another sequence / contacted support recently). Pulse is the behavioural
  signal source.
- 8 sequence-type templates with email counts + cadence (onboarding 5-7 /
  14-21d, nurture 4-6 / 3-4w, win-back 3-5 / 30d, launch 4-6 / 2-3w …) —
  seed these as gt_prompts system templates.
- Benchmarks table (open/CTR/conversion/unsub by sequence type) — ship in
  the product so reports self-contextualize.

### 3. competitive-brief → research-skill v2 (the ANALYSIS layer we lack)
Our stage-1 agent does discovery + verification. The playbook adds what to
EXTRACT per competitor: messaging analysis (tagline, value prop, 3-5
themes, tone, how they frame the problem) · Promise/Evidence/Mechanism/
Uniqueness · narrative analysis (villain/hero/transformation/stakes — what
they position AGAINST) · strengths/weaknesses · comparison matrix vs
tenant · content-gap analysis · opportunities/threats · battlecard-ready
recommended actions. Also: tiering (our mockup's Primary threat /
Down-market / Adjacent) and a research cadence model (quarterly deep,
monthly monitor → future scheduled re-research).
→ v2 = richer properties on Competitor nodes + a generated battlecard
artifact per confirmed competitor.

### 4. brand-review → the automated pre-approval gate (stages 4-5)
Severity-ranked deviations with before/after fixes, across: voice/tone,
terminology (preferred + AVOID terms), messaging-pillar alignment,
unsubstantiated claims + missing disclaimers.
→ Two implications: (a) tenant profile needs brand-voice fields (voice
attributes, avoid-terms, claim whitelist) — candidates for Phase 2 schema;
(b) every externally-visible artifact (deck, email, post) gets an agent
brand-review pass BEFORE reaching the human gate — the agent critiques its
own draft, human sees draft + flagged issues. Cheap, high-trust.

### 5. performance-report → gtm-analytics agent / war-room feed
Exec summary · metrics dashboard (tables per report type) · trend analysis ·
what worked / what needs improvement · insights · prioritized
recommendations · next-period focus. Channel benchmark tables (email,
social, paid, SEO, content, pipeline) + weekly/monthly/QBR templates +
attribution-model basics + optimization levers by funnel stage.
→ The war-room's narrative layer: not charts, but "what worked, what
didn't, do this next" — generated from gt_ campaign/sequence/pulse data.

### 6. content-creation / draft-content → Storytelling agent (stage 4)
Channel-specific formatting rules, headline/subject options, SEO
considerations, CTA patterns. Feeds the contextual story engine: same KG
truths rendered per channel × journey stage × persona. Deck = one
rendering; these playbooks define the OTHER renderings (blog, social,
landing page, case study).

### 7. seo-audit + searchfit-seo → Auditor agent (the PLG upsell)
Keyword research → on-page audit → content gaps → technical checklist →
competitor SEO comparison → prioritized plan split QUICK WINS vs STRATEGIC.
Our wizard's site_health findings (no meta, no JSON-LD, JS-only rendering…)
are the free teaser; this playbook is the paid Auditor's full report
structure. searchfit-seo's granular skills (schema-markup, ai-visibility,
internal-linking…) are the per-finding drill-downs.

## What VaNi adds that the skills can't
- KG grounding: proof points, pains, angles come from verified tenant data
  with provenance (source_url), not from an interview.
- Behavioural loop: Pulse/Sequence signals feed branching — the skills
  design static flows; VaNi's run live.
- The human gate is IN the product (approval workflow), not a chat reply.

## Recommended build order (pending user go)
1. **Brand-voice fields + auto brand-review gate** — small, improves every
   downstream artifact, and the deck-quality workstream needs it anyway.
2. **research-skill v2 analysis layer** (tiering + battlecard) — extends a
   live agent; the wizard mockup already shows tiers.
3. **Sequence + campaign agents** from playbook-seeded gt_prompts — the
   stage-5 build, sized by the structures above.
- NOT copying: budget-allocation guidance (needs tenant financials we
  don't collect) and paid-channel operations (no ad integrations yet) —
  keep those sections as report placeholders.
