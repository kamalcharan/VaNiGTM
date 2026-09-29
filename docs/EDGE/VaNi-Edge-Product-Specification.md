# VaNi Edge — Product specification

Version 1.2 · 29 September 2026 · Proposed production specification
Product owner: to assign · Brand: VaNi Edge by AutomationEdge

### Revision 1.2 — Unified strategy journey (supersedes separate-mode design)
There is one assessment entry and one Automation Strategy. Failure history, near misses, workarounds, attempted corrections and their effectiveness are required discovery dimensions for manual, partly automated and automated processes. Investigation depth adapts to the evidence. “No known failures” and “Unknown” are valid responses, not proof of readiness.

The separate entry points, separate purchase and separate final report described in the earlier Section 22 design are superseded. Its investigation, causal discipline, corrective-action and verification requirements remain applicable within the unified strategy. Existing failure records must be preserved during migration. Hypotheses, unresolved causes, corrective actions and verification evidence feed readiness, proposed scope and the strategy report; users never need to restart in a different mode.

### Revision 1.1
Adds Failure Review & Corrective Action Planning as a second product mode, market evidence and industry priorities. These are target requirements; this revision does not implement the new mode in the UX or connect production services.

## 1. Product decision

VaNi Edge is a paid, guided automation readiness and strategy assessment for business leaders. It helps a customer understand where a process stands, which pathways can be considered for automation, what could go wrong and what must be resolved before investment.

**Promise:** Before you automate, know where you stand.

**Purchased outcomes:** Readiness mode delivers an evidence-linked Automation Strategy; Failure Review mode delivers an evidence-linked Failure Review & Corrective Action Plan. Both are independent decision products.

**Readiness deliverable:** An evidence-linked Automation Strategy that the customer can use with their own team or any implementation partner. AutomationEdge execution services are optional. A justified decision to defer automation is a successful outcome.

The product uses process reconstruction and pathway analysis within a bounded assessment. Its initial scope does not include continuous enterprise process monitoring, universal system connectors or automatic deployment of operational agents.

### Success definition
A process owner can explain the recommended scope, exclusions, evidence, risks, assumptions and next actions to a decision-maker without founder assistance. The report must stand on its own without a consultation.

### Status of this document
Requirements below define target behavior, not capabilities already implemented. Proposed commercial limits and performance targets require owner approval before publication. This specification does not approve live billing, messaging or deployment.

## 2. Current product versus target

| Area | Current prototype | Required production behavior |
|---|---|---|
| Context | Editable illustrative company profile | Authorized ICP handoff, source and freshness, user correction |
| Interaction | Predefined branches and scripted chat | Adaptive questioning with a controlled coverage model |
| Evidence | Local CSV structure inspection; document metadata | Secure ingestion, extraction, semantic mapping, quality review and reproducible analysis |
| Process graph | Supplied P2P sample; invented O2C illustration | Customer-specific graph from validated event evidence |
| Pathway decisions | Local explanations and treatment choices | Versioned decisions with dependencies, confidence and approval record |
| Readiness | Reference scores and preparation gaps | Evidence-based assessment with explicit gates and uncertainty |
| Strategy | Generated HTML and browser print | Versioned PDF, accessible web report and structured action register |
| People | Local contributors and request drafts | Permissioned contribution workflow and reconciliation |
| Persistence | Optional browser storage | Authenticated, tenant-isolated, resumable missions |
| Commercial | Illustrative allowance | Verified entitlement, usage ledger, bounded spend and top-up recovery |
| Delivery | Preview card; no messages sent | Automatic dispatch to verified destinations with truthful status |

Prototype layout and print behavior still require visual and accessibility validation. Passing current rendering tests does not establish production readiness.

## 3. Intended users and roles

Primary buyers: business leaders and process owners considering automation investment. Participants may include finance, operations, procurement, sales, IT, data owners and control owners.

| Role | Responsibilities and access |
|---|---|
| Assessment owner | Defines scope, invites contributors, manages evidence, accepts revisions and generates report |
| Sponsor / decision-maker | Reviews strategy and assumptions; approves business decisions when assigned |
| Contributor | Answers assigned questions and supplies permitted evidence; sees only the context granted |
| Data owner | Confirms exports, mappings, identifiers, dates and evidence limitations |
| Expert reviewer | Optional, explicitly invited review of findings and recommendations |
| Implementation partner | Receives only a customer-authorized report or workspace invitation |

Names, designations and process responsibility are captured independently of invitations. Adding someone never sends a message or grants access. Changes to membership and permissions are auditable.

## 4. Purchase and assessment boundary

Initial pricing hypothesis: ₹5,000 for one scoped process assessment and strategy. Price, taxes, refund terms and limits must be finalized separately.

An assessment scope includes process, entities/locations, transaction categories, date range, systems, desired outcomes and contributors. A scope change that materially expands evidence or work requires a visible change summary and entitlement check.

Before payment, show supported evidence requirements and allow a lightweight suitability check. If the available data cannot support pathway reconstruction, disclose the available preparation assessment before purchase. Do not promise a full observed-process strategy from invoices alone.

