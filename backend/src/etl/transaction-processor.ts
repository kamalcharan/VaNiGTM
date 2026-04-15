/**
 * KI-Prime — Transaction Import Pre-processor
 *
 * Handles Phase 1 field mapping for transaction imports (Tbook / InvestWell format).
 * Applied before staging: normalises dates, converts numeric fields, trims whitespace.
 *
 * Actual client lookup, dedup, holdings UPSERT and DB writes are done by
 * ki_process_txn_import_session() (migration 045).
 *
 * Key design decisions:
 *   - vendor_code is THE primary client identifier. Any platform-specific column
 *     header (IWELL CODE, CAMS CODE, CLIENT CODE …) maps to the canonical
 *     `vendor_code` field used by the RPC's 3-step client lookup chain:
 *       vendor_code → PAN → normalized_name.
 *   - The tenant's platform type (IWELL/CAMS/etc.) lives on
 *     vn_tenants.ext_ref_type_code — no column needed in the import file itself.
 *   - txn_code is stored as-is (uppercased); ki_transaction_types.txn_code
 *     is the master reference used by the RPC for lookup.
 *   - Dates: Excel Date objects → ISO string YYYY-MM-DD; string variants normalised.
 *   - amount / units: sign-stripped (flow_direction derived from txn_type by the RPC).
 */

/**
 * Default field mapping: Excel column header → mapped_data key.
 *
 * Covers all known InvestWell (Tbook.xlsx) column headers plus common variants
 * from CAMS, KFintech, and custom export formats.
 *
 * The RPC (migration 045) reads these canonical keys from mapped_data JSONB:
 *   vendor_code, pan, customer_name, scheme_name, txn_code, txn_date,
 *   amount, units, nav, folio_number, arn_code, euin, stamp_duty, stt,
 *   tds, sip_reg_date, fund_name, category, description
 */
export const TRANSACTION_FIELD_MAP: Record<string, string> = {
  // ── Primary client identifier ─────────────────────────────────────────────
  // All vendor platform columns map to vendor_code.
  // RPC matches vendor_code → ki_clients.ext_ref_id.
  'IWELL CODE':         'vendor_code',
  'IWELL_CODE':         'vendor_code',
  'CLIENT CODE':        'vendor_code',
  'CLIENT_CODE':        'vendor_code',
  'CAMS CODE':          'vendor_code',
  'KFINTECH CODE':      'vendor_code',
  'BSE CODE':           'vendor_code',
  'VENDOR CODE':        'vendor_code',
  'VENDOR_CODE':        'vendor_code',
  'EXTERNAL ID':        'vendor_code',
  'EXTERNAL_ID':        'vendor_code',
  'EXTERNALID':         'vendor_code',

  // ── Client identity fallbacks ─────────────────────────────────────────────
  'APPLICANT':          'customer_name',
  'CLIENT NAME':        'customer_name',
  'CUSTOMER NAME':      'customer_name',
  'NAME':               'customer_name',
  'PAN':                'pan',

  // ── Scheme ───────────────────────────────────────────────────────────────
  'SCHEME NAME':        'scheme_name',
  'SCHEME':             'scheme_name',
  'FUND NAME':          'fund_name',
  'CATEGORY':           'category',

  // ── Transaction core ─────────────────────────────────────────────────────
  'TXN TYPE':           'txn_code',
  'TRANSACTION TYPE':   'txn_code',
  'TXN_TYPE':           'txn_code',
  'TYPE':               'txn_code',

  'TRANSACTION DATE':   'txn_date',
  'TXN DATE':           'txn_date',
  'TXN_DATE':           'txn_date',
  'DATE':               'txn_date',

  'TOTAL AMOUNT':       'amount',
  'AMOUNT':             'amount',
  'UNITS':              'units',
  'NAV':                'nav',

  // ── Optional / audit fields ───────────────────────────────────────────────
  'FOLIO NO':           'folio_number',
  'FOLIO NUMBER':       'folio_number',
  'FOLIO_NO':           'folio_number',
  'FOLIO':              'folio_number',
  'ARN NO':             'arn_code',
  'ARN':                'arn_code',
  'EUIN':               'euin',
  'STAMP DUTY':         'stamp_duty',
  'STAMP_DUTY':         'stamp_duty',
  'STT':                'stt',
  'TDS':                'tds',
  'SIP REG DATE':       'sip_reg_date',
  'SIP_REG_DATE':       'sip_reg_date',
  'TXN DESCRIPTION':    'description',
  'DESCRIPTION':        'description',
};

