/**
 * KI-Prime — Scheme Master Processor
 *
 * Processes a single mapped row from SchemeMaster Excel into ki_schemes.
 * Handles ISIN splitting, date parsing, and upsert (ON CONFLICT DO UPDATE).
 */

import type { Pool } from 'pg';

/**
 * Default field mapping: Excel column → ki_schemes column.
 * Auto-suggested when import_type = 'scheme'.
 */
export const SCHEME_FIELD_MAP: Record<string, string> = {
  'AMC': 'amc',
  'Code': 'scheme_code',
  'Scheme Name': 'scheme_name',
  'Scheme Type': 'scheme_type',
  'Scheme Category': 'category',
  'Scheme NAV Name': 'nav_name',
  'Scheme Minimum Amount': 'min_amount',
  'Launch Date': 'launch_date',
  ' Closure Date': 'closure_date',    // Note: leading space in Excel header
  'Closure Date': 'closure_date',
  'ISIN Div Payout/ ISIN GrowthISIN Div Reinvestment': 'isin_raw',
};

interface ProcessResult {
  status: 'success' | 'duplicate';
  scheme_code: string;
}

/**
 * Split concatenated ISIN string into individual ISINs.
 * ISINs are 12 chars, start with "INF" (Indian MF) or "IN" (others).
 * Example: "INF209K01157INF209K01CE5" → ["INF209K01157", "INF209K01CE5"]
 */
function splitISINs(raw: string): string[] {
  if (!raw || typeof raw !== 'string') return [];
  const cleaned = raw.replace(/\s/g, '').toUpperCase();
  const isins: string[] = [];

  // Split by known ISIN prefix pattern (INF or IN followed by alphanum)
  const matches = cleaned.match(/IN[A-Z0-9]{10}/g);
  if (matches) return matches;

  // Fallback: if single ISIN
  if (cleaned.length === 12 && cleaned.startsWith('IN')) return [cleaned];

  return cleaned ? [cleaned] : [];
}

/**
 * Parse a date value — handles Date objects (from xlsx), strings in multiple formats.
 */
function parseDate(val: any): string | null {
  if (!val) return null;

  // xlsx with cellDates:true returns Date objects
  if (val instanceof Date) {
    return val.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  const s = String(val).trim();
  if (!s) return null;

  // Try YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Try DD-MM-YYYY or DD/MM/YYYY
  const dmy = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;

  // Try MM-DD-YYYY
  const mdy = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1]}-${mdy[2]}`;

  return null;
}

/**
 * Map scheme_type from Excel to ki_schemes CHECK constraint values.
 */
function normalizeSchemeType(raw: string): string {
  const lower = (raw || '').toLowerCase().trim();
  if (lower.includes('open')) return 'open';
  if (lower.includes('close')) return 'close';
  if (lower.includes('interval')) return 'interval';
  return 'open'; // default
}

/**
 * Process a single scheme row — upsert into ki_schemes.
 */
export async function processSchemeRow(
  pool: Pool,
  mapped: Record<string, any>,
): Promise<ProcessResult> {
  const schemeCode = String(mapped.scheme_code || '').trim();
  if (!schemeCode) throw new Error('scheme_code is required');

  const schemeName = String(mapped.scheme_name || '').trim();
  if (!schemeName) throw new Error('scheme_name is required');

  const amc = String(mapped.amc || '').trim();
  const category = String(mapped.category || '').trim();
  const schemeType = normalizeSchemeType(String(mapped.scheme_type || ''));
  const navName = String(mapped.nav_name || '').trim() || null;
  const minAmount = mapped.min_amount ? Number(mapped.min_amount) : null;
  const launchDate = parseDate(mapped.launch_date);
  const closureDate = parseDate(mapped.closure_date);

  // Split ISINs from the concatenated field
  const isinRaw = String(mapped.isin_raw || '').trim();
  const isins = splitISINs(isinRaw);
  const isinGrowth = isins[0] || null;
  const isinDividend = isins[1] || null;
  const isinReinvestment = isins[2] || null;

  // Check if exists
  const existing = await pool.query(
    'SELECT scheme_code FROM ki_schemes WHERE scheme_code = $1',
    [schemeCode],
  );

  if (existing.rows.length > 0) {
    // UPDATE existing
    await pool.query(
      `UPDATE ki_schemes SET
        scheme_name = COALESCE(NULLIF($1, ''), scheme_name),
        amc = COALESCE(NULLIF($2, ''), amc),
        category = COALESCE(NULLIF($3, ''), category),
        scheme_type = $4,
        nav_name = COALESCE($5, nav_name),
        min_amount = COALESCE($6, min_amount),
        launch_date = COALESCE($7::date, launch_date),
        closure_date = COALESCE($8::date, closure_date),
        isin_growth = COALESCE(NULLIF($9, ''), isin_growth),
        isin_dividend = COALESCE(NULLIF($10, ''), isin_dividend),
        isin_reinvestment = COALESCE(NULLIF($11, ''), isin_reinvestment),
        updated_at = now()
      WHERE scheme_code = $12`,
      [schemeName, amc, category, schemeType, navName, minAmount, launchDate, closureDate, isinGrowth, isinDividend, isinReinvestment, schemeCode],
    );

    return { status: 'duplicate', scheme_code: schemeCode };
  }

  // INSERT new
  await pool.query(
    `INSERT INTO ki_schemes (scheme_code, scheme_name, amc, category, scheme_type, nav_name, min_amount, launch_date, closure_date, isin_growth, isin_dividend, isin_reinvestment)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::date, $10, $11, $12)`,
    [schemeCode, schemeName, amc, category, schemeType, navName, minAmount, launchDate, closureDate, isinGrowth, isinDividend, isinReinvestment],
  );

  return { status: 'success', scheme_code: schemeCode };
}