### Entitlements
- Assessment purchase includes the defined investigation and report.
- Agent top-up funds additional analysis within a disclosed allowance; it does not automatically buy implementation.
- Execution services require a separate scope and agreement, even if commercially offered as an upgrade.
- Completed reports, prior answers and exports remain accessible when analysis allowance is exhausted.
- Reserve enough included capacity for a bounded report from completed analysis. Do not surprise the customer with a top-up requirement just to receive the purchased output.
- File-size, case-count, contributor, revision, retention and allowance limits must be shown before purchase and configured server-side.

The 200,000-token figure in the prototype is an example, not an approved production limit. Customer-facing allowances should describe what work is included; technical token details can remain available in usage.

## 5. End-to-end journey

### 5.1 Entry and inherited context
Use the headline “Before you automate, know where you stand” and primary action “Assess my process.” Show the five strategy outcomes: readiness, risks, proposed scope, value assumptions and roadmap.

Consume the authorized ICP profile. Tag each fact as customer-confirmed, sourced or inferred, with timestamp and provenance. Ask only for missing or stale context. Confirming a company profile must not validate internal operating assumptions.

### 5.2 People and report destinations
Capture respondent name, designation, role and represented teams. Capture email and optional WhatsApp number with an explanation that these receive the strategy automatically. Verify destinations before automated dispatch. Report delivery is separate from marketing permission.

Support existing assessments without contact details: report download remains available; request destination completion without invalidating the assessment.

### 5.3 Scope, pain and desired gains
Ask for recent incidents, frequency, affected people, consequences and current workarounds. Follow each relevant pain until the explanation is sufficient or explicitly unresolved. Capture desired outcome, priority, baseline, target, unit, owner and desired timing. Distinguish ambition from forecast.

### 5.4 Declared process and rules
Build an editable process board collaboratively. Support activities, decisions, parallel work, returns, skips, cancellations and handoffs. Each activity can carry owner, system/channel, input, output and rule references.

Ask what is missing from the diagram. Capture thresholds, delegation, timing, tolerances and permitted exceptions with scope and effective date. A practice and a documented policy may differ; retain both until reconciled.

### 5.5 Evidence and analysis
Explain each export request, accepted format, source, required fields and question it can answer. Users attach records themselves. Templates and sample downloads are explicitly separate from customer evidence.

Confirm mappings and quality limitations before analysis. Provide useful preparation findings when evidence is insufficient, without generating an observed graph from assumptions.

### 5.6 Pathway investigation
Present the branching network alongside the selected route and its evidence. Review expected routes, legitimate exceptions, workarounds, control gaps and recording gaps. Link findings to case examples. Record proposed treatment, conditions, owner, fallback and unresolved questions.

### 5.7 Decision, value and report
Assess readiness against the intended scope. Compare continuing today, fixing the process, assisting people and bounded automation. Generate a downloadable strategy with evidence references and a decision record. Automatically dispatch the completed report to verified, authorized destinations. Offer execution planning as an optional continuation.

## 6. Adaptive interaction engine

### 6.1 Division of responsibility
AI adapts wording, question order, follow-ups, explanations and narrative synthesis. The application controls required coverage, permissions, allowed actions, calculations, evidence states and report gates.

Use a reviewed component catalogue: single-choice radio cards, multi-select checkbox cards, numeric inputs, text, evidence requests, process edits, case tables, conflict resolution and summaries. The model cannot inject executable UI, create arbitrary tools or change permissions.

### 6.2 The decision loop
1. Read scoped mission state, authorized evidence summaries and unresolved requirements.
2. Identify the most useful next information gap.
3. Select an allowed interaction and explain why it matters.
4. Validate the proposed interaction against schema, process-pack coverage and cost limits.
5. Render through accessible components.
6. Save the answer, author, basis, scope and timestamp.
7. Reconcile contradictions; invalidate affected conclusions where necessary.
8. Update the plan and explain what changed.

Question priority should consider decision impact, uncertainty, dependencies, user effort and duplication. Start with reviewed heuristics; validate model-assisted prioritization against expert cases before broad release.

### 6.3 Interaction contract
Each generated interaction contains:
- Stable interaction ID, process-pack version and target requirement IDs.
- Evidence/state version used to generate it.
- Question, short rationale and intended next use.
- Component type, answer schema and options where applicable.
- Source references and unresolved assumptions.
- Allowed actions: answer, clarify, assign, defer or correct prior context.
- Completion criteria and planned handling of an unknown answer.

Reject unsupported components, missing requirements, stale evidence references and speculative facts presented as observations. Fall back to a reviewed question when generation fails.

### 6.4 Conversation requirements
- Do not repeat a confirmed answer unless new evidence creates a reason to revisit it.
- An unknown answer is valid; assign it or keep it unresolved.
- After two unsuccessful clarification attempts, offer colleague input or deferral rather than a loop.
- Do not silently merge contradictory answers from different actors.
- Ask Edge shares mission context, but chat suggestions enter the formal assessment only through an explicit confirmation action.
- Scope changes and expensive reanalysis show expected work and allowance impact before starting.

