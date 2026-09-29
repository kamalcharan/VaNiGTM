/**
 * What the explorer draws when no engine output exists for a process:
 * the explicitly invented O2C scenario (reference `views-intelligence.js`
 * `o2c`), and the finding questions the UI asks per finding group.
 *
 * P2P numbers come from the analysis engine (../engine) — computed from the
 * four registers, sample or the tenant's own — never from a fixture.
 */
import type { Analysis, Graph } from '../engine/analyse';
import type { Mission } from './types';

export type ReferenceData = Graph;
export type { ReadinessStep } from '../engine/analyse';

export const o2c: Graph = {
  invoices: 1800, activities: 7, distinctVariants: 2,
  nodes: {
    ORD: { x: 180, y: 30, label: 'Order received', n: 1800 }, FUL: { x: 180, y: 130, label: 'Fulfilled', n: 1800 }, INV: { x: 180, y: 230, label: 'Invoice issued', n: 1800 },
    DIS: { x: 370, y: 315, label: 'Disputed', n: 324, side: 1 }, REV: { x: 370, y: 410, label: 'Resolved', n: 324, side: 1 },
    PAY: { x: 180, y: 480, label: 'Payment received', n: 1800 }, APP: { x: 180, y: 575, label: 'Cash applied', n: 1800 },
  },
  edges: [['ORD', 'FUL', 1800, 3, 1], ['FUL', 'INV', 1800, 2, 1], ['INV', 'PAY', 1476, 30, 1], ['INV', 'DIS', 324, 5, 0], ['DIS', 'REV', 324, 8.4, 0], ['REV', 'PAY', 324, 12, 0], ['PAY', 'APP', 1800, 2, 1]],
  variants: [
    { id: 'V1', label: 'Invoice to payment', seq: ['ORD', 'FUL', 'INV', 'PAY', 'APP'], share: 82, cases: 1476, days: 32 },
    { id: 'V2', label: 'Dispute before payment', seq: ['ORD', 'FUL', 'INV', 'DIS', 'REV', 'PAY', 'APP'], share: 18, cases: 324, days: 27.4 },
  ],
  cases: {
    V1: { inv: 'DEMO-001', vendor: 'Illustrative customer', ev: [['ORD', '1 Apr'], ['FUL', '4 Apr', 3], ['INV', '6 Apr', 2], ['PAY', '6 May', 30], ['APP', '8 May', 2]] },
    V2: { inv: 'DEMO-002', vendor: 'Illustrative customer', ev: [['ORD', '1 Apr'], ['FUL', '4 Apr', 3], ['INV', '6 Apr', 2], ['DIS', '11 Apr', 5], ['REV', '19 Apr', 8.4], ['PAY', '1 May', 12], ['APP', '3 May', 2]] },
  },
};

export interface FindingItem { id: string; title: string; metric: string; text: string; question: string; options: string[] }

/** The question the mission asks about each finding group — the reference's chapter-9 prompts. */
const QUESTIONS: Record<string, { question: string; options: string[] }> = {
  'approval-wait': { question: 'What happens inside that interval?', options: ['Waiting for documents', 'Approver queue', 'Several causes', 'Needs confirmation'] },
  'match-receipt': { question: 'Can goods arrive before the system receipt is posted?', options: ['Yes, routinely', 'Only in specific cases', 'Needs confirmation'] },
  'cfo-limit': { question: 'Is the Finance Controller authorised to approve these?', options: ['Delegation exists', 'CFO approval required', 'Needs confirmation'] },
  'duplicates': { question: 'Could these include legitimate repeat bills?', options: ['Some may be legitimate', 'Confirmed issues need evidence', 'Needs confirmation'] },
  'po-policy': { question: 'Are there approved non-standard purchasing routes?', options: ['Yes, defined exceptions', 'No exceptions allowed', 'Needs confirmation'] },
  'msme-late': { question: 'Who can validate the terms and acceptance dates?', options: ['Finance owner', 'Supplier operations', 'Needs confirmation'] },
};

export function findingItems(m: Mission, analysis: Analysis | null): FindingItem[] {
  if (m.process === 'o2c') return [
    { id: 'dispute', title: 'Disputes interrupt collection follow-up', metric: '18%', text: 'The illustrative scenario routes 324 of 1,800 invoices into dispute.', question: 'Are reminders paused while a dispute is open?', options: ['Yes, by policy', 'Only sometimes', 'Needs confirmation'] },
    { id: 'cash', title: 'Receipt and cash application are separate steps', metric: '2 days', text: 'The demonstration includes a two-day receipt-to-application interval.', question: 'Can an invoice be chased after its payment has arrived?', options: ['It can happen', 'Prevented by a control', 'Needs confirmation'] },
  ];
  if (!analysis) return [];
  return analysis.findings.map((f) => ({ id: f.group, title: f.title, metric: f.value, text: f.text, ...(QUESTIONS[f.group] ?? { question: 'Who can explain this?', options: ['Process owner', 'Needs confirmation'] }) }));
}
