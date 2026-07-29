/**
 * The cadence governor.
 *
 * Pure functions, no database, no context — so the rule that decides when a
 * real person gets written to can be tested exhaustively and cheaply.
 *
 * ── WHAT IT ENFORCES ──────────────────────────────────────────────────
 *
 *   "At most `max_touches` touches to one contact in any rolling
 *    `window_days` period, never during quiet hours or on a quiet day."
 *
 * ROLLING, not calendar. A calendar week permits Fri, Fri, Mon, Mon — four
 * touches in four days, each of them honestly "two per week". Nobody means
 * that. The rolling window is the only reading that protects the recipient.
 *
 * ── WHAT IT DOES WHEN A TOUCH DOES NOT FIT ────────────────────────────
 *
 * It moves it and says so. It never silently drops one, and it never
 * silently sends one anyway (rule 12). `findSlot` returns the granted time,
 * how far it moved, and why — and the caller is obliged to carry that
 * reason, because the migration's CHECK constraint refuses a moved
 * reservation with no reason attached.
 */

/* ── Policy ───────────────────────────────────────────────────────────── */

export interface CadencePolicy {
  max_touches: number;
  window_days: number;
  /** 0 = Sunday … 6 = Saturday. */
  quiet_dows: number[];
  /** 'HH:MM' in `timezone`. Both null, or both set. May wrap midnight. */
  quiet_from: string | null;
  quiet_to: string | null;
  timezone: string;
}

export const DEFAULT_POLICY: CadencePolicy = {
  max_touches: 2,
  window_days: 7,
  quiet_dows: [0, 6],
  quiet_from: '19:00',
  quiet_to: '09:00',
  timezone: 'Asia/Kolkata',
};

const DAY_MS = 86_400_000;
/** How far ahead we will look for a slot before giving up and saying so. */
export const SEARCH_HORIZON_DAYS = 60;

/* ── Timezone ─────────────────────────────────────────────────────────
 *
 * Quiet hours are a human's evening, not UTC's. Done with Intl rather than
 * a dependency: `formatToParts` in a named zone gives the wall clock at an
 * instant, and the difference between that wall clock read as UTC and the
 * instant itself IS the offset. Correct across DST without a tz table.
 * ─────────────────────────────────────────────────────────────────────── */

function offsetMs(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  // hour comes back as 24 at midnight in some ICU versions; %24 normalises it.
  const asUTC = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'));
  return asUTC - at.getTime();
}

export interface LocalParts { dow: number; hour: number; minute: number; minutes: number }

