/**
 * KI-30: import_cas — Parse CAMS/Karvy CAS statement PDF
 *
 * Extracts transactions and a holdings snapshot from a Consolidated Account
 * Statement PDF. Handles password-protected PDFs (password is typically the PAN).
 *
 * CAS format sections parsed:
 *   - Folio / scheme header lines
 *   - Transaction rows (date, description, amount, units, nav, balance)
 *   - Valuation summary (closing balance per scheme)
 *
 * Idempotent via ON CONFLICT DO NOTHING on dedup index.
 */

import { SkillContext } from '../../../shared/types';
import * as fs from 'fs';
import * as path from 'path';

/* ── types ─────────────────────────────────────────────── */

interface CASTransaction {
  scheme_code: string;
  scheme_name: string;
  folio: string;
  txn_date: string;
  txn_type: string;
  amount: number;
  units: number;
  nav: number;
}

interface CASHolding {
  scheme_code: string;
  scheme_name: string;
  units: number;
  nav: number;
  value: number;
}

interface ImportError {
  reason: string;
}

interface InsertResult {
  id?: number;
}

interface ImportCASResult {
  imported_count: number;
  clients_found: number;
  transactions_imported: number;
  holdings_snapshot: { schemes: number; total_value: number };
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

/* ── CAS parsing helpers ──────────────────────────────── */

// Regex patterns for CAS PDF text extraction
const FOLIO_PATTERN = /Folio\s*(?:No\.?|:)\s*[:.]?\s*(\S+)/i;
const SCHEME_HEADER_PATTERN = /^(.+?)\s*[-–]\s*(.+?)(?:\s*\(Advisor|Registrar)/i;
const SCHEME_CODE_PATTERN = /\b(INF\w{6,})\b/;
const TXN_LINE_PATTERN = /^(\d{2}[-/]\w{3}[-/]\d{4})\s+(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{3,4})\s+([\d,]+\.\d{2,4})\s+([\d,]+\.\d{3,4})/;
const VALUATION_PATTERN = /Valuation\s+on\s+\d{2}[-/]\w{3}[-/]\d{4}\s*:\s*INR\s*([\d,.]+)/i;
const PAN_PATTERN = /PAN\s*:\s*([A-Z]{5}\d{4}[A-Z])/;

function parseCASDate(raw: string): string {
  // dd-Mon-yyyy → yyyy-mm-dd
  const months: Record<string, string> = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
  };
  const m = raw.match(/^(\d{2})[-/](\w{3})[-/](\d{4})$/);
  if (m) return `${m[3]}-${months[m[2]] ?? '01'}-${m[1]}`;
  return raw;
}

function parseAmount(raw: string): number {
  return Number(raw.replace(/,/g, ''));
}

function classifyTxnType(description: string): string {
  const lower = description.toLowerCase();
  if (lower.includes('systematic') || lower.includes('sip')) return 'sip';
  if (lower.includes('redemption') || lower.includes('redeem')) return 'redemption';
  if (lower.includes('switch in')) return 'switch_in';
  if (lower.includes('switch out')) return 'switch_out';
  if (lower.includes('dividend') && lower.includes('reinvest')) return 'dividend_reinvest';
  if (lower.includes('purchase') || lower.includes('buy')) return 'purchase';
  return 'purchase';
}

/**
 * Parse CAS text content into structured transactions and holdings.
 * In production, the text is extracted from PDF via pdf-parse / pdfjs-dist.
 * This function operates on the extracted text.
 */
export function parseCASText(text: string): {
  transactions: CASTransaction[];
  holdings: CASHolding[];
  clientPANs: Set<string>;
} {
  const transactions: CASTransaction[] = [];
  const holdings: CASHolding[] = [];
  const clientPANs = new Set<string>();

  const lines = text.split(/\r?\n/);
  let currentFolio = '';
  let currentSchemeCode = '';
  let currentSchemeName = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Detect PAN
    const panMatch = trimmed.match(PAN_PATTERN);
    if (panMatch) {
      clientPANs.add(panMatch[1]);
      continue;
    }

    // Detect folio
    const folioMatch = trimmed.match(FOLIO_PATTERN);
    if (folioMatch) {
      currentFolio = folioMatch[1];
      continue;
    }

    // Detect scheme header
    const schemeMatch = trimmed.match(SCHEME_HEADER_PATTERN);
    if (schemeMatch) {
      currentSchemeName = schemeMatch[1].trim();
      const codeMatch = trimmed.match(SCHEME_CODE_PATTERN);
      currentSchemeCode = codeMatch ? codeMatch[1] : currentSchemeName.substring(0, 10).replace(/\s/g, '_');
      continue;
    }

    // Detect scheme code standalone
    const codeOnlyMatch = trimmed.match(SCHEME_CODE_PATTERN);
    if (codeOnlyMatch && !currentSchemeCode) {
      currentSchemeCode = codeOnlyMatch[1];
    }

    // Detect transaction lines
    const txnMatch = trimmed.match(TXN_LINE_PATTERN);
    if (txnMatch && currentSchemeCode) {
      const amount = parseAmount(txnMatch[3]);
      const units = parseAmount(txnMatch[4]);
      const nav = parseAmount(txnMatch[5]);

      transactions.push({
        scheme_code: currentSchemeCode,
        scheme_name: currentSchemeName,
        folio: currentFolio,
        txn_date: parseCASDate(txnMatch[1]),
        txn_type: classifyTxnType(txnMatch[2]),
        amount,
        units,
        nav,
      });
      continue;
    }

    // Detect valuation / closing balance for holdings snapshot
    const valMatch = trimmed.match(VALUATION_PATTERN);
    if (valMatch && currentSchemeCode) {
      const value = parseAmount(valMatch[1]);
      // Use the last transaction's balance units if available
      const lastTxn = transactions.filter((t) => t.scheme_code === currentSchemeCode).pop();
      holdings.push({
        scheme_code: currentSchemeCode,
        scheme_name: currentSchemeName,
        units: lastTxn?.units ?? 0,
        nav: lastTxn?.nav ?? 0,
        value,
      });
    }
  }

