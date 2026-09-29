import {packs,controlLabels} from './domain.js';import {hypotheses,blockers} from './discovery.js';import {estimate,money,number} from '../lib/model.js';
export function missionBrief(m){const v=estimate(m.assumptions);return `VANI EDGE — DECISION INTELLIGENCE BRIEF

Company: ${m.company}
Industry: ${m.industry}
Context source: ${m.profileSource}
Process: ${m.process.toUpperCase()}
Evidence mode: ${m.mode==='sample'?'LABELLED REFERENCE / ILLUSTRATIVE SAMPLE — not customer findings':'Customer preparation — event analysis not connected'}

THE STORY SO FAR
You told us: ${m.priority||m.pains.join('; ')||m.painStory||'Pain still to clarify'}
You want to gain: ${m.goal||m.gains.join('; ')||'Outcome still to clarify'}
Our next conversation: validate the pathway explanations, resolve open questions and agree a bounded pilot with owners, controls and success measures.
Evidence boundary: ${m.mode==='sample'?'Sample interpretations still require validation on your own records.':'Customer event analysis has not been performed.'}

PEOPLE
Respondent: ${m.respondent.name}, ${m.respondent.designation} (${m.respondent.role})
Scope: ${m.respondent.scope}
${m.actors.map(a=>`${a.name} — ${a.designation}; ${a.responsibility}`).join('\n')}

PAIN AND DESIRED GAINS
Priority: ${m.priority}
Pain: ${m.pains.join('; ')}
Example: ${m.painStory}
Frequency: ${m.frequency}
Impact: ${m.impact}
Desired gains: ${m.gains.join('; ')}
Goal: ${m.goal}
Baseline → target: ${m.current||'Unknown'} → ${m.target||'Unconfirmed'} ${m.unit}
Timing: ${m.deadline}

REPORTED PROCESS
${m.board.map(n=>`${n.label} | ${n.type} | owner: ${n.actor||'Unconfirmed'} | system: ${n.system||'Unconfirmed'} | input: ${n.input} | output: ${n.output} | rule: ${n.rule}`).join('\n')}
Connections:
${m.links.map(l=>`${m.board.find(n=>n.id===l.from)?.label} → ${m.board.find(n=>n.id===l.to)?.label}: ${l.label} (${l.kind})`).join('\n')}
Board confirmed: ${m.boardConfirmed?'Yes':'No'}
Process clarification: ${m.context}

RULES AND SYSTEMS
${packs[m.process].rules.map(([id,q])=>`${q}\n${m.rules[id]||'Unanswered'} [${m.ruleStatus[id]||'Unconfirmed'}]`).join('\n\n')}
Systems: ${m.stack.join(', ')}
Notes: ${m.systemNotes}

EVIDENCE PREPARATION
${m.files.map(f=>`${f.kind}: ${f.name} — ${f.error|| (f.rows?f.rows+' rows':'Document not extracted')}`).join('\n')||'No customer files attached'}
Mapping note: ${m.mapping.note||'None'}

HYPOTHESES — CUSTOMER VALIDATION STILL REQUIRED
${hypotheses(m).map(h=>`${h.id}: ${h.text} | Answer: ${h.answer}`).join('\n')}
Sample interpretation notes: ${Object.entries(m.resolutions).map(([k,v])=>k+': '+v).join('; ')}

PATHWAY DECISIONS — PROPOSED, NOT DEPLOYMENT APPROVAL
${Object.entries(m.pathReviews||{}).map(([id,r])=>id+': '+Object.entries(r).map(([k,v])=>k+' = '+v).join('; ')).join('\n')||'No pathways reviewed. Automation scope is unresolved.'}
Unreviewed routes remain outside proposed automation scope.

OPEN CONTRIBUTIONS
${m.tasks.map(t=>`${t.assignee}: ${t.topic} — ${t.status}; response: ${t.response||'Pending'}`).join('\n')||'None assigned'}

READINESS PREREQUISITES
${blockers(m).join('\n')}
Sample scores, where shown, use the original prototype method and do not score this customer.

VALUE SCENARIO — ASSUMPTIONS, NOT A QUOTE
${Object.entries(m.assumptions).map(([k,v])=>k+': '+v).join('\n')}
Potential capacity: ${number(v.freed)} hours/month; ${money(v.value)}/month capacity value.
Capacity is not automatically cash savings. Implementation, adoption and unmodelled costs affect realisation.
Control preference: ${controlLabels[m.control]}

IMPLEMENTATION REVIEW
Validate the process and exceptions. Agree evidence gaps, first pilot scope, controls, ownership and success measures.
Booking: https://calendly.com/connect-vikuna/30min
This brief is local. It has not been sent automatically.
`;}