export function localParts(at: Date, tz: string): LocalParts {
  const shifted = new Date(at.getTime() + offsetMs(at, tz));
  return {
    dow: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/** The instant at which the local wall clock in `tz` next reads `hh:mm`,
 *  on the local day of `at` or the one after if that has already passed. */
export function atLocalTime(at: Date, tz: string, hhmm: string, addDays = 0): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const off = offsetMs(at, tz);
  const shifted = new Date(at.getTime() + off + addDays * DAY_MS);
  shifted.setUTCHours(h, m, 0, 0);
  const first = new Date(shifted.getTime() - off);
  // Re-resolve: if the shift crossed a DST boundary the first offset was
  // the wrong one. Asia/Kolkata never does, but the code should not only
  // be right in one country.
  return new Date(shifted.getTime() - offsetMs(first, tz));
}

const hhmmToMinutes = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

/* ── Quiet windows ────────────────────────────────────────────────────── */

export function isQuietDay(at: Date, p: CadencePolicy): boolean {
  return p.quiet_dows.includes(localParts(at, p.timezone).dow);
}

export function isQuietHour(at: Date, p: CadencePolicy): boolean {
  if (!p.quiet_from || !p.quiet_to) return false;
  const now = localParts(at, p.timezone).minutes;
  const from = hhmmToMinutes(p.quiet_from);
  const to = hhmmToMinutes(p.quiet_to);
  // A band that wraps midnight (19:00 → 09:00) is the normal case for
  // "evening through morning", so it is the case that must work.
  return from <= to ? (now >= from && now < to) : (now >= from || now < to);
}

export function isQuiet(at: Date, p: CadencePolicy): boolean {
  return isQuietDay(at, p) || isQuietHour(at, p);
}

/**
 * The first non-quiet instant at or after `at`.
 *
 * Bounded rather than `while (true)`: a policy declaring all seven days
 * quiet is a configuration mistake, and looping forever on it would be a
 * worse failure than saying so.
 */
export function nextOpen(at: Date, p: CadencePolicy): Date | null {
  let t = at;
  for (let i = 0; i < SEARCH_HORIZON_DAYS * 2 + 4; i++) {
    if (isQuietHour(t, p)) {
      // Jump to the end of the silent band rather than crawling by the hour.
      const to = p.quiet_to!;
      const cand = atLocalTime(t, p.timezone, to);
      t = cand > t ? cand : atLocalTime(t, p.timezone, to, 1);
      continue;
    }
    if (isQuietDay(t, p)) {
      // Next local midnight, then re-test — the new day may still be quiet.
      t = atLocalTime(t, p.timezone, '00:00', 1);
      continue;
    }
    return t;
  }
  return null;
}

/* ── The window rule ──────────────────────────────────────────────────── */

/**
 * Would placing a touch at `candidate` break the rolling-window rule?
 *
 * The test is exact and deliberately literal: sort every touch including
 * the new one, then look at each run of `max + 1` consecutive touches. If
 * any such run spans less than the window, that run IS a violation — it is
 * max+1 touches inside one window period. Nothing subtler is needed, and a
 * cleverer test would be harder to believe.
 */
export function fits(existing: Date[], candidate: Date, p: CadencePolicy): boolean {
  const windowMs = p.window_days * DAY_MS;
  const all = [...existing, candidate].map((d) => d.getTime()).sort((a, b) => a - b);
  const run = p.max_touches + 1;
  if (all.length < run) return true;
  for (let i = 0; i + run - 1 < all.length; i++) {
    if (all[i + run - 1] - all[i] < windowMs) return false;
  }
  return true;
}

/* ── Arbitration ──────────────────────────────────────────────────────── */

export interface Slot {
  at: Date;
  /** Whole days between what was asked for and what was granted. */
  movedDays: number;
  /** Null when the requested time was granted as-is. */
  reason: string | null;
  /** What stopped the requested time: the cap, the quiet window, or both. */
  blockedBy: 'none' | 'cadence' | 'quiet' | 'both';
}

/**
 * The first time at or after `desired` that satisfies both rules.
 *
 * Searched a whole day at a time so the granted slot keeps the time of day
 * that was asked for — "moved +2d" should still be 10:00, because the hour
 * was chosen for a reason and only the day was in dispute.
 *
 * Returns null when nothing inside the horizon works. That is a real answer
 * and the caller must surface it: a contact this saturated should be left
 * alone, not squeezed.
 */
export function findSlot(existing: Date[], desired: Date, p: CadencePolicy): Slot | null {
  const wantedQuiet = isQuiet(desired, p);
  const wantedFits = fits(existing, desired, p);
  if (!wantedQuiet && wantedFits) {
    return { at: desired, movedDays: 0, reason: null, blockedBy: 'none' };
  }

  for (let d = 0; d <= SEARCH_HORIZON_DAYS; d++) {
    const shifted = new Date(desired.getTime() + d * DAY_MS);
    const open = nextOpen(shifted, p);
    if (!open) return null;
    if (!fits(existing, open, p)) continue;

    // Measured from the requested instant, rounded — the number a human
    // reads as "+2d".
    const movedDays = Math.round((open.getTime() - desired.getTime()) / DAY_MS);
    const blockedBy: Slot['blockedBy'] = !wantedFits && wantedQuiet ? 'both'
      : !wantedFits ? 'cadence' : 'quiet';
    return { at: open, movedDays, reason: reasonFor(blockedBy, movedDays, p), blockedBy };
  }
  return null;
}

function reasonFor(blockedBy: Slot['blockedBy'], movedDays: number, p: CadencePolicy): string {
  const by = movedDays > 0 ? `Moved +${movedDays}d` : 'Moved';
  switch (blockedBy) {
    case 'cadence':
      return `${by} by the cadence governor — this contact already has `
        + `${p.max_touches} touch${p.max_touches === 1 ? '' : 'es'} inside a `
        + `${p.window_days}-day window.`;
    case 'quiet':
      return `${by} — the requested time falls in a quiet window.`;
    case 'both':
      return `${by} by the cadence governor — the contact was at their `
        + `${p.max_touches}-per-${p.window_days}-day limit and the requested `
        + 'time also fell in a quiet window.';
    default:
      return `${by}.`;
  }
}

/**
 * Why a contact is saturated, for the message shown when `findSlot` returns
 * null. A bare "could not schedule" invites somebody to send by hand, which
 * is precisely the outcome the governor exists to prevent.
 */
export function saturationNote(existing: Date[], p: CadencePolicy): string {
  const next = existing.length
    ? new Date(Math.max(...existing.map((d) => d.getTime())) + p.window_days * DAY_MS)
    : null;
  return `This contact has no open slot in the next ${SEARCH_HORIZON_DAYS} days under `
    + `${p.max_touches} per ${p.window_days} days`
    + (next ? `. The earliest the window clears is ${next.toISOString().slice(0, 10)}.` : '.')
    + ' Reach somebody else at the account rather than sending anyway.';
}