### Example: “The CFO approves everything”
Edge checks whether this is policy or observed practice; asks about thresholds, delegation, absence and urgent cases; requests approval evidence; and compares the resulting routes. It must not conclude that the CFO is the bottleneck merely from this statement. A long receipt-to-approval interval includes other work and waits.

## 7. Evidence and process reconstruction

### 7.1 Ingestion states
Uploaded → validated → extracted → mapped → confirmed → analysed, with explicit failed/needs-review states. Preserve original files and derived versions. Reject unsupported or unsafe inputs with actionable feedback.

Minimum event schema: case identifier, activity and timestamp. Recommended fields: lifecycle start/end, actor/team, system, transaction value/currency, entity, document ID, rule reference and exception reason.

Support reviewed mappings for initial CSV/XLSX exports. Documents and email can supply context; OCR text alone does not establish a complete event history. Keep extraction confidence and require review where ambiguity affects a decision.

### 7.2 Quality controls
Check missing/duplicate identifiers, invalid dates, timezone handling, conflicting timestamps, repeated events, unmatched joins, cancelled records and open cases. Show retained/excluded counts and reasons. Record user decisions about corrections.

P2P and O2C can involve many-to-many relationships: partial receipts, multiple invoices per order and multiple payments per invoice. Define case granularity before calculating variants. Do not force these relationships into a single chain that creates artificial loops.

### 7.3 Analysis rules
- Compute metrics from structured records using deterministic, versioned logic.
- State denominator, period, exclusions and aggregation for every metric.
- Separate unique cases from activity occurrences.
- Distinguish elapsed time, business time and actual handling time.
- Treat incomplete cases consistently; do not compare them naively with completed cases.
- Preserve tied/uncertain event order and avoid claiming concurrency without suitable evidence.
- Associations and anomalies generate hypotheses; they do not establish causality or confirmed financial loss.
- Customer outputs never silently fall back to sample data.

## 8. Process explorer and pathway coverage

The explorer is a primary decision workspace, not decorative visualization.

Required controls: frequency/waiting-time views, zoom and pan, fit-to-view, filter by scope and date, route list, case drill-down, accessible tabular alternative and declared-versus-observed comparison.

Display filtering must never change the coverage denominator invisibly. If low-volume paths are hidden, show their combined case share and unresolved status. Review all material paths before including them in scope. Rare paths can remain excluded with an agreed human route.

### Route decision record
Route ID and analysis version; case count/share; observed sequence; declared-process relationship; explanation; source references; classification; proposed treatment; conditions; owner; fallback; open questions; reviewer and decision timestamp.

### Coverage rules
A proposed automation route counts only when the explanation, evidence basis, classification, scope, owner and fallback are complete; conditional treatment also needs testable conditions. Decision-blocking questions keep the route unresolved.

Use mutually exclusive case-level route assignments for additive percentages. When routes overlap or cases span variants, show a deduplicated denominator or explicitly non-additive measures. Human-handled cases count as understood handling, not automation coverage.

Report separately: evidence coverage, reviewed pathway coverage, proposed automation coverage and unresolved exposure. Volume alone must not hide a rare high-impact route. Represent severity and financial exposure separately where evidence permits.

Changing a rule, mapping or underlying file marks dependent route decisions stale and triggers targeted revalidation.

## 9. Readiness, risk and recommendations

Assess data sufficiency, pathway understanding, rule clarity, ownership, system access, control design, exception recovery and adoption. Use statuses such as evidence needed, prepare first, candidate for controlled pilot and retain human handling.

A global score is optional and must not replace activity/pathway decisions. If scores are introduced, publish the method, version, evidence inputs and gates; calibrate with independent expert review. Existing sample weights are not a validated production benchmark.

Hard gates for proposed pilot inclusion:
- Sufficient evidence for the claimed scope.
- Rules and exception treatment understood.
- Operational owner and recovery route assigned.
- Proposed access and controls reviewed.
- Test cases and success criteria agreed.

Risk appetite selects acceptable controls and scope. It cannot override a missing critical control or invent missing evidence. Clearly distinguish the customer's stated preference from an assessment of residual risk.

Each recommendation records what to do, why, supporting evidence, affected pathways, dependencies, owner, expected benefit range, assumptions, confidence and what would change the recommendation. Acceptable recommendations include defer, standardise, improve data, assist humans, automate conditionally and retain manual handling.

## 10. Value model

Calculate capacity from eligible volume × measured/assumed handling minutes × achievable effort reduction. Label every input as measured, user-estimated or illustrative.

Separate freed capacity, realised cash savings, elapsed-time improvement, working capital and avoided loss. Do not add overlapping benefits. Duplicate candidates are not recoverable cash until investigated.

Provide conservative/base/optimistic scenarios with visible inputs. Include preparation, implementation, recurring operation, human review, monitoring and adoption costs where known. Unknown costs remain explicit. Only show payback when sufficient cost and realised-benefit assumptions exist.

