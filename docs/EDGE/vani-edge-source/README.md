# VaNi Edge — guided decision-intelligence UX

A modular, dependency-free prototype for AutomationEdge. Requires Node.js. Extract this folder, run `npm start`, then open http://127.0.0.1:4173. Run `npm test` for verification.

## Explore the mission

Start with my business → inherited ICP context → respondent and process actors → P2P or O2C scope → adaptive pain discovery and desired gains → editable process board → rules and systems → guided evidence requests → process explorer → findings and hypotheses → readiness → value and controls → implementation brief.

The investigation asks about every selected pain, records the answer's basis and accepts unknowns. Assign questions to named contributors, record their responses, and keep unresolved questions visible. The process board supports activities, decisions, owners, systems, inputs, outputs and exception/parallel connections. Move activities by their handles or edit their positions.

At the evidence chapter, choose the labelled sample to explore the complete demonstration. P2P uses the supplied mission reference data, including five pathways and case timelines. O2C uses an explicitly invented scenario. Your own attachments never silently become sample findings.

## Structure

- `src/mission/domain.js`: chapters, P2P/O2C questions, rules and evidence requests
- `src/mission/store.js`: mission state and optional local save/resume
- `src/mission/discovery.js`: follow-ups, hypotheses and readiness blockers
- `src/mission/views-*.js`: context, discovery, board, evidence and intelligence views
- `src/mission/main.js`: navigation, forms, dialogs, board interaction and scripted help
- `src/mission/brief.js`: complete downloadable mission dossier
- `src/views/assessment.js`: reusable value comparison and implementation views
- `src/views/booking.js`, `src/config.js`: consultation handoff
- `src/lib/model.js`: CSV checks, calculations and escaping
- `styles/`: visual tokens and responsive styles
- `data/`: original reference samples and explorer data
- `tests/`: calculations, parsing, mission coverage and rendering checks

## What is connected

Local interactions, CSV header/row inspection, editable planning calculations, manual sample downloads, complete text brief download and the Calendly link. Saving is opt-in on this browser profile. Saved answers and file summaries can be resumed; raw files are not stored and must be reattached. The original files in AI Probe remain unchanged.

## UX-only boundaries

No live ICP lookup, LLM, customer-data mining, spreadsheet/document extraction, shared accounts, invitation delivery or payment is connected. Sample readiness scores are reference values, not recomputed customer scores. Own-data mode exposes gaps and untested hypotheses. Value estimates use editable assumptions and distinguish capacity from cash savings. Contributor requests are local drafts, not sent invitations.

Agent activation/payment is outside this flow. The 200,000-token allowance, low/exhausted states and top-up/resume are demonstrable UX states, not provider metering or a purchase. No price is implied.

## Booking

The review opens https://calendly.com/connect-vikuna/30min. Users complete scheduling there. The app does not claim booking success or transmit assessment data automatically. Download the brief to bring to the consultation.

## Pathway decisions
The explorer pairs the branching graph with route explanations, declared-process comparison, controls, ownership, fallback and open questions. Coverage carries into readiness, value and the implementation brief. Incomplete decisions and open questions remain unresolved. P2P exposes five original paths; the remaining 42 paths (16% of sample cases) stay unreviewed. No unseen route is fabricated. Value assumptions remain separate planning inputs and are not inferred from sample route coverage.
