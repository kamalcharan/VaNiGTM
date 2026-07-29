/**
 * The governor's rule, on its own.
 *
 * This decides when a real person gets written to. Every test here exists
 * because the failure it guards is silent: an over-touched contact does not
 * throw, it just stops replying, and by the time anybody notices the reply
 * rate the damage is a quarter old.
 */

import {
  DEFAULT_POLICY, type CadencePolicy,
  fits, findSlot, isQuiet, isQuietDay, isQuietHour, nextOpen,
  localParts, atLocalTime, saturationNote, SEARCH_HORIZON_DAYS,
} from '../governor';

const DAY = 86_400_000;
/** IST is UTC+5:30, so 10:00 local is 04:30Z. Stated once, used throughout. */
const ist = (s: string) => new Date(`${s}+05:30`);
const P = (over: Partial<CadencePolicy> = {}): CadencePolicy => ({ ...DEFAULT_POLICY, ...over });
/** Most window tests are about the cap alone; quiet rules would obscure them. */
const OPEN = P({ quiet_dows: [], quiet_from: null, quiet_to: null });

describe('the rolling window', () => {
  it('allows the first touch on an empty contact', () => {
    expect(fits([], ist('2026-08-03T10:00'), OPEN)).toBe(true);
  });

  it('allows up to the cap inside one window', () => {
    const a = ist('2026-08-03T10:00');
    expect(fits([a], new Date(a.getTime() + DAY), OPEN)).toBe(true);
  });

  it('refuses one over the cap inside one window', () => {
    const a = ist('2026-08-03T10:00');
    const b = new Date(a.getTime() + DAY);
    expect(fits([a, b], new Date(a.getTime() + 2 * DAY), OPEN)).toBe(false);
  });

  it('allows the third once the window has cleared', () => {
    const a = ist('2026-08-03T10:00');
    const b = new Date(a.getTime() + DAY);
    // Strictly more than 7 days after the FIRST — that is when it drops out.
    expect(fits([a, b], new Date(a.getTime() + 7 * DAY + 60_000), OPEN)).toBe(true);
  });

  it('is rolling, not calendar — Fri/Fri/Mon/Mon is refused', () => {
    // The exact abuse a calendar week permits: two touches at the end of one
    // week and two at the start of the next, four inside four days, every
    // one of them honestly "two per week".
    const fri1 = ist('2026-08-07T10:00');
    const fri2 = ist('2026-08-07T16:00');
    const mon1 = ist('2026-08-10T10:00');
    expect(fits([fri1, fri2], mon1, OPEN)).toBe(false);
  });

  it('counts touches on BOTH sides of the candidate', () => {
    // A slot with one touch before it and one after it is still the middle
    // of three inside a week. Checking only backwards would miss this, and
    // planners schedule out of order all the time.
    const before = ist('2026-08-03T10:00');
    const after = ist('2026-08-06T10:00');
    expect(fits([before, after], ist('2026-08-04T10:00'), OPEN)).toBe(false);
  });

  it('honours a cap of one', () => {
    const a = ist('2026-08-03T10:00');
    const one = P({ max_touches: 1, quiet_dows: [], quiet_from: null, quiet_to: null });
    expect(fits([a], new Date(a.getTime() + 3 * DAY), one)).toBe(false);
    expect(fits([a], new Date(a.getTime() + 8 * DAY), one)).toBe(true);
  });

  it('ignores touches far outside the window', () => {
    const old = ist('2026-01-03T10:00');
    expect(fits([old, ist('2026-01-04T10:00')], ist('2026-08-03T10:00'), OPEN)).toBe(true);
  });
});