Opportunity cost is conditional: explain what benefit might be deferred, over which horizon and with which dependencies. Do not imply that all current manual effort is removable. Coverage from a reference sample cannot populate a customer's ROI automatically.

## 11. Automation Strategy deliverable

### Required contents
1. Executive decision and recommended immediate action.
2. Scope, actors, business objectives and success measures.
3. Evidence inventory, quality, exclusions and confidence.
4. Declared and observed process maps with accessible descriptions.
5. Reviewed variants, exceptions and pathway treatment matrix.
6. Findings, alternative explanations and unresolved hypotheses.
7. Readiness gates and risk/control register.
8. Prioritised opportunities with reasons and dependencies.
9. Value scenarios and explicit assumptions.
10. Preparation, design, pilot and rollout plan with owners and exit criteria.
11. Open action register and decision log.
12. Method, sources, calculation version and limitations.

Formats: accessible web report and production-generated PDF; structured action-register export. The report can be used with any implementation partner.

### Report states
Draft → preliminary or assessed → superseded. “Assessed” means the agreed assessment criteria are met; it does not certify that deployment is safe or approved. A preliminary report identifies missing evidence and next actions. A report can conclude that the process is not ready.

Before generation show a scope/evidence checkpoint. Report generation uses a frozen mission snapshot. Store report version, content hash, evidence version, process pack, calculation version and generation timestamp. New evidence creates a new report version rather than altering an already dispatched document.

## 12. Automatic delivery

Capture destinations early, verify them, show their purpose and allow changes before report generation. Do not use contributor contact details as report recipients by inference. Distribution beyond the assessment owner requires explicit selection and permission.

Report ready → create one dispatch job per opted-in verified channel. Use an authenticated report link by default; attach files only when appropriate to the approved delivery design.

Track queued, sending, provider-accepted, delivered where confirmed, failed and retrying. “Sent” requires provider acknowledgment; “delivered” requires delivery evidence. No inference of read status. Each card shows channel, masked destination, report version and timestamp.

Retries use an idempotency key based on report version, recipient and channel. One channel's failure must not block download or the other channel. Provide retry, edit destination and download actions. Destination edits require re-verification and must not resend old reports without user intent.

Prototype messages must remain labelled as simulations. Production message templates, retention policy and channel consent requirements must be reviewed before activation.

## 13. Interaction and accessibility requirements

- Desktop discovery uses a main task area with visible contextual guidance beside it.
- Guidance includes goal, why this question matters and what happens next; avoid repeated introductory blocks.
- Short single-answer sets use native radio semantics in selectable cards. Multiple answers use checkbox semantics and explicit instructions.
- Long/dynamic lists use accessible searchable selection.
- Never preselect a claimed evidence basis.
- One primary advance action per task; preserve drafts and explain validation inline.
- Header Ask Edge opens a labelled chat panel with predictable focus and close behavior. It never covers primary navigation unintentionally.
- Forms reflow at narrow widths and zoom. Graphs may pan inside a labelled region; surrounding content must not require horizontal scrolling.
- Keyboard access, visible focus, readable contrast, text alternatives and non-colour status cues are required.
- Sticky navigation reserves content space and remains usable with mobile keyboards.
- Save/resume restores the exact question, filters, open contributions and analysis state.

Test representative desktop, tablet, mobile and zoomed layouts. Deep evidence may scroll; reduce unnecessary scrolling without hiding essential guidance.

## 14. Domain model and technical boundaries

Core records: organisation, user, membership, mission, scope version, profile fact, participant, requirement, interaction, answer, contribution, rule, activity, connection, evidence asset, extraction, mapping, analysis run, event/case, variant, hypothesis, finding, route decision, readiness result, value scenario, report version, dispatch job, entitlement and usage entry.

Every derived claim carries source references and a dependency chain. Every user decision records author and timestamp. Use draft, confirmed, disputed, stale and superseded states where relevant; never overwrite history silently.

Service boundaries:
- Mission orchestrator: coverage, state, next-step planning and workflow transitions.
- AI gateway: provider abstraction, structured outputs, budget limits and logging.
- Evidence pipeline: parsing, quality checks, mapping and durable processing jobs.
- Analysis engine: graph, variants, metrics and reproducible calculations.
- Assessment engine: rules, readiness gates and recommendation eligibility.
- Report service: frozen snapshot, validation, rendering and storage.
- Delivery service: verified recipients, retries and channel status.
- Identity/entitlements: tenant scope, roles, purchase and allowance.

Do not send full datasets to the LLM by default. Compute aggregates and case slices first; retrieve the minimum authorized evidence needed for an interaction. Treat uploaded text as data, never as instructions to change system behavior or invoke tools.

## 15. Reliability, security and usage

