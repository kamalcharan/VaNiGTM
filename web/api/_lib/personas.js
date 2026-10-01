// api/_lib/personas.js
// The Room — 36 stakeholder coaching prompts, flattened from the client
// playground's ROOM object into a lookup by prompt id. Extracted verbatim
// (client/name/role/quote/protecting/goals/frustrations/question/subtext/trap)
// — only "answer" is missing, since that field is what the model generates
// live; subtext and trap are authored and get hard-overwritten onto the
// model's response after the fact (api/advisor.js), never regenerated.

export function personaBlock(p) {
  return `You are answering a coaching request about a specific stakeholder.
STAKEHOLDER: ${p.name}, ${p.role}
THEIR POSITION: ${p.quote}
WHAT THEY PROTECT: ${p.protecting}
THEIR GOALS: ${p.goals.join('; ')}
THEIR FRUSTRATIONS: ${p.frustrations.join('; ')}
THE QUESTION THEY ASKED: ${p.question}

Return render:"handling". Write "answer" as 2-4 items coaching the learner on how to respond,
grounded in the injected lever values. Quote lever values by number where they carry the argument.
Do not soften the trap. Do not invent numbers.`;
}

export const PERSONAS = {
  "cto1": {
    "client": "bank",
    "name": "Priya Raghavan",
    "role": "Chief Technology Officer",
    "quote": "We don’t outsource our brain. The day we can’t build it, we can’t govern it either.",
    "protecting": "Her team’s relevance — and her own credibility if the build fails.",
    "goals": [
      "Keep the capability, and the judgment inside it, in-house",
      "Grow the team’s standing rather than shrink it to vendor management",
      "Be able to explain how the system reaches a conclusion"
    ],
    "frustrations": [
      "Decisions arriving after finance has already priced them",
      "Vendors who demo confidently and will not show error rates",
      "\"Buy\" framed as a cost decision when it is a capability decision"
    ],
    "question": "If we buy this, what exactly is left for my team to own?",
    "subtext": "She is not arguing architecture. She is asking whether she still matters after this decision.",
    "trap": "Answering with a cost comparison. She never asked about cost, and a cost answer confirms her fear that this was decided in a spreadsheet without her."
  },
  "cto2": {
    "client": "bank",
    "name": "Priya Raghavan",
    "role": "Chief Technology Officer",
    "quote": "We don’t outsource our brain. The day we can’t build it, we can’t govern it either.",
    "protecting": "Her team’s relevance — and her own credibility if the build fails.",
    "goals": [
      "Keep the capability, and the judgment inside it, in-house",
      "Grow the team’s standing rather than shrink it to vendor management",
      "Be able to explain how the system reaches a conclusion"
    ],
    "frustrations": [
      "Decisions arriving after finance has already priced them",
      "Vendors who demo confidently and will not show error rates",
      "\"Buy\" framed as a cost decision when it is a capability decision"
    ],
    "question": "Why would we hand our credit judgment to someone else’s model?",
    "subtext": "A legitimate governance point wearing an emotional coat. She is conflating the engine with the judgment — but she is right that the judgment must stay yours.",
    "trap": "Treating it as resistance to be managed. The governance concern is real, and dismissing it costs you the person you most need on side during implementation."
  },
  "cto3": {
    "client": "bank",
    "name": "Priya Raghavan",
    "role": "Chief Technology Officer",
    "quote": "We don’t outsource our brain. The day we can’t build it, we can’t govern it either.",
    "protecting": "Her team’s relevance — and her own credibility if the build fails.",
    "goals": [
      "Keep the capability, and the judgment inside it, in-house",
      "Grow the team’s standing rather than shrink it to vendor management",
      "Be able to explain how the system reaches a conclusion"
    ],
    "frustrations": [
      "Decisions arriving after finance has already priced them",
      "Vendors who demo confidently and will not show error rates",
      "\"Buy\" framed as a cost decision when it is a capability decision"
    ],
    "question": "Give me six months and my team will match anything the vendor has.",
    "subtext": "A capability claim being used as a schedule claim. She is probably right about the first and wrong about the second.",
    "trap": "Debating her team’s competence. You will lose the room even if you win the point — and competence was never the question."
  },
  "coo1": {
    "client": "bank",
    "name": "Arun Menon",
    "role": "Chief Operating Officer",
    "quote": "Every month we debate this, branch teams write those memos by hand. That is the cost nobody puts in the deck.",
    "protecting": "Delivery, branch throughput, and the commitments he has already made this year.",
    "goals": [
      "Something live inside this quarter",
      "Memo turnaround measurably down",
      "An end to the debate"
    ],
    "frustrations": [
      "Architecture arguments with no end date",
      "Pilots that never leave pilot",
      "Being answered with \"it depends\""
    ],
    "question": "The vendor is live in eight weeks. What does building cost us in time?",
    "subtext": "He is not asking for a schedule. He is asking you to put a number on delay so he can defend the decision upward.",
    "trap": "Matching his urgency with your own. If you sound as rushed as he does, nobody in the room is holding the long view."
  },
  "coo2": {
    "client": "bank",
    "name": "Arun Menon",
    "role": "Chief Operating Officer",
    "quote": "Every month we debate this, branch teams write those memos by hand. That is the cost nobody puts in the deck.",
    "protecting": "Delivery, branch throughput, and the commitments he has already made this year.",
    "goals": [
      "Something live inside this quarter",
      "Memo turnaround measurably down",
      "An end to the debate"
    ],
    "frustrations": [
      "Architecture arguments with no end date",
      "Pilots that never leave pilot",
      "Being answered with \"it depends\""
    ],
    "question": "Why can’t we start with the vendor and build later if we need to?",
    "subtext": "The best question anyone in the room will ask you — and it is nearly right. What he is missing is that \"later\" gets more expensive every month.",
    "trap": "Simply agreeing. \"Yes, we can always build later\" is technically true and practically false, and he will quote you on it in eighteen months."
  },
  "coo3": {
    "client": "bank",
    "name": "Arun Menon",
    "role": "Chief Operating Officer",
    "quote": "Every month we debate this, branch teams write those memos by hand. That is the cost nobody puts in the deck.",
    "protecting": "Delivery, branch throughput, and the commitments he has already made this year.",
    "goals": [
      "Something live inside this quarter",
      "Memo turnaround measurably down",
      "An end to the debate"
    ],
    "frustrations": [
      "Architecture arguments with no end date",
      "Pilots that never leave pilot",
      "Being answered with \"it depends\""
    ],
    "question": "You keep saying \"it depends\". Give me a date.",
    "subtext": "Fair pressure. He has been given analysis where he asked for a commitment, and he is losing patience with advisory language.",
    "trap": "Producing a delivery date to end the discomfort. You will own that date long after this meeting, and it was invented to make a conversation stop."
  },
  "cro1": {
    "client": "bank",
    "name": "Nandita Iyer",
    "role": "Chief Risk Officer",
    "quote": "I do not need it fast. I need to explain it in a room where nobody is on our side.",
    "protecting": "The bank’s licence to operate, and the audit trail that defends it.",
    "goals": [
      "Decisions that can be explained after the fact",
      "Error rates measured on the bank’s own portfolio",
      "A fallback that has actually been tested"
    ],
    "frustrations": [
      "Accuracy claims with no false-negative data",
      "Models validated on someone else’s book",
      "\"The system flagged it\" offered as an explanation"
    ],
    "question": "Show me the false-negative rate on our own portfolio, not their benchmark.",
    "subtext": "The sharpest question in the room, and the one most likely to be answered with marketing material. She is testing whether anyone has looked past the accuracy headline.",
    "trap": "Accepting a single accuracy percentage as an answer. One number cannot describe two failure modes with completely different consequences."
  },
  "cro2": {
    "client": "bank",
    "name": "Nandita Iyer",
    "role": "Chief Risk Officer",
    "quote": "I do not need it fast. I need to explain it in a room where nobody is on our side.",
    "protecting": "The bank’s licence to operate, and the audit trail that defends it.",
    "goals": [
      "Decisions that can be explained after the fact",
      "Error rates measured on the bank’s own portfolio",
      "A fallback that has actually been tested"
    ],
    "frustrations": [
      "Accuracy claims with no false-negative data",
      "Models validated on someone else’s book",
      "\"The system flagged it\" offered as an explanation"
    ],
    "question": "When this drafts a risk section that is wrong, who signs it?",
    "subtext": "She already knows the answer. She is checking whether the room knows it, and whether accountability has quietly gone missing in the enthusiasm.",
    "trap": "Reassuring her that a human stays in the loop and stopping there. Being in the loop is not the same as being able to disagree with it."
  },
  "cro3": {
    "client": "bank",
    "name": "Nandita Iyer",
    "role": "Chief Risk Officer",
    "quote": "I do not need it fast. I need to explain it in a room where nobody is on our side.",
    "protecting": "The bank’s licence to operate, and the audit trail that defends it.",
    "goals": [
      "Decisions that can be explained after the fact",
      "Error rates measured on the bank’s own portfolio",
      "A fallback that has actually been tested"
    ],
    "frustrations": [
      "Accuracy claims with no false-negative data",
      "Models validated on someone else’s book",
      "\"The system flagged it\" offered as an explanation"
    ],
    "question": "If the vendor disappears in eighteen months, what happens to the memos already written?",
    "subtext": "She is asking about continuity of the record, not continuity of the service. Regulators examine what you wrote, not what tool you used.",
    "trap": "Answering about service continuity — uptime, SLAs, support. She asked about the audit record, which survives the vendor by years."
  },
  "ven1": {
    "client": "bank",
    "name": "Vikram Shah",
    "role": "Account Director · the vendor",
    "quote": "I can hold this pricing till month-end. After that it goes back to the standard sheet — that is not me, that is my board.",
    "protecting": "The deal, his quarter, and the depth of the dependency he can build.",
    "goals": [
      "Signature before quarter close",
      "A multi-year term",
      "Access to your data for model improvement"
    ],
    "frustrations": [
      "Procurement cycles",
      "Requests for error rates on client data",
      "Exit clauses raised early"
    ],
    "question": "Why complicate it with an exit clause when we are just getting started?",
    "subtext": "The most informative sentence he will say all quarter. How a partner discusses endings tells you what the partnership is.",
    "trap": "Letting it slide to keep goodwill early. Exit terms never get easier to negotiate — leverage only moves one way after signature."
  },
  "ven2": {
    "client": "bank",
    "name": "Vikram Shah",
    "role": "Account Director · the vendor",
    "quote": "I can hold this pricing till month-end. After that it goes back to the standard sheet — that is not me, that is my board.",
    "protecting": "The deal, his quarter, and the depth of the dependency he can build.",
    "goals": [
      "Signature before quarter close",
      "A multi-year term",
      "Access to your data for model improvement"
    ],
    "frustrations": [
      "Procurement cycles",
      "Requests for error rates on client data",
      "Exit clauses raised early"
    ],
    "question": "We have trained on forty million credit documents. Isn’t that enough evidence?",
    "subtext": "Volume offered as a substitute for relevance. It is the most common vendor trap, and it usually works.",
    "trap": "Being impressed by the number. Corpus size is the easiest metric to publish and the least connected to how the system will perform on your book."
  },
  "ven3": {
    "client": "bank",
    "name": "Vikram Shah",
    "role": "Account Director · the vendor",
    "quote": "I can hold this pricing till month-end. After that it goes back to the standard sheet — that is not me, that is my board.",
    "protecting": "The deal, his quarter, and the depth of the dependency he can build.",
    "goals": [
      "Signature before quarter close",
      "A multi-year term",
      "Access to your data for model improvement"
    ],
    "frustrations": [
      "Procurement cycles",
      "Requests for error rates on client data",
      "Exit clauses raised early"
    ],
    "question": "Co-build with us — our engineers at half rate. Why wouldn’t you?",
    "subtext": "A genuinely attractive offer with the expensive part unstated: who owns what you build together.",
    "trap": "Negotiating the rate. The rate is the cheap part of the offer; ownership of what gets built is the expensive part, and it is not on the table unless you put it there."
  },
  "ph_it1": {
    "client": "pharma",
    "name": "Meera Krishnan",
    "role": "Head of Digital & IT",
    "quote": "In a validated system, “the vendor handles it” is not an answer. Control is the deliverable.",
    "protecting": "The validated state of the platform — and her signature on every change that touches it.",
    "goals": [
      "Keep the system inside a validation boundary she controls",
      "Avoid a vendor release cycle she cannot pause",
      "Own the audit trail from intake to database, end to end"
    ],
    "frustrations": [
      "Vendors who ship model updates without change notice",
      "Being told a system is validated without being shown the evidence",
      "Business teams treating validation as paperwork rather than as the product"
    ],
    "question": "If the vendor retrains their model, does our validation still hold?",
    "subtext": "She is not questioning model quality. She is asking who controls the change cycle — and in a validated environment that is the whole question.",
    "trap": "Answering with accuracy figures. She asked about change control, and an accuracy answer tells her nobody has thought about the release cycle."
  },
  "ph_it2": {
    "client": "pharma",
    "name": "Meera Krishnan",
    "role": "Head of Digital & IT",
    "quote": "In a validated system, “the vendor handles it” is not an answer. Control is the deliverable.",
    "protecting": "The validated state of the platform — and her signature on every change that touches it.",
    "goals": [
      "Keep the system inside a validation boundary she controls",
      "Avoid a vendor release cycle she cannot pause",
      "Own the audit trail from intake to database, end to end"
    ],
    "frustrations": [
      "Vendors who ship model updates without change notice",
      "Being told a system is validated without being shown the evidence",
      "Business teams treating validation as paperwork rather than as the product"
    ],
    "question": "Who owns the audit trail when extraction happens on their infrastructure?",
    "subtext": "A continuity question, not a hosting question. She is thinking about what survives the vendor relationship by several years.",
    "trap": "Accepting “we provide full audit logs” as the answer. Logs on their platform are their logs, and they end when the contract does."
  },
  "ph_it3": {
    "client": "pharma",
    "name": "Meera Krishnan",
    "role": "Head of Digital & IT",
    "quote": "In a validated system, “the vendor handles it” is not an answer. Control is the deliverable.",
    "protecting": "The validated state of the platform — and her signature on every change that touches it.",
    "goals": [
      "Keep the system inside a validation boundary she controls",
      "Avoid a vendor release cycle she cannot pause",
      "Own the audit trail from intake to database, end to end"
    ],
    "frustrations": [
      "Vendors who ship model updates without change notice",
      "Being told a system is validated without being shown the evidence",
      "Business teams treating validation as paperwork rather than as the product"
    ],
    "question": "We can build this in-house. Why import someone else’s risk?",
    "subtext": "A real argument, but it hides a swap: building does not remove risk, it exchanges vendor risk for delivery and key-person risk. She may prefer that trade — she should say so explicitly.",
    "trap": "Framing it as build risk versus buy risk. Both paths carry risk — the decision is which failure your organisation can actually absorb and explain."
  },
  "ph_pv1": {
    "client": "pharma",
    "name": "Dr. Anand Pillai",
    "role": "Head of Pharmacovigilance",
    "quote": "Case volume doubled in two years. My team is triaging at eleven at night. I need help this quarter, not a platform strategy.",
    "protecting": "Case-processing timelines, and the people burning out inside them.",
    "goals": [
      "Reduce manual intake triage this quarter",
      "Hold timeline compliance without adding headcount",
      "Stop losing experienced case processors"
    ],
    "frustrations": [
      "Build timelines measured in quarters",
      "Being asked to wait for the platform roadmap",
      "Solutions designed by people who have never watched intake for an afternoon"
    ],
    "question": "My best case processors are leaving. Does your framework price that?",
    "subtext": "He is naming a cost that never appears in either column of the comparison — and he is right that it should.",
    "trap": "Treating it as an HR issue outside the decision. Experienced processors are the control that catches what the model misses — losing them changes the risk profile of every option on the table."
  },
  "ph_pv2": {
    "client": "pharma",
    "name": "Dr. Anand Pillai",
    "role": "Head of Pharmacovigilance",
    "quote": "Case volume doubled in two years. My team is triaging at eleven at night. I need help this quarter, not a platform strategy.",
    "protecting": "Case-processing timelines, and the people burning out inside them.",
    "goals": [
      "Reduce manual intake triage this quarter",
      "Hold timeline compliance without adding headcount",
      "Stop losing experienced case processors"
    ],
    "frustrations": [
      "Build timelines measured in quarters",
      "Being asked to wait for the platform roadmap",
      "Solutions designed by people who have never watched intake for an afternoon"
    ],
    "question": "The vendor is validated for eleven other sponsors. Why isn’t that enough for us?",
    "subtext": "Reasonable-sounding, and the most common way validated status gets borrowed rather than earned.",
    "trap": "Accepting the reference list as evidence. Eleven satisfied sponsors tell you the vendor is real. They tell you nothing about performance on your intake."
  },
  "ph_pv3": {
    "client": "pharma",
    "name": "Dr. Anand Pillai",
    "role": "Head of Pharmacovigilance",
    "quote": "Case volume doubled in two years. My team is triaging at eleven at night. I need help this quarter, not a platform strategy.",
    "protecting": "Case-processing timelines, and the people burning out inside them.",
    "goals": [
      "Reduce manual intake triage this quarter",
      "Hold timeline compliance without adding headcount",
      "Stop losing experienced case processors"
    ],
    "frustrations": [
      "Build timelines measured in quarters",
      "Being asked to wait for the platform roadmap",
      "Solutions designed by people who have never watched intake for an afternoon"
    ],
    "question": "Can we start with the vendor for intake only, and keep assessment in-house?",
    "subtext": "He has independently arrived at the split rule. This is the best question in the room and deserves to be recognised as such.",
    "trap": "Improving his idea before acknowledging it. He is right; refining it before agreeing costs you the ally who just made your argument for you."
  },
  "ph_qa1": {
    "client": "pharma",
    "name": "Rukmini Desai",
    "role": "Head of Quality Assurance",
    "quote": "I am not the department that says no. I am the department that asks what you will show an inspector — and most people have not thought about it.",
    "protecting": "The inspection record, and the company’s ability to defend every automated decision in it.",
    "goals": [
      "A documented validation approach agreed before build or buy",
      "Traceability from source document to database field",
      "A human review point that is real rather than nominal"
    ],
    "frustrations": [
      "Being brought in after the vendor is chosen",
      "\"The model is 98% accurate\" offered as validation evidence",
      "Pilots that quietly became production"
    ],
    "question": "When the model misses an adverse event, what did we have in place to catch it?",
    "subtext": "The most serious question anyone will ask about this project. A false positive costs review time; a false negative is a safety signal that was never seen.",
    "trap": "Answering with overall accuracy. One number describing two failure modes with completely different consequences is not evidence — it is an average hiding the only figure that matters."
  },
  "ph_qa2": {
    "client": "pharma",
    "name": "Rukmini Desai",
    "role": "Head of Quality Assurance",
    "quote": "I am not the department that says no. I am the department that asks what you will show an inspector — and most people have not thought about it.",
    "protecting": "The inspection record, and the company’s ability to defend every automated decision in it.",
    "goals": [
      "A documented validation approach agreed before build or buy",
      "Traceability from source document to database field",
      "A human review point that is real rather than nominal"
    ],
    "frustrations": [
      "Being brought in after the vendor is chosen",
      "\"The model is 98% accurate\" offered as validation evidence",
      "Pilots that quietly became production"
    ],
    "question": "Show me traceability from the intake email to the field in the safety database.",
    "subtext": "She is describing the artefact the whole system will be judged on. If traceability is retrofitted, it will not exist when it is needed.",
    "trap": "Deferring traceability to the implementation phase. Retrofitting an audit trail costs more than building the extraction did, and it is discovered at the worst possible moment."
  },
  "ph_qa3": {
    "client": "pharma",
    "name": "Rukmini Desai",
    "role": "Head of Quality Assurance",
    "quote": "I am not the department that says no. I am the department that asks what you will show an inspector — and most people have not thought about it.",
    "protecting": "The inspection record, and the company’s ability to defend every automated decision in it.",
    "goals": [
      "A documented validation approach agreed before build or buy",
      "Traceability from source document to database field",
      "A human review point that is real rather than nominal"
    ],
    "frustrations": [
      "Being brought in after the vendor is chosen",
      "\"The model is 98% accurate\" offered as validation evidence",
      "Pilots that quietly became production"
    ],
    "question": "You keep calling it a pilot. At what point does it become a system I have to qualify?",
    "subtext": "She has seen pilots become production by momentum rather than by decision, and she is refusing to let this one do it quietly.",
    "trap": "Answering “when we go live”. Live is not a threshold anyone can point to afterwards, and that vagueness is exactly what she is objecting to."
  },
  "ph_cro1": {
    "client": "pharma",
    "name": "Thomas Abraham",
    "role": "Partnership Director · the CRO",
    "quote": "We already process intake for eleven sponsors. Let us run yours — you get our models, our people, and our learning curve on day one.",
    "protecting": "A recurring service line, and the data that keeps his models ahead.",
    "goals": [
      "A multi-year services contract",
      "Access to your case data for model improvement",
      "Becoming the default when the next therapy area comes"
    ],
    "frustrations": [
      "Sponsors who ask where the training data came from",
      "Data-use clauses",
      "Being compared against software pricing"
    ],
    "question": "Our models learn from every sponsor we serve. Isn’t that an advantage for you?",
    "subtext": "The most important sentence in the pitch, delivered as a benefit. Every sponsor is being told the same thing — including your competitors.",
    "trap": "Hearing it as a technical advantage and moving on. It is a data-rights question wearing a capability costume, and it is the single most expensive clause in the agreement."
  },
  "ph_cro2": {
    "client": "pharma",
    "name": "Thomas Abraham",
    "role": "Partnership Director · the CRO",
    "quote": "We already process intake for eleven sponsors. Let us run yours — you get our models, our people, and our learning curve on day one.",
    "protecting": "A recurring service line, and the data that keeps his models ahead.",
    "goals": [
      "A multi-year services contract",
      "Access to your case data for model improvement",
      "Becoming the default when the next therapy area comes"
    ],
    "frustrations": [
      "Sponsors who ask where the training data came from",
      "Data-use clauses",
      "Being compared against software pricing"
    ],
    "question": "Why would you build what we already run at scale?",
    "subtext": "A fair challenge. The honest answer is that you would not build the part they run — but that is not the part that was at stake.",
    "trap": "Defending a full build. He has framed it as all-or-nothing because all-or-nothing is the framing he wins."
  },
  "ph_cro3": {
    "client": "pharma",
    "name": "Thomas Abraham",
    "role": "Partnership Director · the CRO",
    "quote": "We already process intake for eleven sponsors. Let us run yours — you get our models, our people, and our learning curve on day one.",
    "protecting": "A recurring service line, and the data that keeps his models ahead.",
    "goals": [
      "A multi-year services contract",
      "Access to your case data for model improvement",
      "Becoming the default when the next therapy area comes"
    ],
    "frustrations": [
      "Sponsors who ask where the training data came from",
      "Data-use clauses",
      "Being compared against software pricing"
    ],
    "question": "We can be live in six weeks. What would you build in six months?",
    "subtext": "A real advantage, compared against the wrong thing. Six weeks to running is not six weeks to qualified.",
    "trap": "Competing on timeline. You will lose that comparison, and it is the wrong axis — the question is what state you are in when the inspector arrives, not who started first."
  },
  "rt_ds1": {
    "client": "retail",
    "name": "Kiran Bhatt",
    "role": "Head of Data Science",
    "quote": "We have the data, the models, and two people who have done this before. What we do not have is permission.",
    "protecting": "His team’s ambition — and the case that data science is a capability, not a service desk.",
    "goals": [
      "Ship something the business genuinely depends on",
      "Keep forecasting logic in-house where it can be tuned weekly",
      "Stop being the dashboard team"
    ],
    "frustrations": [
      "Being scoped out of decisions about models",
      "Vendors selling what his team already prototyped",
      "\"Buy\" decided before the build option was examined"
    ],
    "question": "We prototyped this in three weeks. Why are we paying a vendor for it?",
    "subtext": "The prototype is real and he is right to be proud of it. What he has not priced is the distance between a prototype and something 800 stores depend on at 7am.",
    "trap": "Comparing the prototype to the vendor’s product. He will win that comparison on features and lose the point entirely, and everyone will leave more confused."
  },
  "rt_ds2": {
    "client": "retail",
    "name": "Kiran Bhatt",
    "role": "Head of Data Science",
    "quote": "We have the data, the models, and two people who have done this before. What we do not have is permission.",
    "protecting": "His team’s ambition — and the case that data science is a capability, not a service desk.",
    "goals": [
      "Ship something the business genuinely depends on",
      "Keep forecasting logic in-house where it can be tuned weekly",
      "Stop being the dashboard team"
    ],
    "frustrations": [
      "Being scoped out of decisions about models",
      "Vendors selling what his team already prototyped",
      "\"Buy\" decided before the build option was examined"
    ],
    "question": "If we buy, my best people leave. Does that go in the cost table?",
    "subtext": "Partly a real retention risk and partly leverage. Both are worth taking seriously, and they need separating.",
    "trap": "Reading it purely as a threat. Retention risk from work that stops being interesting is real, common, and entirely avoidable if the split is designed properly."
  },
  "rt_ds3": {
    "client": "retail",
    "name": "Kiran Bhatt",
    "role": "Head of Data Science",
    "quote": "We have the data, the models, and two people who have done this before. What we do not have is permission.",
    "protecting": "His team’s ambition — and the case that data science is a capability, not a service desk.",
    "goals": [
      "Ship something the business genuinely depends on",
      "Keep forecasting logic in-house where it can be tuned weekly",
      "Stop being the dashboard team"
    ],
    "frustrations": [
      "Being scoped out of decisions about models",
      "Vendors selling what his team already prototyped",
      "\"Buy\" decided before the build option was examined"
    ],
    "question": "What would we have to prove to earn the build?",
    "subtext": "The best question a build advocate can ask, and it deserves a real answer rather than a soft one.",
    "trap": "Answering with encouragement instead of criteria. He asked for a bar; a warm non-answer converts an ally into someone who thinks the decision was rigged."
  },
  "rt_cfo1": {
    "client": "retail",
    "name": "Suresh Nair",
    "role": "Chief Financial Officer",
    "quote": "Forecasting is a solved problem. I am not paying to solve it again, with our own people, at our own risk.",
    "protecting": "Margin, and a capex line he has already defended once this year.",
    "goals": [
      "Lowest defensible total cost over three years",
      "No open-ended internal build",
      "Nothing the auditors will query"
    ],
    "frustrations": [
      "Internal build estimates that double",
      "\"Strategic\" used to justify unbudgeted spend",
      "Vendors who price the licence and hide the integration"
    ],
    "question": "The ERP vendor bundles it free with the renewal. Why would we pay for anything?",
    "subtext": "The hardest argument in the room to counter, because the price really is zero — on the line item he is looking at.",
    "trap": "Arguing that free is a trick. It is not a trick, it is a strategy — and calling it one loses a CFO who is looking at a real number on a real sheet."
  },
  "rt_cfo2": {
    "client": "retail",
    "name": "Suresh Nair",
    "role": "Chief Financial Officer",
    "quote": "Forecasting is a solved problem. I am not paying to solve it again, with our own people, at our own risk.",
    "protecting": "Margin, and a capex line he has already defended once this year.",
    "goals": [
      "Lowest defensible total cost over three years",
      "No open-ended internal build",
      "Nothing the auditors will query"
    ],
    "frustrations": [
      "Internal build estimates that double",
      "\"Strategic\" used to justify unbudgeted spend",
      "Vendors who price the licence and hide the integration"
    ],
    "question": "Give me the three-year number for building versus buying.",
    "subtext": "A fair and answerable request. The risk is producing a confident table where half the entries are guesses of very different quality.",
    "trap": "Producing a clean comparison. A tidy table with false precision is worse than an honest one with ranges, because he will hold you to the precision."
  },
  "rt_cfo3": {
    "client": "retail",
    "name": "Suresh Nair",
    "role": "Chief Financial Officer",
    "quote": "Forecasting is a solved problem. I am not paying to solve it again, with our own people, at our own risk.",
    "protecting": "Margin, and a capex line he has already defended once this year.",
    "goals": [
      "Lowest defensible total cost over three years",
      "No open-ended internal build",
      "Nothing the auditors will query"
    ],
    "frustrations": [
      "Internal build estimates that double",
      "\"Strategic\" used to justify unbudgeted spend",
      "Vendors who price the licence and hide the integration"
    ],
    "question": "Everyone says “hidden costs”. Name them.",
    "subtext": "Reasonable impatience with advisory vagueness. He will respect a specific list far more than a caution.",
    "trap": "Listing costs without owners or timing. An unowned risk register reads as hedging; the same list with a name and a date against each line reads as control."
  },
  "rt_ops1": {
    "client": "retail",
    "name": "Latha Gopal",
    "role": "Head of Store Operations",
    "quote": "Eight hundred store managers will either use this or route around it. Nobody in this room has asked which.",
    "protecting": "The trust of 800 managers who have been given tools before.",
    "goals": [
      "A forecast narrative managers actually read",
      "No extra steps at 7am",
      "A way to disagree with the system that gets heard"
    ],
    "frustrations": [
      "Rollouts announced as training",
      "Head-office pilots run in three flagship stores",
      "Systems that cannot be overridden — and systems where overrides are ignored"
    ],
    "question": "What happens the first time the forecast is wrong and a manager is blamed?",
    "subtext": "She is describing the exact moment adoption is won or lost, and she has watched it go wrong before.",
    "trap": "Answering with accuracy rates. She is asking about blame and trust; an accuracy answer confirms that nobody has thought about the human consequence of being wrong."
  },
  "rt_ops2": {
    "client": "retail",
    "name": "Latha Gopal",
    "role": "Head of Store Operations",
    "quote": "Eight hundred store managers will either use this or route around it. Nobody in this room has asked which.",
    "protecting": "The trust of 800 managers who have been given tools before.",
    "goals": [
      "A forecast narrative managers actually read",
      "No extra steps at 7am",
      "A way to disagree with the system that gets heard"
    ],
    "frustrations": [
      "Rollouts announced as training",
      "Head-office pilots run in three flagship stores",
      "Systems that cannot be overridden — and systems where overrides are ignored"
    ],
    "question": "Nobody has asked what a store manager does at 7am. Should that change the decision?",
    "subtext": "Not a process complaint. She is pointing out that the requirements have not been written from the place the value is realised.",
    "trap": "Promising to consult stores during implementation. Consultation after selection cannot change what was selected, and she has heard that promise before."
  },
  "rt_ops3": {
    "client": "retail",
    "name": "Latha Gopal",
    "role": "Head of Store Operations",
    "quote": "Eight hundred store managers will either use this or route around it. Nobody in this room has asked which.",
    "protecting": "The trust of 800 managers who have been given tools before.",
    "goals": [
      "A forecast narrative managers actually read",
      "No extra steps at 7am",
      "A way to disagree with the system that gets heard"
    ],
    "frustrations": [
      "Rollouts announced as training",
      "Head-office pilots run in three flagship stores",
      "Systems that cannot be overridden — and systems where overrides are ignored"
    ],
    "question": "Build or buy — which one lets us change it when the stores tell us it is wrong?",
    "subtext": "She has reframed the decision around adaptability, and it may be the most useful criterion anyone has offered.",
    "trap": "Answering “build, obviously”. Build gives you the right to change it, not the capacity — and the capacity is what she is actually asking about."
  },
  "rt_erp1": {
    "client": "retail",
    "name": "Deepak Rao",
    "role": "Account Director · the ERP vendor",
    "quote": "It comes with the renewal. Think of it as included — nothing to approve, nothing to procure, nothing to explain.",
    "protecting": "The renewal, and the account’s dependence on his platform.",
    "goals": [
      "A signed multi-year renewal",
      "One more module inside the estate",
      "Making every alternative look like work"
    ],
    "frustrations": [
      "Being unbundled",
      "Line-item pricing requests",
      "Data-portability questions"
    ],
    "question": "It is included in the renewal. Why would you evaluate alternatives?",
    "subtext": "He is not selling a forecasting module. He is buying three more years of the estate, and the module is the instrument.",
    "trap": "Declining to evaluate the bundle out of suspicion. Incumbents sometimes have the best answer, and refusing to look costs credibility with the CFO you need later."
  },
  "rt_erp2": {
    "client": "retail",
    "name": "Deepak Rao",
    "role": "Account Director · the ERP vendor",
    "quote": "It comes with the renewal. Think of it as included — nothing to approve, nothing to procure, nothing to explain.",
    "protecting": "The renewal, and the account’s dependence on his platform.",
    "goals": [
      "A signed multi-year renewal",
      "One more module inside the estate",
      "Making every alternative look like work"
    ],
    "frustrations": [
      "Being unbundled",
      "Line-item pricing requests",
      "Data-portability questions"
    ],
    "question": "Why introduce a second vendor into an estate that already works?",
    "subtext": "Integration risk is real, and it is also the incumbent’s most reliable argument for never being compared to anything.",
    "trap": "Treating consolidation as self-evidently good. It is a real benefit and a real dependency, and only one of those two usually gets said out loud."
  },
  "rt_erp3": {
    "client": "retail",
    "name": "Deepak Rao",
    "role": "Account Director · the ERP vendor",
    "quote": "It comes with the renewal. Think of it as included — nothing to approve, nothing to procure, nothing to explain.",
    "protecting": "The renewal, and the account’s dependence on his platform.",
    "goals": [
      "A signed multi-year renewal",
      "One more module inside the estate",
      "Making every alternative look like work"
    ],
    "frustrations": [
      "Being unbundled",
      "Line-item pricing requests",
      "Data-portability questions"
    ],
    "question": "You will need our data model anyway. Why not keep it all in one place?",
    "subtext": "The most consequential sentence he will say, phrased as convenience. Whoever holds the data model holds the switching cost.",
    "trap": "Accepting the convenience argument. Convenience today is switching cost tomorrow, and this is the precise moment the line gets drawn or quietly conceded."
  }
};
