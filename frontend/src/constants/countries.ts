/**
 * KI-Prime — Country Constants
 *
 * Single source of truth for country codes, dial codes, flags, and mobile validation rules.
 * Used by VdfMobileInput and any phone-related UI.
 *
 * Validation rules are country-specific:
 *   - India: exactly 10 digits, starts with 6-9
 *   - US/Canada: exactly 10 digits
 *   - UK: 10-11 digits
 *   - etc.
 */

export interface CountryConfig {
  /** ISO 3166-1 alpha-2 code (lowercase) */
  code: string;
  /** Country name */
  name: string;
  /** Dial code with + prefix */
  dial_code: string;
  /** Flag emoji */
  flag: string;
  /** Regex pattern for mobile number (digits only, after dial code) */
  mobilePattern: RegExp;
  /** Human-readable format hint */
  mobileHint: string;
  /** Expected digit count (for display) */
  mobileLength: number;
  /** Placeholder example */
  placeholder: string;
}

export const COUNTRIES: CountryConfig[] = [
  {
    code: 'in', name: 'India', dial_code: '+91', flag: '\u{1F1EE}\u{1F1F3}',
    mobilePattern: /^[6-9]\d{9}$/, mobileHint: '10 digits, starts with 6-9',
    mobileLength: 10, placeholder: '98765 43210',
  },
  {
    code: 'us', name: 'United States', dial_code: '+1', flag: '\u{1F1FA}\u{1F1F8}',
    mobilePattern: /^[2-9]\d{9}$/, mobileHint: '10 digits',
    mobileLength: 10, placeholder: '202 555 0123',
  },
  {
    code: 'gb', name: 'United Kingdom', dial_code: '+44', flag: '\u{1F1EC}\u{1F1E7}',
    mobilePattern: /^7\d{9}$/, mobileHint: '10 digits, starts with 7',
    mobileLength: 10, placeholder: '7911 123456',
  },
  {
    code: 'ae', name: 'UAE', dial_code: '+971', flag: '\u{1F1E6}\u{1F1EA}',
    mobilePattern: /^5\d{8}$/, mobileHint: '9 digits, starts with 5',
    mobileLength: 9, placeholder: '50 123 4567',
  },
  {
    code: 'sg', name: 'Singapore', dial_code: '+65', flag: '\u{1F1F8}\u{1F1EC}',
    mobilePattern: /^[89]\d{7}$/, mobileHint: '8 digits, starts with 8 or 9',
    mobileLength: 8, placeholder: '9123 4567',
  },
  {
    code: 'au', name: 'Australia', dial_code: '+61', flag: '\u{1F1E6}\u{1F1FA}',
    mobilePattern: /^4\d{8}$/, mobileHint: '9 digits, starts with 4',
    mobileLength: 9, placeholder: '412 345 678',
  },
  {
    code: 'ca', name: 'Canada', dial_code: '+1', flag: '\u{1F1E8}\u{1F1E6}',
    mobilePattern: /^[2-9]\d{9}$/, mobileHint: '10 digits',
    mobileLength: 10, placeholder: '416 555 0123',
  },
  {
    code: 'de', name: 'Germany', dial_code: '+49', flag: '\u{1F1E9}\u{1F1EA}',
    mobilePattern: /^1[5-7]\d{8,9}$/, mobileHint: '10-11 digits, starts with 15-17',
    mobileLength: 11, placeholder: '151 1234 5678',
  },
  {
    code: 'fr', name: 'France', dial_code: '+33', flag: '\u{1F1EB}\u{1F1F7}',
    mobilePattern: /^[67]\d{8}$/, mobileHint: '9 digits, starts with 6 or 7',
    mobileLength: 9, placeholder: '6 12 34 56 78',
  },
  {
    code: 'jp', name: 'Japan', dial_code: '+81', flag: '\u{1F1EF}\u{1F1F5}',
    mobilePattern: /^[789]0\d{8}$/, mobileHint: '10 digits',
    mobileLength: 10, placeholder: '90 1234 5678',
  },
  {
    code: 'kr', name: 'South Korea', dial_code: '+82', flag: '\u{1F1F0}\u{1F1F7}',
    mobilePattern: /^10\d{8}$/, mobileHint: '10 digits, starts with 10',
    mobileLength: 10, placeholder: '10 1234 5678',
  },
  {
    code: 'za', name: 'South Africa', dial_code: '+27', flag: '\u{1F1FF}\u{1F1E6}',
    mobilePattern: /^[6-8]\d{8}$/, mobileHint: '9 digits',
    mobileLength: 9, placeholder: '71 123 4567',
  },
  {
    code: 'br', name: 'Brazil', dial_code: '+55', flag: '\u{1F1E7}\u{1F1F7}',
    mobilePattern: /^\d{10,11}$/, mobileHint: '10-11 digits',
    mobileLength: 11, placeholder: '11 91234 5678',
  },
  {
    code: 'mx', name: 'Mexico', dial_code: '+52', flag: '\u{1F1F2}\u{1F1FD}',
    mobilePattern: /^\d{10}$/, mobileHint: '10 digits',
    mobileLength: 10, placeholder: '55 1234 5678',
  },
  {
    code: 'ng', name: 'Nigeria', dial_code: '+234', flag: '\u{1F1F3}\u{1F1EC}',
    mobilePattern: /^[789]0\d{8}$/, mobileHint: '10 digits',
    mobileLength: 10, placeholder: '80 1234 5678',
  },
  {
    code: 'ke', name: 'Kenya', dial_code: '+254', flag: '\u{1F1F0}\u{1F1EA}',
    mobilePattern: /^7\d{8}$/, mobileHint: '9 digits, starts with 7',
    mobileLength: 9, placeholder: '712 345678',
  },
  {
    code: 'ph', name: 'Philippines', dial_code: '+63', flag: '\u{1F1F5}\u{1F1ED}',
    mobilePattern: /^9\d{9}$/, mobileHint: '10 digits, starts with 9',
    mobileLength: 10, placeholder: '917 123 4567',
  },
  {
    code: 'my', name: 'Malaysia', dial_code: '+60', flag: '\u{1F1F2}\u{1F1FE}',
    mobilePattern: /^1\d{8,9}$/, mobileHint: '9-10 digits, starts with 1',
    mobileLength: 10, placeholder: '12 345 6789',
  },
  {
    code: 'id', name: 'Indonesia', dial_code: '+62', flag: '\u{1F1EE}\u{1F1E9}',
    mobilePattern: /^8\d{8,11}$/, mobileHint: '9-12 digits, starts with 8',
    mobileLength: 12, placeholder: '812 3456 7890',
  },
  {
    code: 'lk', name: 'Sri Lanka', dial_code: '+94', flag: '\u{1F1F1}\u{1F1F0}',
    mobilePattern: /^7\d{8}$/, mobileHint: '9 digits, starts with 7',
    mobileLength: 9, placeholder: '77 123 4567',
  },
  {
    code: 'np', name: 'Nepal', dial_code: '+977', flag: '\u{1F1F3}\u{1F1F5}',
    mobilePattern: /^9[78]\d{8}$/, mobileHint: '10 digits, starts with 97 or 98',
    mobileLength: 10, placeholder: '98 1234 5678',
  },
  {
    code: 'bd', name: 'Bangladesh', dial_code: '+880', flag: '\u{1F1E7}\u{1F1E9}',
    mobilePattern: /^1[3-9]\d{8}$/, mobileHint: '10 digits, starts with 1',
    mobileLength: 10, placeholder: '1712 345678',
  },
];

/** Default country (India for MFD product) */
export const DEFAULT_COUNTRY = COUNTRIES[0];

/** Find country by ISO code */
export function getCountryByCode(code: string): CountryConfig | undefined {
  return COUNTRIES.find(c => c.code === code.toLowerCase());
}

/** Validate mobile number against country-specific rules */
export function validateMobile(countryCode: string, mobile: string): string | null {
  const country = getCountryByCode(countryCode);
  if (!country) return 'Unknown country';

  const digits = mobile.replace(/[\s-]/g, '');
  if (!digits) return null; // Empty is OK (phone is optional)

  if (!/^\d+$/.test(digits)) {
    return 'Phone must contain digits only';
  }

  if (!country.mobilePattern.test(digits)) {
    return `Invalid ${country.name} mobile number (${country.mobileHint})`;
  }

  return null;
}
