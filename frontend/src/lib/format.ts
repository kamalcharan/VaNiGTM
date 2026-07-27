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