/* ── Helpers ─────────────────────────────────────────── */

/**
 * Normalise a date value to ISO string YYYY-MM-DD.
 * Handles Excel Date objects, DD-MM-YYYY, DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD.
 */
function normaliseDate(val: any): string {
  if (!val && val !== 0) return '';

  // Excel cellDates:true returns Date objects
  if (val instanceof Date) {
    const yyyy = val.getFullYear();
    const mm   = String(val.getMonth() + 1).padStart(2, '0');
    const dd   = String(val.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  const s = String(val).trim();
  if (!s) return '';

  // Already ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD-MM-YYYY or DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;

  // MM/DD/YYYY (US format — less common but possible)
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;

  return s; // Pass through; DB will surface a parse error if invalid
}

/**
 * Normalise a numeric value to a clean string for DB NUMERIC cast.
 * Handles Excel scientific notation, comma-separated thousands, sign characters.
 */
function normaliseNumeric(val: any): string {
  if (val === undefined || val === null || val === '') return '';

  // Already a number (Excel parsed it)
  if (typeof val === 'number') {
    return String(Math.abs(val));
  }

  let s = String(val).trim();

  // Scientific notation (e.g. "1.234E+7" from Excel)
  if (/[eE]/.test(s)) {
    const n = parseFloat(s);
    if (!isNaN(n)) s = Math.abs(n).toFixed(10).replace(/\.?0+$/, '');
  }

  // Strip sign, commas
  s = s.replace(/^[+-]/, '').replace(/,/g, '').trim();
  return s || '';
}

/* ── Row mapper ──────────────────────────────────────── */

/**
 * Apply field mapping + pre-processing to a raw Excel row for transaction import.
 *
 * Pre-processing steps:
 *   - vendor_code: string, uppercase (Excel may store as number)
 *   - pan:         string, uppercase
 *   - txn_code:    string, uppercase (matched against ki_transaction_types.txn_code)
 *   - txn_date:    normalised to YYYY-MM-DD
 *   - sip_reg_date: normalised to YYYY-MM-DD
 *   - amount / units / nav / stamp_duty / stt / tds: sign-stripped numeric strings
 *   - folio_number: converted to string (Excel parses as number)
 *   - All other strings: trimmed; empty strings → absent keys
 */
export function mapTransactionRow(
  raw: Record<string, any>,
  mappings: Record<string, string>,
): Record<string, any> {
  const mapped: Record<string, any> = {};

  for (const [excelCol, dbField] of Object.entries(mappings)) {
    const val = raw[excelCol];
    if (val === undefined || val === null || val === '') continue;

    let processed: any;

    switch (dbField) {
      case 'vendor_code':
      case 'pan': {
        const s = String(val).trim();
        if (!s) continue;
        processed = s.toUpperCase();
        break;
      }
      case 'txn_code': {
        const s = String(val).trim();
        if (!s) continue;
        processed = s.toUpperCase();
        break;
      }
      case 'txn_date':
      case 'sip_reg_date': {
        processed = normaliseDate(val);
        if (!processed) continue;
        break;
      }
      case 'amount':
      case 'units':
      case 'nav':
      case 'stamp_duty':
      case 'stt':
      case 'tds': {
        processed = normaliseNumeric(val);
        if (!processed) continue;
        break;
      }
      case 'folio_number': {
        // Excel parses folios like "12345678" as numbers
        const s = String(val).trim().replace(/\.0+$/, '');
        if (!s) continue;
        processed = s;
        break;
      }
      default: {
        // Generic string fields: trim
        processed = typeof val === 'string' ? val.trim() : val;
        if (processed === '') continue;
        break;
      }
    }

    mapped[dbField] = processed;
  }

  return mapped;
}
