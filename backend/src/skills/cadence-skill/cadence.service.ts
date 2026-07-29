/**
 * The governor, against the database.
 *
 * `governor.ts` holds the rule. This holds the two things the rule needs
 * from storage — the policy, and everything already claimed on a person —
 * and the one write that grants a slot.
 */

import type { SkillDb } from '../../shared/types';
import {
  type CadencePolicy, DEFAULT_POLICY, findSlot, saturationNote, type Slot,
  SEARCH_HORIZON_DAYS,
} from './governor';

const DAY_MS = 86_400_000;

interface Scope { tenant_id: string; is_live: boolean }

export interface ResolvedPolicy extends CadencePolicy {
  /** Where the rule came from. Shown, so a default never passes for a choice. */
  source: 'channel' | 'tenant' | 'built-in';
}

/* ── Policy ───────────────────────────────────────────────────────────── */

interface PolicyRow {
  channel: string | null; max_touches: number; window_days: number;
  quiet_dows: number[]; quiet_from: string | null; quiet_to: string | null; timezone: string;
}

/**
 * The rule for one channel: its own row, else the tenant's default row,
 * else the built-in.
 *
 * Falling back to the built-in is a documented conservative default (2 per
 * 7 days), not a degraded mode — but it is still reported as `built-in` so
 * nobody mistakes an unconfigured tenant for a deliberate one. Failing hard
 * instead would block every send for a tenant created after migration 223,
 * which protects nobody.
 */
export async function loadPolicy(
  db: SkillDb, scope: Scope, channel: string, kind: 'contact' | 'account' = 'contact',
): Promise<ResolvedPolicy> {
  const res = await db.query<PolicyRow>(
    `SELECT channel, max_touches, window_days, quiet_dows,
            to_char(quiet_from, 'HH24:MI') AS quiet_from,
            to_char(quiet_to,   'HH24:MI') AS quiet_to,
            timezone
       FROM gt_cadence_policy
      WHERE tenant_id = $tenant_id AND is_live = $is_live
        AND scope = $scope AND is_active = true
        AND (channel = $channel OR channel IS NULL)
      -- Channel-specific first: NULLS LAST puts the tenant default behind it.
      ORDER BY channel NULLS LAST
      LIMIT 1`,
    { tenant_id: scope.tenant_id, is_live: scope.is_live, scope: kind, channel },
  );

  const row = res.rows[0];
  if (!row) return { ...DEFAULT_POLICY, source: 'built-in' };
  return {
    max_touches: Number(row.max_touches),
    window_days: Number(row.window_days),
    quiet_dows: (row.quiet_dows ?? []).map(Number),
    quiet_from: row.quiet_from,
    quiet_to: row.quiet_to,
    timezone: row.timezone,
    source: row.channel ? 'channel' : 'tenant',
  };
}

/* ── What is already claimed ──────────────────────────────────────────── */

export interface ClaimedTouch {
  at: Date;
  kind: 'sent' | 'held';
  channel: string;
  id: number;
  note: string | null;
}

/**
 * Everything on this person's calendar that consumes the window: touches
 * already sent AND reservations still held.
 *
 * Both, always. Counting only reservations lets a manual send slip past the
 * cap; counting only sends lets two planners fill the same empty week.
 *
 * Deliberately NOT filtered by opportunity or channel — the fatigue is the
 * person's, and an opportunity must not be able to skip the queue by being
 * a different opportunity. Channel-specific CAPS are expressed in the
 * policy, not by hiding other channels' touches from the count.
 */
export async function claimedTouches(
  db: SkillDb, scope: Scope, contactId: number, around: Date, windowDays: number,
): Promise<ClaimedTouch[]> {
  const from = new Date(around.getTime() - windowDays * DAY_MS).toISOString();
  const to = new Date(around.getTime() + (SEARCH_HORIZON_DAYS + windowDays) * DAY_MS).toISOString();

  const res = await db.query<{ at: string; kind: string; channel: string; id: string; note: string | null }>(
    `SELECT touched_at AS at, 'sent' AS kind, channel, id::text, notes AS note
       FROM gt_touch_log
      WHERE tenant_id = $tenant_id AND is_live = $is_live
        AND contact_id = $contact_id
        AND touched_at BETWEEN $from::timestamptz AND $to::timestamptz
     UNION ALL
     SELECT scheduled_at AS at, 'held' AS kind, channel, id::text, note
       FROM gt_touch_reservations
      WHERE tenant_id = $tenant_id AND is_live = $is_live
        AND contact_id = $contact_id
        AND status = 'held'
        AND scheduled_at BETWEEN $from::timestamptz AND $to::timestamptz
      ORDER BY at`,
    {
      tenant_id: scope.tenant_id, is_live: scope.is_live,
      contact_id: contactId, from, to,
    },
  );

  return res.rows.map((r) => ({
    at: new Date(r.at), kind: r.kind as 'sent' | 'held',
    channel: r.channel, id: Number(r.id), note: r.note,
  }));
}