- Server-side authorization on every asset, job and report; no cross-tenant retrieval.
- Encrypted transport/storage, scoped access links and auditable sharing.
- File validation and malware scanning; retention/deletion behavior defined before launch.
- Durable analysis/report jobs with restart recovery, idempotency and progress states.
- No charges for duplicate internal retries; reconcile provider usage against the customer ledger.
- Warn before expensive work, enforce per-job ceilings and avoid unlimited autonomous loops.
- On allowance exhaustion, pause new AI work at a recoverable checkpoint. Preserve read/export access.
- Log model/version, prompt template, source IDs, cost and validation outcome with appropriate sensitive-data minimization.
- Provider failure falls back to saved progress and reviewed prompts; never substitute fabricated findings.

Proposed service targets for pilot validation: ordinary navigation responds within one second; saved-answer acknowledgment within two seconds under normal conditions; long analysis always exposes status and recovery. Establish measured job-duration expectations by file size before publishing turnaround promises.

## 16. Process-pack architecture

A pack includes scope definitions, required coverage, evidence schemas, extraction mappings, terminology, rule families, known exceptions, analysis definitions, readiness gates, recommendation templates, value variables and evaluation cases.

P2P initial focus: purchasing, receipts, invoice capture/matching, approval and payment; include non-PO spend, retroactive POs, partial receipts, holds, returns and duplicate candidates.

O2C initial focus: order, fulfilment, invoicing, dispute, payment and cash application; include partial fulfilment/payment, credits, disputes, unapplied cash and collection holds.

A new pack cannot launch by changing labels alone. Require domain-owner sign-off, representative normal/exception datasets, mapping validation, calculation tests and report review. Pin pack versions to active missions and describe migrations explicitly.

## 17. Release plan

### Phase A — Trustworthy assessment foundation
Authenticated missions, scoped purchase/entitlement, evidence suitability, persistence, P2P ingestion and mapping, deterministic analysis, basic adaptive discovery and preliminary/assessed report generation. Preserve current prototype as demonstration-only.

### Phase B — Decision completeness
Pathway review, dependency invalidation, contributor reconciliation, risk gates, scenario value model and versioned strategy. Validate O2C pack to the same evidence standard before commercial release.

### Phase C — Paid pilot
Real payment activation, usage/top-up, destination verification, automatic report dispatch, support operations, accessibility and reliability checks. Run a small paid cohort and inspect reports with domain reviewers.

### Phase D — Repeatable expansion
Add packs based on demonstrated customer demand, controlled reassessment, before/after comparison and optional implementation handoff. Introduce more connectors only when recurring evidence friction justifies them.

No commercial release gate is satisfied solely by a polished UI or sample walkthrough.

## 18. Acceptance and evaluation matrix

| Scenario | Required result |
|---|---|
| CFO approves everything | Adaptive clarification; no unsupported bottleneck verdict |
| User answers unknown | Clear open requirement; contributor or defer route; no guessed answer |
| Two actors disagree | Both answers retained, conflict visible, dependent decision gated |
| Only invoice PDFs supplied | Useful preparation output; no invented event graph |
| Partial receipts and split payments | Explicit case model and correct join validation |
| Rare high-risk route | Visible risk/exclusion even when graph filters hide low frequency |
| Unreviewed variants | Excluded from proposed automation coverage |
| New rule or file after review | Dependent results stale; targeted reassessment |
| Sample mode | Clear provenance in every report; no customer performance claim |
| Token exhaustion | Progress retained; prior report downloadable; no forced payment to read |
| Report regenerated | New version; old report and delivery history preserved |
| Delivery retries | No duplicate dispatch; truthful channel-specific status |
| Prompt injection in upload | Treated as evidence text; no tool or permission escalation |
| Unauthorized contributor | Cannot access unrelated evidence or report |
| Keyboard / mobile / zoom | Complete core journey with visible focus and accessible actions |

Evaluation dataset: domain-reviewed scenarios with known missing facts, conflicts, legitimate exceptions and analysis ground truth. Score coverage completion, unnecessary questions, source correctness, unsupported claims, recommendation suitability and cost. Track performance by process and data quality, not only an aggregate score.

Release blockers: cross-tenant access, fabricated evidence, incorrect critical calculations, false delivery success, silent data loss or a critical pathway marked ready without its gates. Require zero occurrences in the release evaluation suite; ongoing monitoring still remains necessary.

## 19. Product metrics

Primary: share of paid customers who report that the strategy supports a specific investment, preparation or deferral decision.

Supporting metrics: suitable-data rate, mission completion, time to usable strategy, clarification burden, expert correction rate, evidence-linked recommendation rate, unresolved exposure at completion, support minutes per assessment, gross contribution, report access/delivery success and repeat assessment use.

Execution conversion is secondary. Do not optimize recommendations to increase sales conversion at the expense of an independent decision.

## 20. Decisions required before implementation commitment

1. Confirm initial buyer segment, supported process boundaries and P2P/O2C launch order.
2. Define ₹5,000 inclusions, taxes, refund behavior, revision allowance and treatment of unsuitable data.
3. Assign domain owners and approve readiness gates, value methods and expert-review policy.
4. Set data retention, storage region, access/sharing and provider data-use policy.
5. Choose and validate identity, payment, LLM and messaging providers; keep this spec provider-independent.
6. Define who may receive report dispatches and how destinations are verified.
7. Approve pilot success thresholds, support model and escalation ownership.
8. Define Failure Review purchase scope, expert escalation, exclusions and pricing separately; do not assume the readiness price covers incident investigation.
9. Validate the priority industry hypotheses with paying customers and confirm evidence access before adding packs.