describe('quiet windows', () => {
  it('knows a quiet day in the policy timezone, not UTC', () => {
    // 2026-08-08 is a Saturday IST. 23:00 UTC on Friday the 7th is already
    // Saturday 04:30 in Hyderabad — reading this in UTC would send then.
    expect(isQuietDay(new Date('2026-08-07T23:00:00Z'), P())).toBe(true);
    expect(isQuietDay(ist('2026-08-05T10:00'), P())).toBe(false);
  });

  it('handles a band that wraps midnight', () => {
    // 19:00 → 09:00 is the normal "evening through morning" rule, so it is
    // the case that has to work.
    const p = P({ quiet_dows: [] });
    expect(isQuietHour(ist('2026-08-05T20:00'), p)).toBe(true);
    expect(isQuietHour(ist('2026-08-05T02:00'), p)).toBe(true);
    expect(isQuietHour(ist('2026-08-05T08:59'), p)).toBe(true);
    expect(isQuietHour(ist('2026-08-05T09:00'), p)).toBe(false);
    expect(isQuietHour(ist('2026-08-05T18:59'), p)).toBe(false);
  });

  it('handles a band that does not wrap', () => {
    const p = P({ quiet_dows: [], quiet_from: '12:00', quiet_to: '14:00' });
    expect(isQuietHour(ist('2026-08-05T13:00'), p)).toBe(true);
    expect(isQuietHour(ist('2026-08-05T11:00'), p)).toBe(false);
    expect(isQuietHour(ist('2026-08-05T14:00'), p)).toBe(false);
  });

  it('treats no band as never quiet by hour', () => {
    const p = P({ quiet_from: null, quiet_to: null, quiet_dows: [] });
    expect(isQuietHour(ist('2026-08-05T03:00'), p)).toBe(false);
  });

  it('opens at the end of the band, same day', () => {
    const open = nextOpen(ist('2026-08-05T20:00'), P())!;
    // Wednesday 20:00 → Thursday 09:00 local.
    expect(localParts(open, 'Asia/Kolkata').hour).toBe(9);
    expect(localParts(open, 'Asia/Kolkata').dow).toBe(4);
  });

  it('skips the whole weekend', () => {
    // Saturday 10:00 local → Monday 09:00 local (10:00 is inside the
    // morning band, so it lands at the band's end).
    const open = nextOpen(ist('2026-08-08T10:00'), P())!;
    const l = localParts(open, 'Asia/Kolkata');
    expect(l.dow).toBe(1);
    expect(l.hour).toBeGreaterThanOrEqual(9);
  });

  it('returns null rather than looping when every day is quiet', () => {
    // A policy silencing all seven days is a configuration mistake. Saying
    // so beats hanging on it.
    expect(nextOpen(ist('2026-08-05T10:00'), P({ quiet_dows: [0, 1, 2, 3, 4, 5, 6] }))).toBeNull();
  });

  it('leaves an already-open time alone', () => {
    const t = ist('2026-08-05T10:00');
    expect(nextOpen(t, P())!.getTime()).toBe(t.getTime());
  });
});

