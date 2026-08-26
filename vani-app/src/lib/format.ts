/**
 * Formatting gateway — ALL user-facing dates go through here.
 *
 * Convention (user ruling, 2026-07-27): dates render as DD-MMM-YYYY
 * (e.g. 27-Jul-2026) everywhere, times as HH:mm 24h.
 *
 * Server timestamps are UTC (timestamptz); these helpers convert to the
 * viewer's local time. When tenant-level timezone preferences and date
 * INPUT parsing arrive (deferred — see HANDOVER), they will be handled
 * here and only here, so no component ever re-implements date logic.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toDate(value: string | number | Date): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** DD-MMM-YYYY — e.g. 27-Jul-2026. Empty string for invalid input. */
export function formatDate(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) return '';
  const d = toDate(value);
  if (!d) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  return `${dd}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

/** DD-MMM-YYYY HH:mm — e.g. 27-Jul-2026 14:32. */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) return '';
  const d = toDate(value);
  if (!d) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${formatDate(d)} ${hh}:${mm}`;
}

/**
 * "4 minutes ago" for anything inside a day, DD-MMM-YYYY beyond it.
 *
 * Added for the Install screen's site-alive markers, where "2 minutes ago"
 * answers "is my snippet working?" and "26-Aug-2026" does not. Beyond a day
 * the relative form stops being useful and the absolute date is clearer, so
 * it falls back to formatDate rather than counting weeks.
 *
 * `now` is injectable so a test does not depend on the wall clock.
 */
export function formatRelative(
  value: string | number | Date | null | undefined,
  now: number = Date.now(),
): string {
  if (value === null || value === undefined) return '';
  const d = toDate(value);
  if (!d) return '';
  const secs = Math.round((now - d.getTime()) / 1000);
  if (secs < 0) return 'just now';        // clock skew between server and viewer
  if (secs < 45) return 'just now';
  if (secs < 5400) {                       // under 90 minutes → minutes
    const m = Math.round(secs / 60);
    return `${m} minute${m === 1 ? '' : 's'} ago`;
  }
  if (secs < 86400) {                      // under a day → hours
    const h = Math.round(secs / 3600);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  }
  return formatDate(d);
}