## 21. Definition of done

A real customer can purchase a defined assessment, bring authorized evidence and collaborators, complete adaptive investigation, inspect reproducible pathways and explain the recommendations, download an evidence-linked strategy, receive truthful delivery updates and return to their work. They can act with any implementation partner or decide not to automate. The system preserves uncertainty and never requires a sales call to reveal the purchased conclusion.


## 22. Second product mode: Failure Review & Corrective Action Planning

### 22.1 Purpose and positioning
Help a business leader understand a failed process or automation, determine which explanations are supported, and agree what must change before continuing. A review can conclude that the cause remains uncertain or that restarting is premature.

Entry choices:
- Assess my automation readiness.
- Review what went wrong and plan corrections.

The same organisation may have several scoped missions. A failure mission can link to an earlier readiness assessment and the version of the strategy used, without modifying that historical record.

Use “Failure Review” as the initial product name. Do not promise a certified audit, forensic opinion or guaranteed root-cause determination. Customers asking for those services should receive a scope clarification and, where appropriate, a specialist referral.

### 22.2 Supported failure classes
- Operational failures: duplicate processing, missed cases, delayed approvals, incorrect routing or reconciliation gaps.
- Automation failures: retry errors, partial execution, handoff breakdown, changed rules, missing acknowledgments or recovery failures.
- Outcome failures: a pilot completed technically but did not achieve the expected capacity, cost, quality or adoption outcome.

Initial examples: duplicate supplier payments in P2P; collection reminders after payment in O2C; missing proof of delivery preventing billing; persistent exceptions after an automation rollout.

This is a bounded assessment, not an emergency incident-response service. An active material incident must be flagged for the customer's incident owner. Edge must not autonomously stop services, reverse transactions, change credentials or restart production.

### 22.3 Intake and scope
Capture expected versus actual behaviour, first/last occurrence, affected systems and process versions, affected entities/cases, estimated impact, discovery method, current incident status, actions already taken and incident owner.

Ask whether the failure is continuing and whether evidence might be lost through retention or corrective changes. Recommend that the responsible team preserve relevant evidence; do not alter originals.

For outcome failures, also capture original business case, baseline, promised scope, realised adoption, implementation changes, operating cost and measurement period. Separate delivery failure from unrealistic assumptions or missing measurement.

### 22.4 Investigation workflow
1. Establish incident scope and current impact; distinguish estimated exposure from confirmed loss.
2. Collect and preserve permitted logs, records, configurations, rule versions and participant accounts.
3. Reconstruct a timestamped timeline, including clock/timezone uncertainty and missing intervals.
4. Locate failed pathways and compare with appropriately matched successful cases.
5. Generate competing hypotheses and identify evidence that supports or contradicts each.
6. Identify immediate triggers, contributing conditions and control/recovery gaps.
7. Develop containment, correction, prevention and improvement actions.
8. Agree verification tests, acceptance criteria and conditions for resuming operations.
9. Publish the review and track subsequent evidence of effectiveness.

The engine must ask questions according to the failure mechanism. For duplicate payments, investigate case/payment identifiers, retries, acknowledgments, partial completion and manual overrides. Do not default to “add duplicate checking” without examining how the duplication occurred.

### 22.5 Evidence and causal discipline
Each hypothesis records statement, mechanism, supporting evidence, counter-evidence, alternative explanation, missing test, affected scope, confidence rationale and reviewer.

Permitted states: proposed, under investigation, supported, contradicted and unresolved. A supported cause requires a documented reasoning chain and reviewer acceptance. Label independently reproduced failures separately from explanations inferred from records.

Temporal sequence alone is not causation. Absence from incomplete logs is not proof of absence. Successful comparison cases should be selected with relevant differences disclosed, such as version, volume, location or transaction type.

Retain conflicting participant accounts. Do not assign personal blame from ambiguous logs. Record operational ownership separately from responsibility for a failure.

### 22.6 Corrective action register
Every action contains:
- Action ID, category and linked failure hypothesis/control gap.
- Scope, priority and reason; owner and accountable reviewer.
- Dependencies, proposed due date and status.
- Expected effect, measurable acceptance criterion and supporting evidence.
- Test procedure, exception/regression cases and recovery plan.
- Implementation approval record, verification result and observation window.
- Residual risk and reopening condition.

Categories must remain distinct:
- Containment: limit continuing impact.
- Correction: repair affected records or transactions through authorised owners.
- Prevention: remove or control the supported failure mechanism.
- Improvement: strengthen the surrounding process and its observability.

Statuses: proposed → approved → in progress → implemented → verification pending → effective/ineffective. “Implemented” is not “resolved.” Mark effective only when agreed verification and observation requirements are met; otherwise keep verification open. Edge records evidence and decisions, not production execution by default.

