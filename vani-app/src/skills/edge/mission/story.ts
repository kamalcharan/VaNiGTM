/** The chapter narrative — reference `src/mission/story.js` `story()`, the rows as data. */
import { coverage, type Variant } from './pathways';
import type { Mission } from './types';

export interface StoryRow { label: string; title: string; body: string; next: string; pain: string; goal: string; open: number; sample: boolean }

export function story(m: Mission, stage: number, variants: Variant[] = []): StoryRow | null {
  const goal = m.goal || m.gains.join(', '), pain = m.priority || m.pains.join(', ') || m.painStory;
  const open = m.tasks.filter((t) => t.status !== 'Resolved').length;
  const c = coverage(m, variants), sample = m.mode === 'sample';
  const rows: [string, string, string][] = [
    ['Let’s begin with the business you know.', 'Your onboarding profile gives us a starting point. Correct it so the investigation starts in the right context.', 'Next, we’ll establish whose experience we are hearing.'],
    ['Every process has more than one perspective.', `${m.company} is our starting context. Now we need the people who can explain the work, decisions and records.`, 'Name the people involved. Questions they need to answer can stay open while you continue.'],
    ['Give this investigation a useful boundary.', m.respondent.name ? `${m.respondent.name}, we’ll use your perspective as ${m.respondent.designation} and bring in colleagues where needed.` : 'We need a named respondent before interpreting the answers.', 'Choose the process, then tell us what needs to change.'],
    ['Start with what makes the work difficult.', 'A recent example helps us understand the consequence, the people involved and possible explanations.', 'We’ll turn your concerns into questions to test, and agree what improvement should look like.'],
    ['Let’s put your experience on the board.', pain ? `You described: ${pain}.` : 'Your process description will establish the work we need to understand.', goal ? `Your aim is: ${goal}. Include the returns and exceptions that could affect it.` : 'Draw the ordinary route and the places where work takes a different turn.'],
    ['Now explain why the work takes those routes.', `Your board contains ${m.board.length} activities and ${m.links.length} connections. It describes the process as your team understands it.`, 'Capture the rules, systems and authorised exceptions. Unknowns remain questions for the right person.'],
    ['Let’s find the records that can test the story.', pain ? `We are investigating: ${pain}.` : 'We have a reported process; the next step is to connect it to records.', 'Each request below explains what to export and what it can establish. Missing records limit what we can conclude.'],
    ['The map is where we challenge our first understanding.', sample ? (m.process === 'p2p' ? 'In this reference sample, 38% follow the expected route. The other pathways are the investigation—not background detail.' : 'This illustrative O2C scenario includes a dispute route. Explore its handling before proposing automation.') : 'Your board is a working description. Your records have not yet been mined, so observed pathways remain unknown.', 'Select a route, inspect a case, explain the exception and decide its handling. The sample does not establish the causes of your business pain.'],
    ['Bring your explanation back to the evidence.', pain ? `Our starting concern was: ${pain}.` : 'We started with your team’s experience and a process description.', sample ? 'Use these sample observations to practise challenging an explanation. Keep customer hypotheses unconfirmed until your own evidence supports them.' : 'Your hypotheses remain open. Identify the evidence or colleague needed to resolve each one.'],
    ['A faster route is useful only when its handling is understood.', sample ? `${c.automate + c.conditional}% of sample cases have complete proposed automation handling; ${c.human}% have human handling; ${c.unresolved}% remain unresolved.` : 'Customer pathway coverage is unknown until event evidence is validated.', `${open ? open + ' contribution request(s) remain open. ' : ''}Review the unresolved routes and operating controls before defining a pilot.`],
    ['Connect the proposed scope to the change you want.', goal ? `Your intended outcome is: ${goal}.` : 'Agree a measurable outcome before treating the value scenario as a business case.', 'The calculator uses your planning assumptions. Sample pathway coverage does not automatically establish eligible coverage, saved time or cash savings.'],
    ['Your next conversation starts with what we have learned.', goal ? `You want to achieve: ${goal}.` : 'Your desired outcome still needs to be agreed.', sample ? `${c.unresolved}% of the sample remains unresolved. Bring your pathway decisions and open questions into the review, then validate them on your own records.` : 'Bring your process description, rules and evidence gaps into the review so the team can agree what to validate first.'],
  ];
  const row = rows[stage];
  if (!row) return null;
  return {
    label: stage < 4 ? 'UNDERSTAND TOGETHER' : stage < 9 ? 'FOLLOW THE EVIDENCE' : 'DECIDE THE NEXT MOVE',
    title: row[0], body: row[1], next: row[2], pain, goal, open, sample,
  };
}
