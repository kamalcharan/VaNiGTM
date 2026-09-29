/**
 * Chapters, process packs, rules and evidence requests — verbatim from the
 * reference's `src/mission/domain.js` and `failure.js` (`failureChapters`).
 * Copy lives here once; every view reads it.
 */
import type { ProcessId } from './types';

export type Chapter = [name: string, sub: string];

export const chapters: Chapter[] = [
  ['Your context', 'Confirm what Edge knows'], ['People & ownership', 'Meet the people doing the work'],
  ['Process & scope', 'Set the boundaries'], ['Pain & desired gains', 'Understand what matters'],
  ['Your process board', 'Describe the work and exceptions'], ['Rules & systems', 'Establish the operating context'],
  ['Evidence workspace', 'Prepare, attach and map evidence'], ['Process explorer', 'See paths, waits and cases'],
  ['Findings & hypotheses', 'Explain and challenge the evidence'], ['Readiness', 'Decide what is ready'],
  ['Value & controls', 'Compare the choices'], ['Automation Strategy', 'Take the next step'],
];

export const failureChapters: Chapter[] = [
  ['Your context', 'Confirm the business'], ['People & ownership', 'Name the investigation team'],
  ['Incident scope', 'Set the investigation boundary'], ['What went wrong', 'Expected versus actual'],
  ['Failure pathway', 'Map the intended work'], ['Rules & changes', 'Establish the rules at the time'],
  ['Incident evidence', 'Gather logs and comparison cases'], ['Case comparison', 'Reconstruct the failure'],
  ['Possible causes', 'Test competing explanations'], ['Corrective actions', 'Assign and plan corrections'],
  ['Verification', 'Define evidence of effectiveness'], ['Failure Review', 'Take your action plan forward'],
];

/** URL slug per chapter index — the same twelve for both mission types. */
export const CHAPTER_SLUGS = [
  'context', 'people', 'scope', 'discovery', 'board', 'rules', 'evidence', 'explorer', 'findings', 'readiness', 'value', 'strategy',
] as const;
export type ChapterSlug = (typeof CHAPTER_SLUGS)[number];
export const stageOfSlug = (slug: string): number => CHAPTER_SLUGS.indexOf(slug as ChapterSlug);
export const slugOfStage = (stage: number): string => CHAPTER_SLUGS[stage] ?? '';

export type RuleDef = [id: string, question: string, sub: string];
export type FileDef = [id: string, title: string, fields: string, source: string, why: string, formats: string];

export interface Pack {
  pains: string[];
  gains: string[];
  follows: Record<string, [string, string[]]>;
  rules: RuleDef[];
  activities: string[];
  files: FileDef[];
}

