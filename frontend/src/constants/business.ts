/**
 * KI-Prime — Business Constants
 *
 * Business types, Indian states, and validation rules for MFD onboarding.
 */

/* ── Business Types ─────────────────────────────────── */

export interface BusinessType {
  value: string;
  label: string;
}

export const BUSINESS_TYPES: BusinessType[] = [
  { value: 'individual_mfd', label: 'Individual MFD' },
  { value: 'partnership', label: 'Partnership Firm' },
  { value: 'pvt_ltd', label: 'Private Limited' },
  { value: 'llp', label: 'LLP' },
  { value: 'proprietorship', label: 'Proprietorship' },
  { value: 'ria', label: 'Registered Investment Advisor (RIA)' },
  { value: 'ifa', label: 'Insurance Financial Advisor (IFA)' },
  { value: 'corporate', label: 'Corporate / Bank' },
];

/* ── Indian States ──────────────────────────────────── */

export interface IndianState {
  code: string;
  name: string;
  gstCode: string; // First 2 digits of GSTIN
}

export const INDIAN_STATES: IndianState[] = [
  { code: 'AN', name: 'Andaman & Nicobar', gstCode: '35' },
  { code: 'AP', name: 'Andhra Pradesh', gstCode: '37' },
  { code: 'AR', name: 'Arunachal Pradesh', gstCode: '12' },
  { code: 'AS', name: 'Assam', gstCode: '18' },
  { code: 'BR', name: 'Bihar', gstCode: '10' },
  { code: 'CH', name: 'Chandigarh', gstCode: '04' },
  { code: 'CG', name: 'Chhattisgarh', gstCode: '22' },
  { code: 'DD', name: 'Dadra & Nagar Haveli and Daman & Diu', gstCode: '26' },
  { code: 'DL', name: 'Delhi', gstCode: '07' },
  { code: 'GA', name: 'Goa', gstCode: '30' },
  { code: 'GJ', name: 'Gujarat', gstCode: '24' },
  { code: 'HR', name: 'Haryana', gstCode: '06' },
  { code: 'HP', name: 'Himachal Pradesh', gstCode: '02' },
  { code: 'JK', name: 'Jammu & Kashmir', gstCode: '01' },
  { code: 'JH', name: 'Jharkhand', gstCode: '20' },
  { code: 'KA', name: 'Karnataka', gstCode: '29' },
  { code: 'KL', name: 'Kerala', gstCode: '32' },
  { code: 'LA', name: 'Ladakh', gstCode: '38' },
  { code: 'MP', name: 'Madhya Pradesh', gstCode: '23' },
  { code: 'MH', name: 'Maharashtra', gstCode: '27' },
  { code: 'MN', name: 'Manipur', gstCode: '14' },
  { code: 'ML', name: 'Meghalaya', gstCode: '17' },
  { code: 'MZ', name: 'Mizoram', gstCode: '15' },
  { code: 'NL', name: 'Nagaland', gstCode: '13' },
  { code: 'OD', name: 'Odisha', gstCode: '21' },
  { code: 'PY', name: 'Puducherry', gstCode: '34' },
  { code: 'PB', name: 'Punjab', gstCode: '03' },
  { code: 'RJ', name: 'Rajasthan', gstCode: '08' },
  { code: 'SK', name: 'Sikkim', gstCode: '11' },
  { code: 'TN', name: 'Tamil Nadu', gstCode: '33' },
  { code: 'TS', name: 'Telangana', gstCode: '36' },
  { code: 'TR', name: 'Tripura', gstCode: '16' },
  { code: 'UP', name: 'Uttar Pradesh', gstCode: '09' },
  { code: 'UK', name: 'Uttarakhand', gstCode: '05' },
  { code: 'WB', name: 'West Bengal', gstCode: '19' },
];

/* ── PAN Validation ─────────────────────────────────── */

/**
 * Indian PAN format: ABCDE1234F
 * - 5 uppercase letters
 * - 4 digits
 * - 1 uppercase letter
 * - 4th char indicates entity type: P=Person, C=Company, H=HUF, F=Firm, etc.
 */
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function validatePAN(pan: string): string | null {
  if (!pan) return null; // Optional
  const cleaned = pan.toUpperCase().trim();
  if (!PAN_REGEX.test(cleaned)) {
    return 'Invalid PAN format (e.g. ABCDE1234F)';
  }
  return null;
}

/* ── GSTIN Validation ───────────────────────────────── */

/**
 * GSTIN format: 22AAAAA0000A1Z5
 * - 2 digits (state code)
 * - 10 chars (PAN)
 * - 1 digit (entity number)
 * - 1 char (Z default)
 * - 1 check digit
 *
 * PAN is embedded at positions 3-12.
 * If both PAN and GSTIN are provided, PAN must match GSTIN[2:12].
 */
export const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z\d][A-Z]\d$/;

export function validateGSTIN(gstin: string, pan?: string): string | null {
  if (!gstin) return null; // Optional
  const cleaned = gstin.toUpperCase().trim();
  if (!GSTIN_REGEX.test(cleaned)) {
    return 'Invalid GSTIN format (e.g. 22AAAAA0000A1Z5)';
  }
  // Cross-validate PAN if provided
  if (pan) {
    const gstinPan = cleaned.slice(2, 12);
    if (gstinPan !== pan.toUpperCase().trim()) {
      return 'GSTIN does not match PAN';
    }
  }
  return null;
}

/* ── ARN Validation ─────────────────────────────────── */

export const ARN_REGEX = /^ARN-?\d{4,6}$/i;

export function validateARN(arn: string): string | null {
  if (!arn) return null; // Optional
  if (!ARN_REGEX.test(arn.trim())) {
    return 'Invalid ARN format (e.g. ARN-12345)';
  }
  return null;
}

/* ── PIN Code Validation ────────────────────────────── */

export const PIN_REGEX = /^\d{6}$/;

export function validatePIN(pin: string): string | null {
  if (!pin) return null;
  if (!PIN_REGEX.test(pin.trim())) {
    return 'PIN code must be 6 digits';
  }
  return null;
}
