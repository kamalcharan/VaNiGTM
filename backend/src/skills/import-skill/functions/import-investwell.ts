/**
 * KI-30: import_investwell — Parse InvestWell CSV export and import transactions
 *
 * Handles 3 common InvestWell CSV formats:
 *   Format A: scheme_code, scheme_name, txn_date, txn_type, amount, units, nav
 *   Format B: Scheme Code, Scheme Name, Date, Type, Amount, Units, NAV, Folio
 *   Format C: SCHEME_CODE, SCHEME, TXN_DATE, TXN_TYPE, AMOUNT, UNITS, NAV, FOLIO, CLIENT_ID
 *
 * Idempotent via ON CONFLICT DO NOTHING on dedup index.
 */

import { SkillContext } from '../../../shared/types';
import * as fs from 'fs';
import * as path from 'path';

/* ── row types ─────────────────────────────────────────── */

interface ParsedTransaction {
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

interface ImportInvestwellResult {
  imported_count: number;
  skipped_count: number;
  errors: ImportError[];
  client_id: number;
  holdings_summary: { schemes: number; total_value: number };
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

/* ── column mappings for the 3 InvestWell formats ──────── */

interface ColumnMap {
  scheme_code: string;
  scheme_name: string;
  txn_date: string;
  txn_type: string;
  amount: string;
  units: string;
  nav: string;
  client_id?: string;
}

const FORMAT_A: ColumnMap = {
  scheme_code: 'scheme_code',
  scheme_name: 'scheme_name',
  txn_date: 'txn_date',
  txn_type: 'txn_type',
  amount: 'amount',
  units: 'units',
  nav: 'nav',
};

const FORMAT_B: ColumnMap = {
  scheme_code: 'Scheme Code',
  scheme_name: 'Scheme Name',
  txn_date: 'Date',
  txn_type: 'Type',
  amount: 'Amount',
  units: 'Units',
  nav: 'NAV',
};

const FORMAT_C: ColumnMap = {
  scheme_code: 'SCHEME_CODE',
  scheme_name: 'SCHEME',
  txn_date: 'TXN_DATE',
  txn_type: 'TXN_TYPE',
  amount: 'AMOUNT',
  units: 'UNITS',
  nav: 'NAV',
  client_id: 'CLIENT_ID',
};

const FORMATS = [FORMAT_A, FORMAT_B, FORMAT_C];

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

function detectFormat(headers: string[]): ColumnMap | null {
  const headerSet = new Set(headers.map((h) => h.trim()));
  for (const fmt of FORMATS) {
    const required = [fmt.scheme_code, fmt.txn_date, fmt.amount, fmt.units];
    if (required.every((col) => headerSet.has(col))) return fmt;
  }
  return null;
}

function normaliseTxnType(raw: string): string {
  const lower = raw.toLowerCase().trim();
  const map: Record<string, string> = {
    purchase: 'purchase',
    buy: 'purchase',
    sip: 'sip',
    'sip purchase': 'sip',
    redemption: 'redemption',
    sell: 'redemption',
    switch_in: 'switch_in',
    'switch in': 'switch_in',
    switch_out: 'switch_out',
    'switch out': 'switch_out',
    dividend: 'dividend_reinvest',
    'dividend reinvest': 'dividend_reinvest',
    'div reinvest': 'dividend_reinvest',
  };
  return map[lower] ?? 'purchase';
}

function normaliseDate(raw: string): string {
  // Accept dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd
  const slash = raw.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (slash) return `${slash[3]}-${slash[2]}-${slash[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return raw;
}

/* ── main function ─────────────────────────────────────── */

export async function import_investwell(
  params: { file_path: string; client_id?: number },
  ctx: SkillContext
): Promise<ImportInvestwellResult> {
  const { file_path } = params;

  const content = fs.readFileSync(file_path, 'utf-8');
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    return {
      imported_count: 0,
      skipped_count: 0,
      errors: [{ row: 0, reason: 'File is empty or has no data rows' }],
      client_id: params.client_id ?? 0,
      holdings_summary: { schemes: 0, total_value: 0 },
      recipe: 'data-table',
    };
  }

  const headers = parseCSVLine(lines[0]);
  const format = detectFormat(headers);

  if (!format) {
    return {
      imported_count: 0,
      skipped_count: 0,
      errors: [{ row: 1, reason: 'Unrecognised InvestWell CSV format — headers do not match any known format' }],
      client_id: params.client_id ?? 0,
      holdings_summary: { schemes: 0, total_value: 0 },
      recipe: 'data-table',
    };
  }

  // Build column-index lookup
  const colIdx: Record<string, number> = {};
  headers.forEach((h, i) => { colIdx[h.trim()] = i; });

  // Parse rows
  const transactions: ParsedTransaction[] = [];
  const errors: ImportError[] = [];
  let detectedClientId = params.client_id ?? 0;

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    try {
      const scheme_code = fields[colIdx[format.scheme_code]] ?? '';
      const amount = Number(fields[colIdx[format.amount]]);
      const units = Number(fields[colIdx[format.units]]);
      const nav = Number(fields[colIdx[format.nav]] ?? 0);

      if (!scheme_code || isNaN(amount) || isNaN(units)) {
        errors.push({ row: i + 1, reason: 'Missing or invalid scheme_code/amount/units' });
        continue;
      }

      // Auto-detect client_id from Format C if not provided
      if (!params.client_id && format.client_id && colIdx[format.client_id] !== undefined) {
        const cid = Number(fields[colIdx[format.client_id]]);
        if (!isNaN(cid) && cid > 0) detectedClientId = cid;
      }

      transactions.push({
        scheme_code: scheme_code.trim(),
        scheme_name: (fields[colIdx[format.scheme_name]] ?? '').trim(),
        txn_date: normaliseDate((fields[colIdx[format.txn_date]] ?? '').trim()),
        txn_type: normaliseTxnType(fields[colIdx[format.txn_type]] ?? 'purchase'),
        amount: Math.abs(amount),
        units: Math.abs(units),
        nav,
      });
    } catch {
      errors.push({ row: i + 1, reason: 'Failed to parse row' });
    }
  }

  const clientId = detectedClientId;
  let importedCount = 0;
  let skippedCount = 0;

  try {
    ({ importedCount, skippedCount } = await ctx.db.transaction(async (tx) => {
      let imported = 0;
      let skipped  = 0;
      for (const txn of transactions) {
        const result = await tx.query<InsertResult>(INSERT_TXN_SQL, {
          $tenant_id:   ctx.tenant_id,
          $client_id:   clientId,
          $scheme_code: txn.scheme_code,
          $txn_date:    txn.txn_date,
          $txn_type:    txn.txn_type,
          $amount:      txn.amount,
          $units:       txn.units,
          $nav:         txn.nav,
          $description: `InvestWell import: ${txn.scheme_name}`,
          $source:      'investwell',
        });
        if (result.rows.length > 0) imported++;
        else                        skipped++;
      }
      return { importedCount: imported, skippedCount: skipped };
    }));
  } catch (err) {
    return {
      imported_count: 0,
      skipped_count: 0,
      errors: [{ row: 0, reason: `Transaction rolled back: ${String(err)}` }],
      client_id: clientId,
      holdings_summary: { schemes: 0, total_value: 0 },
      recipe: 'data-table',
    };
  }

  // Compute holdings summary from imported transactions
  const schemes = new Set(transactions.map((t) => t.scheme_code));
  const totalValue = transactions
    .filter((t) => ['purchase', 'sip', 'switch_in', 'dividend_reinvest'].includes(t.txn_type))
    .reduce((sum, t) => sum + t.amount, 0);

  // Log the import
  await ctx.db.query(INSERT_LOG_SQL, {
    $tenant_id: ctx.tenant_id,
    $source: 'investwell',
    $file_name: path.basename(file_path),
    $client_id: clientId,
    $imported_count: importedCount,
    $skipped_count: skippedCount,
    $error_count: errors.length,
    $details: JSON.stringify({ format: Object.values(format)[0], total_rows: transactions.length }),
  });

  return {
    imported_count: importedCount,
    skipped_count: skippedCount,
    errors,
    client_id: clientId,
    holdings_summary: { schemes: schemes.size, total_value: totalValue },
    recipe: 'data-table',
  };
}