  return { transactions, holdings, clientPANs };
}

/* ── main function ─────────────────────────────────────── */

export async function import_cas(
  params: { file_path: string; password?: string; client_id?: number },
  ctx: SkillContext
): Promise<ImportCASResult> {
  const { file_path, password } = params;
  const errors: ImportError[] = [];

  // Read PDF and extract text
  let text: string;
  try {
    // Attempt to use pdf-parse if available; fall back to raw buffer read
    // In production, pdf-parse handles the actual PDF→text conversion
    const pdfParse = await loadPdfParser();
    const buffer = fs.readFileSync(file_path);
    const pdfData = await pdfParse(buffer, { password: password ?? undefined });
    text = pdfData.text;
  } catch (err) {
    // If pdf-parse is not installed or PDF fails to open, check if the
    // file is plain text (for testing / pre-extracted CAS text files)
    try {
      text = fs.readFileSync(file_path, 'utf-8');
      if (text.startsWith('%PDF')) {
        return {
          imported_count: 0,
          clients_found: 0,
          transactions_imported: 0,
          holdings_snapshot: { schemes: 0, total_value: 0 },
          errors: [{ reason: `PDF parsing failed: ${String(err)}. Install pdf-parse for PDF support.` }],
          recipe: 'data-table',
        };
      }
    } catch {
      return {
        imported_count: 0,
        clients_found: 0,
        transactions_imported: 0,
        holdings_snapshot: { schemes: 0, total_value: 0 },
        errors: [{ reason: `Cannot read file: ${String(err)}` }],
        recipe: 'data-table',
      };
    }
  }

  const { transactions, holdings, clientPANs } = parseCASText(text);

  if (transactions.length === 0) {
    return {
      imported_count: 0,
      clients_found: clientPANs.size,
      transactions_imported: 0,
      holdings_snapshot: { schemes: 0, total_value: 0 },
      errors: [{ reason: 'No transactions found in CAS statement' }],
      recipe: 'data-table',
    };
  }

  const clientId = params.client_id ?? 0;
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
          $description: `CAS import: ${txn.scheme_name} (Folio: ${txn.folio})`,
          $source:      'cas',
        });
        if (result.rows.length > 0) imported++;
        else                        skipped++;
      }
      return { importedCount: imported, skippedCount: skipped };
    }));
  } catch (err) {
    return {
      imported_count: 0,
      clients_found: clientPANs.size,
      transactions_imported: 0,
      holdings_snapshot: { schemes: 0, total_value: 0 },
      errors: [{ reason: `Transaction rolled back: ${String(err)}` }],
      recipe: 'data-table',
    };
  }

  // Holdings snapshot
  const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);

  // Log import
  await ctx.db.query(INSERT_LOG_SQL, {
    $tenant_id: ctx.tenant_id,
    $source: 'cas',
    $file_name: path.basename(file_path),
    $client_id: clientId,
    $imported_count: importedCount,
    $skipped_count: skippedCount,
    $error_count: errors.length,
    $details: JSON.stringify({ pans: [...clientPANs], holdings_count: holdings.length }),
  });

  return {
    imported_count: importedCount + skippedCount,
    clients_found: clientPANs.size,
    transactions_imported: importedCount,
    holdings_snapshot: { schemes: holdings.length, total_value: totalValue },
    errors,
    recipe: 'data-table',
  };
}

/* ── pdf-parse loader (lazy, optional dependency) ──────── */

async function loadPdfParser(): Promise<(buffer: Buffer, options?: Record<string, unknown>) => Promise<{ text: string }>> {
  // Dynamic import so the module is optional
  const mod = await import('pdf-parse');
  return mod.default ?? mod;
}
