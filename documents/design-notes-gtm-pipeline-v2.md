# GTM pipeline v2 — the user's five-stage model (2026-07-27)

> Captured from the user's direction after the first full live run of
> the wizard + Storyteller. **This revises the agent sequencing** that
> the original locked scope (ICP + pitch) implied. Supersedes the
> "deck inside onboarding" flow once implemented. Companion reference:
> `documents/customer-journey-maps.pdf` (user-supplied journey-mapping
> framework — the stage vocabulary for stage-aware storytelling).

## The ruling that triggered this

Storyteller inside onboarding is a **landmine**: the deck is an
externally shareable artifact generated from the thinnest possible
inputs (one crawl, unvalidated ICP, zero competitive context). A weak
deck shared by an excited new tenant in their first hour damages the
tenant's credibility and the product's. Storytelling must come AFTER
research and competitor evaluation — quality of story is downstream of
depth of understanding.

The onboarding "wow" does not need to be the deck. The researched
company card + competitor map IS the wow; the deck is the reward at
the end of a properly fed pipeline.

## The five stages (user's words, structured)

1. **Competitive analysis** — who shapes the buyer's expectations;
   positioning angles per competitor. (KG already extracts Competitor
   nodes + DIFFERENTIATES_FROM edges from the crawl; the /design/research
   screen is the surface; NOT yet in the live wizard.)
2. **Business model analysis** — OPEN DISCUSSION, not committed.
   User: "not sure we are there yet right now, but worth to discuss."
   Shape TBD: revenue model / channels / cost structure extracted +
   confirmed, feeding qualification and pricing-fit in campaigns.
3. **Ideal customers** (domain/sector or otherwise) → the customer
   **pain points the ICP resolves**. (Today's profile step, but now
   explicitly downstream of competitive context.)
4. **Pain points → Storytelling** — stories EXPLAIN the pains. Deck,
   narratives, proof points. Gated on stages 1 + 3 being confirmed.
5. **Campaign creation** — drip marketing + storytelling + customer
   journey, composed. Sequences deliver stage-appropriate stories.

## The storytelling principle (load-bearing)

> "Story differs based on stage, customer, customer response, history,
> behaviour."

Storytelling is NOT a one-shot deck generator. It is a **contextual
story engine**: the same underlying truths (pains, differentiators,
proof from the KG) rendered differently per:
- **journey stage** (per customer-journey-maps.pdf's stage model)
- **customer** (persona/ICP segment, industry)
- **response/behaviour/history** (opened, clicked, replied, objected —
  Pulse and Sequence feed these signals back)

Implication for the KG (why the graph investment matters): stories are
assembled from graph facts + journey stage + behavioural state. The
deck is just ONE rendering (stage ≈ consideration, audience ≈ ICP).

## Implementation direction (proposed, pending user go)

- **Onboarding (wizard) becomes:** research company → confirm
  competitors (agent-produced from KG Competitor nodes; human
  keeps/removes — the design-mockup step 2 pattern) → confirm ICP +
  pains → **mission configured**. Deck REMOVED from the critical path.
- **Storyteller relocates** to a post-onboarding agent action (dashboard/
  war room), gated on: profile approved AND competitors confirmed.
  Share link unchanged once generated.
- Wizard's locked steps 4–6 relabel to match the five stages as agents
  ship (competitive analysis is buildable NOW from existing KG data).
- Business-model analysis: parked as stage 2 placeholder pending the
  discussion; do not build without the user.
- Deck quality improvements (user: "ok for now but requires
  improvements") become a Storyteller-agent workstream once it moves
  out of onboarding: richer prompt grounded on KG edges (Metric PROVES
  Differentiator), competitor angles from stage 1, and later
  stage-aware variants.
