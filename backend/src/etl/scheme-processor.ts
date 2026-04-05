/**
 * KI-Prime — Scheme Master Pre-processor
 *
 * Pre-processes mapped data BEFORE staging: ISIN splitting, date formatting.
 * Actual processing (upsert into ki_schemes) is done by the PostgreSQL
 * RPC function process_single_scheme_record.
 */

/**
 * Default field mapping: Excel column → mapped_data key.
 * These keys match what the DB function expects in mapped_data JSONB.
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

/**
 * Split concatenated ISIN string into individual ISINs.
 * ISINs are 12 chars, start with "INF" (Indian MF) or "IN" (others).
 * Example: "INF209K01157INF209K01CE5" → ["INF209K01157", "INF209K01CE5"]
 */
function splitISINs(raw: string): string[] {
  if (!raw || typeof raw !== 'string') return [];
  const cleaned = raw.replace(/\s/g, '').toUpperCase();

  // Split by known ISIN prefix pattern (12-char INF/IN codes)
  const matches = cleaned.match(/IN[A-Z0-9]{10}/g);
  if (matches) return matches;

  // Fallback: single ISIN
  if (cleaned.length === 12 && cleaned.startsWith('IN')) return [cleaned];

  return cleaned ? [cleaned] : [];
}

/**
 * Format a date value for PostgreSQL. xlsx with cellDates:true returns Date objects.
 * Returns ISO string (YYYY-MM-DD) or the raw string for DB-side parsing.
 */
function formatDate(val: any): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().split('T')[0];
  const s = String(val).trim();
  return s || null;
}

/**
 * Apply field mapping + pre-processing to a raw Excel row.
 * ISIN splitting and date formatting happen here (Node.js side).
 * Everything else (type normalization, upsert, error handling) happens in DB.
 */
export function mapSchemeRow(
  raw: Record<string, any>,
  mappings: Record<string, string>,
): Record<string, any> {
  const mapped: Record<string, any> = {};

  for (const [excelCol, dbField] of Object.entries(mappings)) {
    const val = raw[excelCol];
    if (val === undefined || val === null || val === '') continue;
    mapped[dbField] = val;
  }

  // ISIN splitting: split the concatenated field into 3 separate ISINs
  if (mapped.isin_raw) {
    const isins = splitISINs(String(mapped.isin_raw));
    mapped.isin_growth = isins[0] || null;
    mapped.isin_dividend = isins[1] || null;
    mapped.isin_reinvestment = isins[2] || null;
    delete mapped.isin_raw;
  }

  // Convert scheme_code to string (Excel may parse as number)
  if (mapped.scheme_code !== undefined) {
    mapped.scheme_code = String(mapped.scheme_code).trim();
  }

  // Format dates for DB-side parsing
  if (mapped.launch_date) mapped.launch_date = formatDate(mapped.launch_date);
  if (mapped.closure_date) mapped.closure_date = formatDate(mapped.closure_date);

  // Format min_amount (remove commas, ensure string for DB cast)
  if (mapped.min_amount !== undefined) {
    mapped.min_amount = String(mapped.min_amount).replace(/,/g, '').trim();
  }

  return mapped;
}