### 22.7 Deliverable
The Failure Review & Corrective Action Plan includes executive incident summary, affected scope and impact, evidence register, timeline, failed and successful pathways, causal analysis, competing explanations, control gaps, prioritised actions, verification plan, residual risks, restart conditions and unresolved questions.

Report outcomes: preliminary review, supported findings with action plan, or insufficient evidence with an investigation plan. Do not label a case closed simply because the report was generated.

Use the same versioning, independent download access, recipient verification and truthful email/WhatsApp dispatch requirements as the Automation Strategy. The customer may execute the plan internally or with any partner.

### 22.8 Additional data and interaction requirements
Add incident, impact estimate, timeline event, process/configuration version, hypothesis evidence link, comparison cohort, corrective action, verification run, observation window and closure decision records.

The desktop workspace combines timeline/process graph, selected evidence and hypothesis/action panel. Show “what happened,” “what we think explains it,” and “what is established” distinctly. Ask Edge must explain the evidence basis for its suggestions.

Sensitive log excerpts should be redacted or minimally retrieved for model use. Preserve source hashes and access history. Revisions to evidence invalidate affected causal conclusions and verification decisions.

### 22.9 Release and acceptance additions
Release Failure Review after the shared evidence/versioning foundation and a domain-reviewed incident evaluation set. Pilot P2P/O2C failures before unrelated technical or regulatory investigations.

| Scenario | Required result |
|---|---|
| Duplicate payment after retry | Examine acknowledgment and idempotency evidence; do not assume duplicate invoice input |
| Reminder after payment | Compare receipt, application and reminder timestamps; distinguish unsettled data from policy error |
| Missing logs | State the limitation; no definitive cause claim |
| Contradictory accounts | Retain conflict and request discriminating evidence |
| Automation misses savings target | Compare scope/adoption/cost and baseline assumptions, not only technical execution |
| Fix marked implemented | Remain verification pending until criteria are met |
| Failure recurs | Reopen linked actions and reassess mechanism and scope |
| Production restart requested | Route to authorised operational approval; assessment alone cannot restart systems |

Success measures include evidence-supported explanations, expert correction rate, actions with testable criteria, verified effectiveness and customer decision usefulness. Recurrence reduction must be measured over an agreed observation period and cannot be credited solely to report generation.

## 23. Market opportunity and industry focus

### 23.1 The commercial hypothesis
Leaders will pay for an independent, evidence-linked assessment when they face a consequential automation investment, a failed initiative or recurring process exceptions. The paid value is decision quality, readiness and risk understanding; implementation conversion is optional.

A ₹5,000 readiness assessment is a pricing hypothesis for bounded work. Willingness to pay, support effort and margins remain unproven. Failure Review may require more evidence handling and expert involvement, so its price and limits need separate validation.

### 23.2 External market signals
The sources below were consulted during the product discussion. They indicate category activity and business motivation. They do not establish VaNi Edge's addressable revenue or an India-specific workflow spending ranking.

| Signal | Evidence and date | Interpretation and limitation |
|---|---|---|
| Banking AI investment | IDC reported approximately $31.3 billion in banking AI investment in 2024 [S1] | Large technology budget category; includes many uses outside workflow automation |
| Manufacturing investment | Deloitte's 2025 survey reported 78% of respondents allocated over 20% of improvement budgets to smart manufacturing [S2] | Substantial investment intent/allocation; includes physical automation and operational infrastructure |
| US healthcare administration | The 2025 CAQH Index release, published February 2026, identified a remaining $21 billion opportunity from full automation of manual/partially manual transactions [S3] | Potential savings, not automation spending, vendor revenue or an Indian healthcare estimate |
| Functional benefits | McKinsey's 2026 survey reported cost benefits most frequently in supply chain, service operations and manufacturing [S4] | Self-reported benefit signal, not a causal study or spending league table |

AI spending, automation spending, potential savings and addressable assessment revenue must never be added together or treated as interchangeable. No defensible total addressable market calculation has yet been completed for this product.

### 23.3 Industry/process opportunity map
The priorities below are product hypotheses based on workflow fit, not measured market-share rankings.

