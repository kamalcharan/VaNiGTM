/**
 * KI-Prime — MFAPI Historical NAV Fetcher
 *
 * Downloads historical NAV data for a single scheme from api.mfapi.in.
 * Source: https://api.mfapi.in/mf/{scheme_code}
 *
 * Rate limiting: 500ms between requests (MFAPI is a free community API).
 * Retry: 3 attempts with exponential backoff (1s, 2s, 4s).
 *
 * Response format:
 *   { meta: { fund_house, scheme_name, scheme_code },
 *     data: [{ date: "01-04-2026", nav: "45.2300" }],
 *     status: "SUCCESS" }
 */

export interface MfapiNavRecord {
  scheme_code: string;
  nav: number;
  nav_date: string;  // YYYY-MM-DD
}

const MFAPI_BASE = 'https://api.mfapi.in/mf';
const MIN_DELAY_MS = 500;
const MAX_RETRIES = 3;

let lastRequestTime = 0;

/**
 * Enforce minimum delay between MFAPI requests.
 */
async function throttle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise((r) => setTimeout(r, MIN_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

/**
 * Parse MFAPI date (DD-MM-YYYY) to YYYY-MM-DD.
 */
function parseMfapiDate(raw: string): string | null {
  if (!raw) return null;
  const parts = raw.trim().split('-');
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

/**
 * Fetch historical NAV data for a single scheme.
 *
 * @param schemeCode — AMFI scheme code (e.g., "100033")
 * @param dateFrom  — Optional start date filter (YYYY-MM-DD)
 * @param dateTo    — Optional end date filter (YYYY-MM-DD)
 */
export async function fetchMfapiHistory(
  schemeCode: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<MfapiNavRecord[]> {
  await throttle();

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${MFAPI_BASE}/${schemeCode}`);
      if (!res.ok) {
        if (res.status === 404) return []; // Scheme not found in MFAPI
        throw new Error(`MFAPI ${res.status}: ${res.statusText}`);
      }

      const json = await res.json();
      if (json.status !== 'SUCCESS' || !Array.isArray(json.data)) {
        return [];
      }

      const records: MfapiNavRecord[] = [];

      for (const entry of json.data) {
        const nav = parseFloat(entry.nav);
        if (isNaN(nav) || nav <= 0) continue;

        const navDate = parseMfapiDate(entry.date);
        if (!navDate) continue;

        // Apply date range filter
        if (dateFrom && navDate < dateFrom) continue;
        if (dateTo && navDate > dateTo) continue;

        records.push({ scheme_code: schemeCode, nav, nav_date: navDate });
      }

      return records;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        // Exponential backoff: 1s, 2s, 4s
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }

  throw lastError || new Error(`MFAPI fetch failed for ${schemeCode}`);
}
