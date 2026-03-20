/**
 * KI-30: import_nse_transactions — Parse NSE order book CSV
 *
 * NSE order book columns (standard format):
 *   Order No, Order Date, Scheme Code, Scheme Name, Transaction Type,
 *   Amount, Units, NAV, Status
 *
 * Only imports rows with Status = "Completed" / "Allotted".
 * Idempotent via ON CONFLICT DO NOTHING on dedup index.
 */

import { SkillContext } from '../../../shared/types';
import * as fs from 'fs';
import * as path from 'path';

/* ── types ─────────────────────────────────────────────── */

interface ParsedNSETxn {
  scheme_code: string;
  scheme_name: string;
  txn_date: string;
  txn_type: string;
  amount: number;
  units: number;
  nav: number;
}

interface ImportError {
  row: number;
  reason: string;
}

interface InsertResult {
  id?: number;
}

interface ImportNSEResult {
  imported_count: number;
  skipped_count: number;
  date_range: { from: string; to: string };
  errors: ImportError[];
  recipe: 'data-table';
}

/* ── SQL ───────────────────────────────────────────────── */

const INSERT_TXN_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/insert-transactions.sql'),
  'utf-8'
);

const INSERT_LOG_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/insert-import-log.sql'),
  'utf-8'
);

/* ── column mappings ───────────────────────────────────── */

interface NSEColumnMap {
  order_date: string;
  scheme_code: string;
  scheme_name: string;
  txn_type: string;
  amount: string;
  units: string;
  nav: string;
  status: string;
}

const NSE_FORMAT_A: NSEColumnMap = {
  order_date: 'Order Date',
  scheme_code: 'Scheme Code',
  scheme_name: 'Scheme Name',
  txn_type: 'Transaction Type',
  amount: 'Amount',
  units: 'Units',
  nav: 'NAV',
  status: 'Status',
};

const NSE_FORMAT_B: NSEColumnMap = {
  order_date: 'order_date',
  scheme_code: 'scheme_code',
  scheme_name: 'scheme_name',
  txn_type: 'txn_type',
  amount: 'amount',
  units: 'units',
  nav: 'nav',
  status: 'status',
};

const NSE_FORMATS = [NSE_FORMAT_A, NSE_FORMAT_B];

/* ── helpers ───────────────────────────────────────────── */

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function detectNSEFormat(headers: string[]): NSEColumnMap | null {
  const headerSet = new Set(headers.map((h) => h.trim()));
  for (const fmt of NSE_FORMATS) {
    const required = [fmt.order_date, fmt.scheme_code, fmt.amount, fmt.units];
    if (required.every((col) => headerSet.has(col))) return fmt;
  }
  return null;
}

function normaliseDate(raw: string): string {
  // dd/mm/yyyy or dd-mm-yyyy → yyyy-mm-dd
  const m = raw.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return raw;
}

function normaliseTxnType(raw: string): string {
  const lower = raw.toLowerCase().trim();
  if (lower.includes('purchase') || lower.includes('buy')) return 'purchase';
  if (lower.includes('sip') || lower.includes('systematic')) return 'sip';
  if (lower.includes('redemption') || lower.includes('sell')) return 'redemption';
  if (lower.includes('switch in')) return 'switch_in';
  if (lower.includes('switch out')) return 'switch_out';
  return 'purchase';
}

function isCompletedStatus(status: string): boolean {
  const lower = status.toLowerCase().trim();
  return lower === 'completed' || lower === 'allotted' || lower === 'success';
}

/* ── main function ─────────────────────────────────────── */

export async function import_nse_transactions(
  params: { file_path: string; client_id: number },
  ctx: SkillContext
): Promise<ImportNSEResult> {
  const { file_path, client_id } = params;

  const content = fs.readFileSync(file_path, 'utf-8');
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    return {
      imported_count: 0,
      skipped_count: 0,
      date_range: { from: '', to: '' },
      errors: [{ row: 0, reason: 'File is empty or has no data rows' }],
      recipe: 'data-table',
    };
  }

  const headers = parseCSVLine(lines[0]);
  const format = detectNSEFormat(headers);

  if (!format) {
    return {
      imported_count: 0,
      skipped_count: 0,
      date_range: { from: '', to: '' },
      errors: [{ row: 1, reason: 'Unrecognised NSE CSV format — headers do not match any known format' }],
      recipe: 'data-table',
    };
  }

  const colIdx: Record<string, number> = {};
  headers.forEach((h, i) => { colIdx[h.trim()] = i; });

  const transactions: ParsedNSETxn[] = [];
  const errors: ImportError[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    try {
      const status = fields[colIdx[format.status]] ?? '';
      if (status && !isCompletedStatus(status)) {
        continue; // Skip non-completed orders
      }

      const scheme_code = (fields[colIdx[format.scheme_code]] ?? '').trim();
      const amount = Number(fields[colIdx[format.amount]]);
      const units = Number(fields[colIdx[format.units]]);
      const nav = Number(fields[colIdx[format.nav]] ?? 0);

      if (!scheme_code || isNaN(amount) || isNaN(units)) {
        errors.push({ row: i + 1, reason: 'Missing or invalid scheme_code/amount/units' });
        continue;
      }

      transactions.push({
        scheme_code,
        scheme_name: (fields[colIdx[format.scheme_name]] ?? '').trim(),
        txn_date: normaliseDate((fields[colIdx[format.order_date]] ?? '').trim()),
        txn_type: normaliseTxnType(fields[colIdx[format.txn_type]] ?? 'purchase'),
        amount: Math.abs(amount),
        units: Math.abs(units),
        nav,
      });
    } catch {
      errors.push({ row: i + 1, reason: 'Failed to parse row' });
    }
  }

  // Compute date range
  const dates = transactions.map((t) => t.txn_date).filter(Boolean).sort();
  const dateRange = {
    from: dates[0] ?? '',
    to: dates[dates.length - 1] ?? '',
  };

  // DB transaction
  let importedCount = 0;
  let skippedCount = 0;

  await ctx.db.query('BEGIN');
  try {
    for (const txn of transactions) {
      const result = await ctx.db.query<InsertResult>(INSERT_TXN_SQL, {
        $tenant_id: ctx.tenant_id,
        $client_id: client_id,
        $scheme_code: txn.scheme_code,
        $txn_date: txn.txn_date,
        $txn_type: txn.txn_type,
        $amount: txn.amount,
        $units: txn.units,
        $nav: txn.nav,
        $description: `NSE import: ${txn.scheme_name}`,
        $source: 'nse',
      });

      if (result.rows.length > 0) {
        importedCount++;
      } else {
        skippedCount++;
      }
    }
    await ctx.db.query('COMMIT');
  } catch (err) {
    await ctx.db.query('ROLLBACK');
    return {
      imported_count: 0,
      skipped_count: 0,
      date_range: dateRange,
      errors: [{ row: 0, reason: `Transaction rolled back: ${String(err)}` }],
      recipe: 'data-table',
    };
  }

  // Log import
  await ctx.db.query(INSERT_LOG_SQL, {
    $tenant_id: ctx.tenant_id,
    $source: 'nse',
    $file_name: path.basename(file_path),
    $client_id: client_id,
    $imported_count: importedCount,
    $skipped_count: skippedCount,
    $error_count: errors.length,
    $details: JSON.stringify({ date_range: dateRange }),
  });

  return {
    imported_count: importedCount,
    skipped_count: skippedCount,
    date_range: dateRange,
    errors,
    recipe: 'data-table',
  };
}
