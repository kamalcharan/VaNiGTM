/**
 * KI-Prime — AMFI Daily NAV Fetcher
 *
 * Downloads today's NAV for ALL mutual fund schemes from AMFI India.
 * Source: https://www.amfiindia.com/spages/NAVAll.txt
 *
 * File format:
 *   Header lines (scheme type/category sections separated by blank lines)
 *   Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date
 *   100033;INF209K01165;-;Aditya Birla Sun Life Large & Mid Cap Fund - Regular Growth;45.2300;01-Apr-2026
 *
 * Returns parsed records keyed by scheme_code.
 */

export interface AmfiNavRecord {
  scheme_code: string;
  isin_growth: string | null;
  isin_reinvestment: string | null;
  scheme_name: string;
  nav: number;
  nav_date: string;  // YYYY-MM-DD
}

const AMFI_URL = 'https://www.amfiindia.com/spages/NAVAll.txt';

/**
 * Parse AMFI date format (DD-Mon-YYYY) to YYYY-MM-DD.
 * Example: "01-Apr-2026" → "2026-04-01"
 */
function parseAmfiDate(raw: string): string | null {
  if (!raw || raw.trim() === '') return null;
  const months: Record<string, string> = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
  };
  const parts = raw.trim().split('-');
  if (parts.length !== 3) return null;
  const [day, mon, year] = parts;
  const mm = months[mon];
  if (!mm) return null;
  return `${year}-${mm}-${day.padStart(2, '0')}`;
}

/**
 * Fetch and parse daily NAV data from AMFI India.
 * Returns Map<scheme_code, AmfiNavRecord> for fast lookup.
 */
export async function fetchAmfiDaily(): Promise<Map<string, AmfiNavRecord>> {
  const res = await fetch(AMFI_URL);
  if (!res.ok) throw new Error(`AMFI fetch failed: ${res.status} ${res.statusText}`);

  const text = await res.text();
  const lines = text.split('\n');
  const records = new Map<string, AmfiNavRecord>();

  for (const line of lines) {
    // Skip blank lines and header/category lines (no semicolons)
    if (!line.includes(';')) continue;

    const parts = line.split(';');
    if (parts.length < 6) continue;

    const schemeCode = parts[0].trim();
    // Skip if scheme_code is not numeric (header line)
    if (!/^\d+$/.test(schemeCode)) continue;

    const navStr = parts[4].trim();
    const nav = parseFloat(navStr);
    if (isNaN(nav) || nav <= 0) continue;

    const navDate = parseAmfiDate(parts[5].trim());
    if (!navDate) continue;

    records.set(schemeCode, {
      scheme_code: schemeCode,
      isin_growth: parts[1].trim() || null,
      isin_reinvestment: parts[2].trim() || null,
      scheme_name: parts[3].trim(),
      nav,
      nav_date: navDate,
    });
  }

  return records;
}