export const packs: Record<ProcessId, Pack> = {
  p2p: {
    pains: ['Month-end invoice backlog', 'Slow approvals', 'Invoices without POs', 'Late goods-receipt posting', 'Duplicate or wrong payments', 'Suppliers chasing payment status', 'Late supplier payments', 'Reconciliation mismatches'],
    gains: ['Close books faster', 'Reduce approval effort', 'Pay suppliers on time', 'Reduce invoice rework', 'Improve supplier visibility', 'Capture available discounts'],
    follows: {
      'Month-end invoice backlog': ['What usually holds up the close?', ['Approval queues', 'Missing receipts', 'Reconciliation', 'Not sure']],
      'Slow approvals': ['Who or what do approvals wait on?', ['Finance Controller', 'CFO', 'Missing information', 'It varies']],
      'Invoices without POs': ['Which purchases follow this route?', ['Services', 'Urgent purchases', 'Multiple categories', 'Not sure']],
      'Late goods-receipt posting': ['When is receipt usually recorded?', ['Same day', '1–3 days later', 'About a week later', 'Not sure']],
      'Duplicate or wrong payments': ['What has your team actually encountered?', ['Confirmed duplicates', 'Suspected duplicates', 'Incorrect amounts', 'No verified cases']],
      'Suppliers chasing payment status': ['How do suppliers request updates?', ['Email', 'Calls', 'WhatsApp', 'Several channels']],
      'Late supplier payments': ['What most often prevents on-time payment?', ['Approval pending', 'Cash scheduling', 'Dispute or missing documents', 'Not sure']],
      'Reconciliation mismatches': ['Where does reconciliation break down?', ['Invoice to PO', 'Receipt to invoice', 'Tax records', 'Not sure']],
    },
    rules: [
      ['approval', 'Who approves purchases and invoices, and at what limits?', 'Include thresholds, currency, entity and delegated authority.'],
      ['matching', 'What must match before an invoice can proceed?', 'Price and quantity tolerances; receipts required; allowed exceptions.'],
      ['terms', 'How are payment dates agreed?', 'Supplier terms, acceptance dates and authorised exceptions.'],
      ['po', 'When is a purchase order required?', 'Spend categories, thresholds, emergency purchases and exemptions.'],
      ['receipt', 'When should goods receipts be recorded?', 'Time limit, responsible team and partial-delivery handling.'],
    ],
    activities: ['Purchase requested', 'PO created', 'PO approved', 'Goods received', 'Receipt recorded', 'Invoice received', 'Invoice matched', 'Invoice approved', 'Payment released'],
    files: [
      ['ap', 'Invoice register', 'Invoice number, supplier ID, PO reference, amount, received / approved / paid dates', 'Tally / ERP / Excel', 'Connect invoice receipt to approval and payment.', 'csv,xlsx,xls'],
      ['po', 'Purchase-order register', 'PO number, supplier ID, creation date, value, approver and approval date', 'Purchasing system / ERP', 'Identify late POs and recorded approval paths.', 'csv,xlsx,xls'],
      ['grn', 'Goods-receipt register', 'Receipt ID, PO / invoice reference, arrival date, posting date, quantity', 'Warehouse system / ERP / Excel', 'Distinguish goods arrival from later recording.', 'csv,xlsx,xls'],
      ['vendor', 'Vendor master', 'Supplier ID, category, agreed terms and relevant status', 'Tally / ERP / Excel', 'Interpret terms and supplier-specific conditions.', 'csv,xlsx,xls'],
      ['history', 'Approval history', 'Invoice / PO ID, action, actor, timestamp and return reason', 'Workflow system / email export', 'Reconstruct returns, delegation and approval waits.', 'csv,xlsx,xls'],
      ['docs', 'Documents & policies', 'Representative invoices, receipt documents, approval matrix or SOP', 'Email / scanned documents / paper', 'Explain document handling and stated policy. Documents alone do not establish the full event history.', 'pdf,png,jpg,jpeg,eml'],
    ],
  },
  o2c: {
    pains: ['Delayed billing', 'Invoice disputes', 'Overdue collections', 'Unmatched customer receipts', 'Credit approval delays', 'Returns and credit notes', 'Manual collection follow-up', 'Missing delivery evidence'],
    gains: ['Invoice customers sooner', 'Reduce disputes', 'Improve collection timing', 'Apply cash faster', 'Reduce follow-up effort', 'Improve customer experience'],
    follows: {
      'Delayed billing': ['What usually prevents invoice creation?', ['Delivery confirmation', 'Price approval', 'Manual entry', 'Not sure']],
      'Invoice disputes': ['What do customers most often dispute?', ['Price', 'Quantity / delivery', 'Terms', 'Multiple reasons']],
      'Overdue collections': ['What blocks the next collection action?', ['Dispute', 'No contact owner', 'Unallocated payment', 'Not sure']],
      'Unmatched customer receipts': ['What information is missing from receipts?', ['Invoice reference', 'Customer ID', 'Remittance advice', 'Not sure']],
      'Credit approval delays': ['Who approves credit exceptions?', ['Finance', 'Sales leadership', 'Credit committee', 'It varies']],
      'Returns and credit notes': ['Where do credit notes wait?', ['Return confirmation', 'Approval', 'Customer agreement', 'Not sure']],
      'Manual collection follow-up': ['How are follow-ups tracked?', ['Excel', 'Email', 'CRM', 'Not consistently']],
      'Missing delivery evidence': ['Where is proof of delivery kept?', ['Email', 'Logistics portal', 'Paper / images', 'Several places']],
    },
    rules: [
      ['credit', 'Who authorises credit limits and exceptions?', 'Limits, authority and account holds.'],
      ['billing', 'What triggers invoicing?', 'Dispatch, delivery, acceptance or milestones.'],
      ['terms', 'How are customer payment terms agreed?', 'Due-date basis and exceptions.'],
      ['dispute', 'What happens when an invoice is disputed?', 'Owner, reminder pause, resolution and escalation.'],
      ['cash', 'How are receipts matched and adjustments approved?', 'Reference matching, tolerance, credit notes and write-offs.'],
    ],
    activities: ['Order received', 'Credit reviewed', 'Order fulfilled', 'Delivery confirmed', 'Invoice issued', 'Collection follow-up', 'Receipt received', 'Cash applied'],
    files: [
      ['ap', 'Sales invoice register', 'Invoice ID, customer ID, order ID, amount, issue / due / paid dates', 'ERP / accounting / Excel', 'Establish billing and collection timing.', 'csv,xlsx,xls'],
      ['po', 'Sales-order register', 'Order ID, customer ID, order / fulfilment dates and value', 'ERP / CRM', 'Connect orders to fulfilment and billing.', 'csv,xlsx,xls'],
      ['grn', 'Customer receipts', 'Receipt ID, customer / invoice reference, date and applied amount', 'Bank reconciliation / accounting', 'See receipt timing and cash application.', 'csv,xlsx,xls'],
      ['vendor', 'Customer master', 'Customer ID, payment terms, credit limit and account owner', 'ERP / CRM', 'Interpret account-specific terms.', 'csv,xlsx,xls'],
      ['history', 'Disputes & collection history', 'Invoice ID, status, action, timestamp, reason and owner', 'CRM / shared tracker / email export', 'Identify dispute paths and repeated follow-up.', 'csv,xlsx,xls'],
      ['docs', 'Documents & policies', 'Invoices, delivery evidence, credit policy and sample correspondence', 'Email / PDF / images', 'Explain disputes and policy. Documents do not by themselves reveal all process events.', 'pdf,png,jpg,jpeg,eml'],
    ],
  },
};

export const systems = ['Tally', 'SAP / ERP', 'Excel', 'Email', 'CRM / workflow', 'Images / PDFs', 'Paper', 'Other'];
export const controlLabels = { assist: 'Assist the team', guarded: 'Automate within agreed limits', extend: 'Explore wider coverage after validation' } as const;

/** The two processes as the welcome and scope screens name them (reference `src/data/processes.js`, the fields the mission uses). */
export const processes: Record<ProcessId, { name: string; short: string; description: string; opportunity: string; control: string; risk: string }> = {
  p2p: { name: 'Procure to Pay', short: 'P2P', description: 'From purchase request to supplier payment.', opportunity: 'Invoice intake & approval routing',
    control: 'Keep payment release with your finance team. Route missing receipts and possible duplicates for review.',
    risk: 'Faster processing can accelerate duplicate invoices and approvals without a recorded receipt.' },
  o2c: { name: 'Order to Cash', short: 'O2C', description: 'From customer order to cash in the bank.', opportunity: 'Billing checks & collection prioritisation',
    control: 'Review disputes before reminders. Keep credit decisions and write-offs with your team.',
    risk: 'Automated reminders can chase disputed or already-paid invoices if payment and dispute records are incomplete.' },
};
