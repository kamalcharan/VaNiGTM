/**
 * KI-Prime — Customer Import Pre-processor
 *
 * Handles Phase 1 field mapping for customer/contact imports.
 * Applied before staging: normalises mobile numbers, converts numeric
 * fields to strings, trims whitespace.
 *
 * Actual validation and DB writes are done by the PostgreSQL RPC function
 * process_single_customer_record (migration 036).
 *
 * Key design decisions:
 *   - externalid is THE primary identifier; dedup is based only on this.
 *   - Minors intentionally share parent PAN/email/mobile — NOT used for dedup.
 *   - family_head_externalid links members to their head (same as kewalinvest).
 *   - Three address lines are supported (ADDRESS1, ADDRESS2, ADDRESS3);
 *     ADDRESS3 is stored in address_line3 and combined with address_line2 in the DB function.
 */

/**
 * Default field mapping: Excel column header → mapped_data key.
 * Matches the IWELL customer export format (migration 036 DB function expects these keys).
 */
export const CUSTOMER_FIELD_MAP: Record<string, string> = {
  // Identity
  'TITLE':                      'prefix',
  'NAME':                       'name',
  'PAN':                        'pan',

  // Platform reference — THE primary identifier
  'IWELL CODE':                 'externalid',
  'IWELL_CODE':                 'externalid',
  'EXTERNAL ID':                'externalid',
  'EXTERNAL_ID':                'externalid',
  'EXTERNALID':                 'externalid',
  'CLIENT CODE':                'externalid',
  'CLIENT_CODE':                'externalid',
  'CAMS CODE':                  'externalid',
  'KFINTECH CODE':              'externalid',
  'BSE CODE':                   'externalid',

  // Channels
  'EMAIL':                      'email',
  'MOBILE':                     'mobile',
  'MOBILE NO':                  'mobile',
  'MOBILE NUMBER':              'mobile',
  'PHONE':                      'mobile',

  // Dates (DD-MM-YYYY from IWELL; DB function handles parsing)
  'DATE OF BIRTH':              'date_of_birth',
  'DOB':                        'date_of_birth',
  'ANNIVERSARY':                'anniversary_date',
  'ANNIVERSARY DATE':           'anniversary_date',

  // Family linkage
  'FAMILY HEAD':                'family_head_name',
  'FAMILY HEAD NAME':           'family_head_name',
  'FAMILY HEAD IWELL CODE':     'family_head_externalid',
  'FAMILY HEAD EXTERNAL ID':    'family_head_externalid',
  'FAMILY HEAD CODE':           'family_head_externalid',

  // Referral
  'Referred By':                'referred_by_name',
  'REFERRED BY':                'referred_by_name',
  'REFERRAL':                   'referred_by_name',

  // Address
  'ADDRESS1':                   'address_line1',
  'ADDRESS 1':                  'address_line1',
  'ADDRESS LINE 1':             'address_line1',
  'ADDRESS2':                   'address_line2',
  'ADDRESS 2':                  'address_line2',
  'ADDRESS LINE 2':             'address_line2',
  'ADDRESS3':                   'address_line3',
  'ADDRESS 3':                  'address_line3',
  'ADDRESS LINE 3':             'address_line3',
  'CITY':                       'city',
  'STATE':                      'state',
  'Country':                    'country',
  'COUNTRY':                    'country',
  'PIN':                        'pincode',
  'PINCODE':                    'pincode',
  'PIN CODE':                   'pincode',
  'ZIP':                        'pincode',
};

/**
 * Normalise a mobile number string:
 *   "+919030675548" → "9030675548"   (strip +91, 13 chars → 10)
 *   "919030675548"  → "9030675548"   (strip 91,  12 chars → 10)
 *   "9030675548"    → "9030675548"   (already clean)
 *   9030675548      → "9030675548"   (numeric from Excel)
 */
function normaliseMobile(val: any): string {
  if (val === undefined || val === null) return '';
  let s = String(val).trim().replace(/\s/g, '');
  if (s === '') return '';

  // Excel often parses long mobile numbers in scientific notation e.g. 9.03067E+9
  // Convert via parseFloat → toFixed to get full number string
  if (s.includes('E') || s.includes('e')) {
    const n = parseFloat(s);
    if (!isNaN(n)) s = Math.round(n).toString();
  }

  if (s.startsWith('+91') && s.length === 13) return s.slice(3);
  if (s.startsWith('91') && s.length === 12) return s.slice(2);
  return s;
}

/**
 * Apply field mapping + pre-processing to a raw Excel row for customer import.
 *
 * Pre-processing steps:
 *   - externalid: convert to string (Excel stores as number), uppercase
 *   - pan: uppercase
 *   - email: lowercase
 *   - mobile: normalise (strip country code)
 *   - pincode: convert to string (Excel parses as number)
 *   - family_head_externalid: convert to string, uppercase
 *   - All string values: trim whitespace
 *   - Empty strings become absent keys (no key in mapped output)
 */
export function mapCustomerRow(
  raw: Record<string, any>,
  mappings: Record<string, string>,
): Record<string, any> {
  const mapped: Record<string, any> = {};

  for (const [excelCol, dbField] of Object.entries(mappings)) {
    const val = raw[excelCol];
    if (val === undefined || val === null || val === '') continue;

    let processed: any = val;

    switch (dbField) {
      case 'externalid':
      case 'family_head_externalid': {
        // May come in as a number (407924), convert to string
        const s = String(val).trim();
        if (s === '') continue;
        processed = s.toUpperCase();
        break;
      }
      case 'pan': {
        processed = String(val).trim().toUpperCase();
        if (!processed) continue;
        break;
      }
      case 'email': {
        processed = String(val).trim().toLowerCase();
        if (!processed) continue;
        break;
      }
      case 'mobile': {
        processed = normaliseMobile(val);
        if (!processed) continue;
        break;
      }
      case 'pincode': {
        // Excel often parses 500004 as number → string
        const s = String(val).trim().replace(/\.0+$/, ''); // remove ".0" suffix
        if (!s) continue;
        processed = s;
        break;
      }
      case 'prefix': {
        processed = String(val).trim();
        if (!processed) continue;
        break;
      }
      case 'date_of_birth':
      case 'anniversary_date': {
        // Pass through as string; DB function handles multi-format parsing
        if (val instanceof Date) {
          // xlsx with cellDates:true returns Date objects; format as DD-MM-YYYY
          const d = val as Date;
          const dd = String(d.getDate()).padStart(2, '0');
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const yyyy = d.getFullYear();
          processed = `${dd}-${mm}-${yyyy}`;
        } else {
          processed = String(val).trim();
        }
        if (!processed) continue;
        break;
      }
      default: {
        // Generic: trim strings
        processed = typeof val === 'string' ? val.trim() : val;
        if (processed === '') continue;
        break;
      }
    }

    mapped[dbField] = processed;
  }

  return mapped;
}
