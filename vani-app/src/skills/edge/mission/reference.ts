/**
 * The labelled reference data — reference `views-intelligence.js`
 * (`loadReference`, the invented `o2c` scenario, `findingItems`). P2P comes
 * from the two JSON files the prototype shipped, served from /edge/data;
 * O2C is the explicitly invented demonstration, inline as in the prototype.
 */
import type { Mission } from './types';
import type { Variant } from './pathways';

export interface RefNode { x: number; y: number; n: number; label: string; side?: number }
/** [from, to, count, waitDays, normal(1|0), kind?] */
export type RefEdge = [string, string, number, number, number, string?];
export interface RefCase { inv: string; vendor: string; ev: [string, string, number?][] }
export interface ReferenceData { nodes: Record<string, RefNode>; edges: RefEdge[]; variants: Variant[]; cases: Record<string, RefCase> }

export interface ReadinessStep {
  id?: string; name: string; dimensions?: Record<string, number | null>; rawScore?: number; score: number | null;
  band?: string; bandName: string; confidence: string; notes: string[];
}
export interface ReferenceResults { readiness: { steps: ReadinessStep[] } }

export const o2c: ReferenceData = {
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

export async function loadReference(): Promise<{ reference: ReferenceData; results: ReferenceResults }> {
  const [reference, results] = await Promise.all(['/edge/data/p2p-explorer.json', '/edge/data/p2p-reference-results.json'].map(async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw Error('Reference data unavailable');
    return r.json();
  }));
  return { reference: reference as ReferenceData, results: results as ReferenceResults };
}

export interface FindingItem { id: string; title: string; metric: string; text: string; question: string; options: string[] }

export function findingItems(m: Mission): FindingItem[] {
  if (m.process === 'o2c') return [
    { id: 'dispute', title: 'Disputes interrupt collection follow-up', metric: '18%', text: 'The illustrative scenario routes 324 of 1,800 invoices into dispute.', question: 'Are reminders paused while a dispute is open?', options: ['Yes, by policy', 'Only sometimes', 'Needs confirmation'] },
    { id: 'cash', title: 'Receipt and cash application are separate steps', metric: '2 days', text: 'The demonstration includes a two-day receipt-to-application interval.', question: 'Can an invoice be chased after its payment has arrived?', options: ['It can happen', 'Prevented by a control', 'Needs confirmation'] },
  ];
  return [
    { id: 'wait', title: 'Invoice receipt to approval takes 10.2 days', metric: '10.2d', text: 'This interval includes matching and other steps. It is not a direct measure of an approver’s working time.', question: 'What happens inside that interval?', options: ['Waiting for documents', 'Approver queue', 'Several causes', 'Needs confirmation'] },
    { id: 'grn', title: 'Receipt posting is associated with matching failures', metric: '63.6%', text: 'In the sample, 63.6% of recorded matching failures cite a receipt not posted when the invoice arrived.', question: 'Can goods arrive before the system receipt is posted?', options: ['Yes, routinely', 'Only in specific cases', 'Needs confirmation'] },
    { id: 'delegation', title: 'High-value POs need an authority check', metric: '214 POs', text: '214 of 930 sample POs above ₹5 lakh have Finance Controller approval recorded. Delegation needs to be checked before concluding a breach.', question: 'Is the Finance Controller authorised to approve these?', options: ['Delegation exists', 'CFO approval required', 'Needs confirmation'] },
    { id: 'duplicates', title: 'Possible duplicates need case review', metric: '37 candidates', text: 'The sample flags 37 paid invoices totalling ₹18.6 lakh. Similar numbers or amounts are indicators, not proof of duplicate payment or recoverable cash.', question: 'Could these include legitimate repeat bills?', options: ['Some may be legitimate', 'Confirmed issues need evidence', 'Needs confirmation'] },
    { id: 'po', title: 'Some invoices precede their purchase order', metric: '1,011 cases', text: 'The reference sample includes POs recorded after the invoice. Some categories may have an authorised alternate route.', question: 'Are there approved non-standard purchasing routes?', options: ['Yes, defined exceptions', 'No exceptions allowed', 'Needs confirmation'] },
    { id: 'terms', title: 'Payment timing needs supplier context', metric: '31.0%', text: 'The sample flags this share of Micro/Small supplier invoices against its configured timing rule. Validate applicable terms, dates and obligations before treating it as a compliance conclusion.', question: 'Who can validate the terms and acceptance dates?', options: ['Finance owner', 'Supplier operations', 'Needs confirmation'] },
  ];
}
