# UX References — INTERNAL REVIEW ONLY

> ⚠️ **Internal design reference. Nothing in this folder may be reused as an
> asset.** `agent-wizard-flow.pdf` shows a third-party product's output and
> contains real-looking companies and people. It informs our design language
> and flow — no screenshot, name, logo, or data from it may appear in the
> product, marketing, or the landing explainer video. Everything we ship is
> built fresh with **synthetic data only**.

## agent-wizard-flow.pdf — what to take (the best, and only the best)

Six-step agent-led wizard: research company → explore competitors → define
campaigns → find potential customers → find decision makers → write emails.

Adopt these patterns (rebuilt in VDF, our theme, synthetic data):

1. **Agent produces, human confirms.** Every step opens with the agent's
   finished work (company card, competitor list, drafted campaigns), not an
   empty form. The human edits/confirms and moves on. This is the onboarding
   model for VaNi GTM — replaces form-first onboarding.
2. **Accumulating left rail = mission memory.** Each completed step collapses
   into the rail (✓ step 1 · Research your company …) and stays inspectable.
   The rail is the audit trail of what the agent did.
3. **Numbered step chips across the top** with the active step as a pill —
   simple, always-visible progress.
4. **Campaign cards drafted with substance:** pain statement + qualification
   criteria + example target companies + live prospect count. Cards are
   decisions to approve, not blanks to fill.
5. **Enrichment waterfall per contact** (step 6): provider chips tried in
   sequence with hit/miss states and a graceful "no email found". This is the
   UI contract for our universal connector.
6. **Prospect/decision-maker tables with operational columns:** description,
   location, size, monthly traffic / title + LinkedIn — data that supports a
   yes/no decision, nothing decorative.

Explicitly NOT adopted: its visual identity (we use VDF + our themes), its
providers, its data.

## Landing-page explainer video (to be produced)

- **Length:** 8–10 seconds, muted autoplay loop (mp4 + webm, target < 2 MB).
- **Content:** one continuous pass through the six steps using **synthetic
  data** (fictional company, fictional prospects): type a domain → company
  card materializes → competitors populate → campaign cards draft themselves →
  prospect table fills → a personalized email appears. Close on the product
  wordmark + one line ("Your AI GTM team.").
- **Goal:** anyone understands the product in one loop, no narration needed.
- Production notes: record from the real (rebuilt) wizard against a seeded
  synthetic tenant — not from this PDF.
