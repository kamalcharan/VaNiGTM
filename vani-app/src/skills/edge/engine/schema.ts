/**
 * The four P2P registers the engine reads, column by column. The templates
 * on chapter 7 download exactly these files, so a tenant who exports to the
 * template's shape is analysed the same way the sample is.
 *
 * `required` columns are what the pathway reconstruction cannot do without;
 * the rest widen the rulebook (a missing Vendor master leaves the MSME rules
 * untested rather than guessed).
 */
import type { Table } from './csv';
import { findHeader } from './csv';

export type FileKind = 'ap' | 'po' | 'grn' | 'vendor';

export interface ColumnDef { name: string; required?: boolean; event?: string; role: string }

export const SCHEMA: Record<FileKind, { name: string; required: boolean; columns: ColumnDef[] }> = {
  ap: {
    name: 'AP invoice register', required: true,
    columns: [
      { name: 'Invoice No', required: true, role: 'Case identifier' },
      { name: 'Vendor Code', required: true, role: 'Joins the vendor master and GRNs' },
      { name: 'Vendor Name', role: 'Display' },
      { name: 'Depot', role: 'Receiving point' },
      { name: 'PO No', role: 'Joins the PO register' },
      { name: 'Invoice Date', role: 'Payment terms basis' },
      { name: 'Received On', required: true, event: 'Invoice received', role: 'Event timestamp' },
      { name: 'Invoice Qty', role: '3-way match (quantity)' },
      { name: 'Invoice Rate', role: '3-way match (price)' },
      { name: 'Taxable Value', role: 'PO-mandatory threshold' },
      { name: 'GST', role: 'Display' },
      { name: 'Invoice Amount', role: 'Duplicate detection' },
      { name: 'Matched On', event: 'Invoice matched', role: 'Event timestamp' },
      { name: 'Hold On', event: 'Invoice held', role: 'Event timestamp' },
      { name: 'Hold Released On', event: 'Hold released', role: 'Event timestamp' },
      { name: 'Returned On', event: 'Returned', role: 'Event timestamp' },
      { name: 'Debit Note On', event: 'Debit note', role: 'Event timestamp' },
      { name: 'Approved On', required: true, event: 'Invoice approved', role: 'Event timestamp' },
      { name: 'Approved By', role: 'Approval authority' },
      { name: 'Paid On', required: true, event: 'Paid', role: 'Event timestamp' },
      { name: 'Payment Ref', role: 'Payment standardisation' },
    ],
  },
  po: {
    name: 'PO register', required: true,
    columns: [
      { name: 'PO No', required: true, role: 'Joins invoices and GRNs' },
      { name: 'PO Date', required: true, event: 'PO created', role: 'Event timestamp' },
      { name: 'Vendor Code', role: 'Display' },
      { name: 'Depot', role: 'Receiving point' },
      { name: 'Qty', role: '3-way match (quantity)' },
      { name: 'Rate', role: '3-way match (price)' },
      { name: 'PO Value', role: 'Approval limit by value' },
      { name: 'Created By', role: 'Segregation of duties' },
      { name: 'Approved By', role: 'Segregation of duties' },
      { name: 'Approver Role', role: 'Approval limit by value' },
      { name: 'Approved On', required: true, event: 'PO approved', role: 'Event timestamp' },
      { name: 'Amended On', event: 'PO amended', role: 'Event timestamp' },
      { name: 'Required By', role: 'Completeness' },
    ],
  },
  grn: {
    name: 'GRN register', required: false,
    columns: [
      { name: 'GRN No', required: true, role: 'Identifier' },
      { name: 'PO No', role: 'Joins the PO register' },
      { name: 'Invoice Ref', required: true, role: 'Joins invoices' },
      { name: 'Vendor Code', required: true, role: 'Joins invoices' },
      { name: 'Depot', role: 'Receiving point' },
      { name: 'Goods Received On', required: true, event: 'Goods received', role: 'Event timestamp' },
      { name: 'GRN Posted On', required: true, event: 'GRN posted', role: 'Event timestamp' },
      { name: 'Qty Received', role: '3-way match (quantity)' },
      { name: 'Batch No', role: 'Completeness' },
      { name: 'Expiry', role: 'Completeness' },
    ],
  },
  vendor: {
    name: 'Vendor master', required: false,
    columns: [
      { name: 'Vendor Code', required: true, role: 'Joins invoices' },
      { name: 'Vendor Name', role: 'Display' },
      { name: 'State', role: 'Display' },
      { name: 'MSME Category', role: 'MSME payment rules' },
      { name: 'Payment Terms (days)', role: 'Payment terms rule' },
      { name: 'Written Agreement', role: 'MSME 45/15-day rule' },
    ],
  },
};

export interface ColumnReport { kind: FileKind; provided: boolean; found: string[]; missing: string[]; missingRequired: string[]; rows: number }

/** What each attached file gives the engine, column by column. */
export function reportColumns(kind: FileKind, table: Table | null): ColumnReport {
  const def = SCHEMA[kind];
  if (!table) return { kind, provided: false, found: [], missing: def.columns.map((c) => c.name), missingRequired: def.columns.filter((c) => c.required).map((c) => c.name), rows: 0 };
  const found = def.columns.filter((c) => findHeader(table.headers, c.name)).map((c) => c.name);
  const missing = def.columns.filter((c) => !findHeader(table.headers, c.name)).map((c) => c.name);
  const missingRequired = def.columns.filter((c) => c.required && !findHeader(table.headers, c.name)).map((c) => c.name);
  return { kind, provided: true, found, missing, missingRequired, rows: table.rows.length };
}

/** Can the engine run at all? AP and PO with their required columns. */
export function readiness(reports: Record<FileKind, ColumnReport>): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  for (const kind of ['ap', 'po'] as FileKind[]) {
    const r = reports[kind];
    if (!r.provided) reasons.push(`${SCHEMA[kind].name} not attached`);
    else if (r.missingRequired.length) reasons.push(`${SCHEMA[kind].name} is missing ${r.missingRequired.join(', ')}`);
  }
  for (const kind of ['grn', 'vendor'] as FileKind[]) {
    const r = reports[kind];
    if (r.provided && r.missingRequired.length) reasons.push(`${SCHEMA[kind].name} is missing ${r.missingRequired.join(', ')}`);
  }
  return { ok: reasons.length === 0, reasons };
}