describe('finding a slot', () => {
  it('grants the requested time when nothing is in the way', () => {
    const want = ist('2026-08-05T10:00');
    const s = findSlot([], want, P())!;
    expect(s.at.getTime()).toBe(want.getTime());
    expect(s.movedDays).toBe(0);
    expect(s.reason).toBeNull();
    expect(s.blockedBy).toBe('none');
  });

  it('moves a touch that would breach the cap, and says why', () => {
    const a = ist('2026-08-03T10:00');
    const b = ist('2026-08-04T10:00');
    const s = findSlot([a, b], ist('2026-08-05T10:00'), OPEN)!;
    expect(s.movedDays).toBeGreaterThan(0);
    expect(s.blockedBy).toBe('cadence');
    expect(s.reason).toMatch(/cadence governor/i);
    expect(fits([a, b], s.at, OPEN)).toBe(true);
  });

  it('keeps the time of day when it moves the day', () => {
    // "+2d" should still be 10:00 — the hour was chosen for a reason and
    // only the day was in dispute.
    const a = ist('2026-08-03T10:00');
    const b = ist('2026-08-04T10:00');
    const s = findSlot([a, b], ist('2026-08-05T10:00'), OPEN)!;
    expect(localParts(s.at, 'Asia/Kolkata').hour).toBe(10);
  });

  it('reports a quiet-window move separately from a cap move', () => {
    const s = findSlot([], ist('2026-08-05T21:00'), P({ quiet_dows: [] }))!;
    expect(s.blockedBy).toBe('quiet');
    expect(s.reason).toMatch(/quiet/i);
  });

  it('names both when both applied', () => {
    const a = ist('2026-08-03T10:00');
    const b = ist('2026-08-04T10:00');
    const s = findSlot([a, b], ist('2026-08-05T21:00'), P({ quiet_dows: [] }))!;
    expect(s.blockedBy).toBe('both');
    expect(s.reason).toMatch(/quiet/i);
    expect(s.reason).toMatch(/governor/i);
  });

  it('never grants a slot that breaks its own rule', () => {
    // The property that matters more than any single case. Random-ish but
    // fixed: no Math.random, so a failure is reproducible.
    const p = OPEN;
    for (let seed = 0; seed < 40; seed++) {
      const existing = [0, 1, 2].map((k) =>
        new Date(ist('2026-08-01T10:00').getTime() + ((seed * 7 + k * 11) % 20) * DAY));
      const want = new Date(ist('2026-08-01T10:00').getTime() + (seed % 15) * DAY);
      const s = findSlot(existing, want, p);
      expect(s).not.toBeNull();
      expect(fits(existing, s!.at, p)).toBe(true);
      expect(s!.at.getTime()).toBeGreaterThanOrEqual(want.getTime());
    }
  });

  it('never moves a touch earlier than asked', () => {
    const s = findSlot([ist('2026-08-03T10:00')], ist('2026-08-04T10:00'), OPEN)!;
    expect(s.at.getTime()).toBeGreaterThanOrEqual(ist('2026-08-04T10:00').getTime());
  });

  it('returns null for a contact with no opening inside the horizon', () => {
    // One touch every other day for four months, cap of one per week.
    const dense = Array.from({ length: 60 }, (_, i) =>
      new Date(ist('2026-08-01T10:00').getTime() + i * 2 * DAY));
    const p = P({ max_touches: 1, window_days: 7, quiet_dows: [], quiet_from: null, quiet_to: null });
    expect(findSlot(dense, ist('2026-08-02T10:00'), p)).toBeNull();
  });

  it('explains saturation rather than just failing', () => {
    // "Could not schedule" invites somebody to send by hand, which is the
    // exact outcome the governor exists to prevent.
    const note = saturationNote([ist('2026-08-03T10:00')], P());
    expect(note).toMatch(/2 per 7 days/);
    expect(note).toMatch(/2026-08-10/);
    expect(note).toMatch(/somebody else/i);
    expect(note).toContain(String(SEARCH_HORIZON_DAYS));
  });
});

describe('timezone handling', () => {
  it('reads the wall clock in the policy zone', () => {
    const l = localParts(new Date('2026-08-05T04:30:00Z'), 'Asia/Kolkata');
    expect(l.hour).toBe(10);
    expect(l.minute).toBe(0);
  });

  it('builds an instant from a local time', () => {
    const t = atLocalTime(ist('2026-08-05T15:00'), 'Asia/Kolkata', '09:00');
    expect(t.toISOString()).toBe('2026-08-05T03:30:00.000Z');
  });

  it('is right in a zone that observes DST', () => {
    // 2026-08-05 is British Summer Time: 09:00 London is 08:00Z. A naive
    // implementation returns 09:00Z and sends an hour early all summer.
    const t = atLocalTime(new Date('2026-08-05T15:00:00Z'), 'Europe/London', '09:00');
    expect(t.toISOString()).toBe('2026-08-05T08:00:00.000Z');
    // Same wall clock in winter is 09:00Z.
    const w = atLocalTime(new Date('2026-01-15T15:00:00Z'), 'Europe/London', '09:00');
    expect(w.toISOString()).toBe('2026-01-15T09:00:00.000Z');
  });

  it('applies quiet days by local date across the dateline shift', () => {
    // 18:30Z Friday is already Saturday 00:00 IST.
    expect(isQuiet(new Date('2026-08-07T18:30:00Z'), P())).toBe(true);
  });
});