| Industry | Candidate assessment packs | Decision owner | Assessment trigger | Constraints |
|---|---|---|---|---|
| Manufacturing | P2P, supplier onboarding, matching, maintenance work orders | CFO, COO, procurement head | Payment errors, approval/receipt delays, planned automation | ERP joins, partial receipts, plant variation |
| Wholesale/pharma distribution | O2C, collections, deductions, returns, supplier claims | Owner, CFO, finance head | Cash delays, disputes, credit-note backlog | Fragmented records and customer-specific terms |
| Logistics | Delivery-to-cash, freight audit, carrier settlement | CFO, operations head | Missing billing, proof-of-delivery gaps, charge disputes | External carrier events and document availability |
| Healthcare providers | Billing/claim-to-cash, denial resolution, procurement | CFO, revenue-cycle head | Claims backlog, leakage, failed administrative automation | Country-specific payer rules, sensitive records and specialist review |
| Insurance | Claims intake/settlement, policy servicing, reconciliation | Claims head, COO | Turnaround, exceptions and control failures | High assurance needs; human decision boundaries |
| Banking/NBFCs | Onboarding operations, loan processing, reconciliation, servicing | COO, transformation head | Processing delay, control gaps, failed workflows | Long procurement, security and domain-assurance requirements |
| Retail/e-commerce | Returns/refunds, marketplace settlement, supplier reconciliation | CFO, commerce operations head | Deductions, refund errors, settlement differences | Platform-specific data and complex matching |
| IT/professional services | Contract-to-billing, timesheet-to-invoice, collections | CFO, delivery head | Unbilled work and approval delays | Contract-specific billing logic |
| Construction | Subcontractor billing, progress certification, P2P | Project director, CFO | Disputes, missing approvals, overruns | Weak event histories and project-specific practices |
| Utilities/telecom | Order/meter-to-bill, collections, field work orders | COO, billing/service head | Billing errors and exception backlog | Large system estate and enterprise sales complexity |

### 23.4 Recommended sequence
1. Manufacturing P2P readiness and failure reviews.
2. Distribution O2C, collections and deductions.
3. Logistics delivery-to-cash as a focused O2C extension.
4. Healthcare claim-to-cash and retail settlement after securing domain reviewers and representative evidence.
5. Banking/insurance and other packs after assurance and enterprise delivery capabilities mature.

Customer access may change this sequence. Prefer a reachable, evidence-ready segment over a large headline spending category. US healthcare and Indian hospital/TPA workflows require separate pack assumptions and evaluation data.

### 23.5 Competitive position
Position around a bounded leadership decision: “Understand whether this process is ready, what could fail and what to do next.” Process reconstruction supports the decision. Continuous enterprise process-intelligence suites have a wider operating scope; generic questionnaires and conversational reports have a weaker evidence requirement.

Potential differentiation to validate: adaptive elicitation, declared-versus-observed pathways, explicit exclusions, evidence-linked recommendations, useful preliminary reports and an independent strategy usable with any partner. These are intended advantages, not proven market claims.

### 23.6 Entry triggers and acquisition hypotheses
- Before approving an automation proposal or replacing a system.
- After a pilot fails to achieve its business case.
- After recurring payment, billing, settlement or handoff exceptions.
- Before expanding an existing automation to more locations or transaction types.
- During a process standardisation or shared-services initiative.

Test distribution through relevant CFO/operations communities, domain partners and existing customer relationships. Do not assume a low purchase price makes enterprise data approval effortless. Evidence-sharing confidence and the named owner may determine adoption more than checkout friction.

### 23.7 Revenue and economics
Potential purchases: scoped readiness assessment, scoped Failure Review, assisted validation, reassessment after changes and additional process packs. Execution remains optional and separately scoped.

Track contribution per mission as revenue less acquisition, data preparation, expert/support time, AI/compute, storage, payment and delivery cost. Include failed/abandoned missions and rework in cohort economics. Avoid building a business case solely from token cost.

Market sizing should be built from reachable companies in a defined geography and size band, eligible processes, evidence suitability, purchase frequency and tested price. Label bottom-up scenarios and conversion assumptions; do not infer assessment demand from broad AI investment totals.

### 23.8 Validation programme
Start with a small paid cohort in one segment—for example, ten customers as an exploratory pilot, not a statistically conclusive market study. Include both readiness and failure-review interviews; commercialise Failure Review only when its evidence and review requirements are supported.

Measure payment at the stated price, data suitability, completion, support effort, decision usefulness, report sharing within the customer team, margins and repeat purchase intent/behaviour. Interview non-completers. Ask whether the report changed or clarified an investment, correction or deferral decision.

Expand packs after repeatable delivery and useful decisions are demonstrated. A high implementation conversion rate cannot compensate for weak standalone assessment value.

### 23.9 Source register
- **[S1] IDC — Worldwide AI and Generative AI Spending: Industry Outlook.** Historical banking AI investment signal for 2024. https://www.idc.com/resource-center/blog/idcs-worldwide-ai-and-generative-ai-spending-industry-outlook/
- **[S2] Deloitte — 2025 Smart Manufacturing Survey.** Survey investment allocations; population and scope should accompany reuse. https://www.deloitte.com/us/en/insights/industry/manufacturing-industrial-products/2025-smart-manufacturing-survey.html
- **[S3] CAQH — 2025 Index release, 19 February 2026, distributed by GlobeNewswire.** US administrative automation savings opportunity. https://www.globenewswire.com/news-release/2026/2/19/3241072/0/en/2025-CAQH-Index-Shows-U-S-Healthcare-Avoided-258-Billion-and-Accelerated-Automation-Interoperability-and-AI-Adoption.html
- **[S4] McKinsey — State of AI, 2026 survey page.** Self-reported functional benefit signal; the live page may be updated. https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-state-of-ai

Source summaries reflect the research in the accompanying discussion, not a fresh market study commissioned for this specification. Refresh figures before external publication or investment materials.