/* ── Granting a slot ──────────────────────────────────────────────────── */

export interface Reservation {
  reservation_id: number | null;
  contact_id: number;
  channel: string;
  requested_at: string;
  scheduled_at: string | null;
  moved: boolean;
  moved_days: number;
  reason: string | null;
  blocked_by: Slot['blockedBy'] | 'saturated';
  policy: { max_touches: number; window_days: number; timezone: string; source: string };
  /** Everything that was competing for the window, so the move is auditable. */
  competing: Array<{ at: string; kind: string; channel: string }>;
  message: string;
}

/**
 * Claim the first slot at or after `desiredAt` that the policy allows.
 *
 * Runs inside the caller's transaction and takes a row lock on the contact
 * first: two planners reserving for one person at the same moment would
 * otherwise both read an empty week and both be granted it. The lock makes
 * reservations for a contact strictly serial, which is exactly what a cap
 * on that contact requires.
 */
export async function reserve(
  db: SkillDb,
  scope: Scope,
  args: {
    contact_id: number; channel: string; desired_at: Date;
    prospect_id?: number | null; journey_id?: number | null;
    note?: string | null; user_id?: string | null;
  },
): Promise<Reservation> {
  // tenant_id in the WHERE clause IS the authorisation — a contact id from
  // another tenant simply matches nothing.
  const owned = await db.query<{ id: string; prospect_id: string | null }>(
    `SELECT id::text, prospect_id::text
       FROM gt_contacts
      WHERE id = $contact_id AND tenant_id = $tenant_id AND is_live = $is_live
      FOR UPDATE`,
    { contact_id: args.contact_id, tenant_id: scope.tenant_id, is_live: scope.is_live },
  );
  if (!owned.rows[0]) throw new Error('No such contact.');

  const policy = await loadPolicy(db, scope, args.channel);
  const claimed = await claimedTouches(db, scope, args.contact_id, args.desired_at, policy.window_days);
  const slot = findSlot(claimed.map((c) => c.at), args.desired_at, policy);

  const competing = claimed.map((c) => ({
    at: c.at.toISOString(), kind: c.kind, channel: c.channel,
  }));
  const policyOut = {
    max_touches: policy.max_touches, window_days: policy.window_days,
    timezone: policy.timezone, source: policy.source,
  };

  // No opening inside the horizon. Nothing is written and nothing is
  // silently squeezed in — the caller is told to reach somebody else.
  if (!slot) {
    return {
      reservation_id: null, contact_id: args.contact_id, channel: args.channel,
      requested_at: args.desired_at.toISOString(), scheduled_at: null,
      moved: false, moved_days: 0,
      reason: saturationNote(claimed.map((c) => c.at), policy),
      blocked_by: 'saturated', policy: policyOut, competing,
      message: saturationNote(claimed.map((c) => c.at), policy),
    };
  }

  const moved = slot.at.getTime() !== args.desired_at.getTime();
  const ins = await db.query<{ id: string }>(
    `INSERT INTO gt_touch_reservations
       (tenant_id, is_live, contact_id, prospect_id, journey_id, channel,
        requested_at, scheduled_at, moved_reason, note, created_by)
     VALUES ($tenant_id, $is_live, $contact_id, $prospect_id::bigint, $journey_id::bigint,
             $channel, $requested_at::timestamptz, $scheduled_at::timestamptz,
             $moved_reason, $note, $user_id::uuid)
     RETURNING id::text`,
    {
      tenant_id: scope.tenant_id, is_live: scope.is_live,
      contact_id: args.contact_id,
      prospect_id: args.prospect_id ?? (owned.rows[0].prospect_id ? Number(owned.rows[0].prospect_id) : null),
      journey_id: args.journey_id ?? null,
      channel: args.channel,
      requested_at: args.desired_at.toISOString(),
      scheduled_at: slot.at.toISOString(),
      // The CHECK constraint refuses a moved reservation with no reason —
      // the move can never become silent, even by a coding mistake.
      moved_reason: moved ? slot.reason : null,
      note: args.note ?? null,
      user_id: args.user_id ?? null,
    },
  );

  return {
    reservation_id: Number(ins.rows[0].id),
    contact_id: args.contact_id,
    channel: args.channel,
    requested_at: args.desired_at.toISOString(),
    scheduled_at: slot.at.toISOString(),
    moved,
    moved_days: slot.movedDays,
    reason: moved ? slot.reason : null,
    blocked_by: slot.blockedBy,
    policy: policyOut,
    competing,
    message: moved
      ? `${slot.reason} Held for ${slot.at.toISOString().slice(0, 16).replace('T', ' ')}.`
      : 'Held at the requested time.',
  };
}
