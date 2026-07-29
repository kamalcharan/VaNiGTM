/**
 * cadence-skill: set_policy
 *
 * Change how often a person may be touched.
 *
 * Guarded, because this is the one setting whose careless value is
 * invisible until an account stops replying. Raising the cap is allowed —
 * it is the tenant's call — but the absurd values are refused rather than
 * accepted and quietly obeyed.
 */

import { SkillContext } from '../../../shared/types';

interface SetPolicyParams {
  scope?: 'contact' | 'account';
  channel?: string | null;
  max_touches?: number;
  window_days?: number;
  quiet_dows?: number[];
  quiet_from?: string | null;
  quiet_to?: string | null;
  timezone?: string;
}

const CHANNELS = ['email', 'phone', 'linkedin', 'whatsapp', 'other'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function set_policy(params: SetPolicyParams, ctx: SkillContext) {
  const scope = params.scope ?? 'contact';
  if (scope !== 'contact' && scope !== 'account') {
    throw new Error('scope must be "contact" or "account"');
  }
  const channel = params.channel ?? null;
  if (channel !== null && !CHANNELS.includes(channel)) {
    throw new Error(`channel must be null or one of: ${CHANNELS.join(', ')}.`);
  }

  const max = params.max_touches === undefined ? 2 : Number(params.max_touches);
  const win = params.window_days === undefined ? 7 : Number(params.window_days);
  if (!Number.isInteger(max) || max < 1 || max > 50) {
    throw new Error('max_touches must be a whole number between 1 and 50.');
  }
  if (!Number.isInteger(win) || win < 1 || win > 90) {
    throw new Error('window_days must be a whole number between 1 and 90.');
  }

  const dows = (params.quiet_dows ?? [0, 6]).map(Number);
  if (dows.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new Error('quiet_dows must be whole numbers 0 (Sunday) to 6 (Saturday).');
  }
  if (dows.length === 7) {
    // Every day quiet means nothing can ever be scheduled. Better to say so
    // than to let every reservation fail later with no obvious cause.
    throw new Error('All seven days cannot be quiet — nothing could ever be scheduled.');
  }

  const from = params.quiet_from ?? null;
  const to = params.quiet_to ?? null;
  if ((from === null) !== (to === null)) {
    throw new Error('quiet_from and quiet_to must both be set, or both be empty.');
  }
  if (from && (!HHMM.test(from) || !HHMM.test(to!))) {
    throw new Error('quiet_from / quiet_to must be HH:MM in 24-hour time.');
  }

  const tz = params.timezone ?? 'Asia/Kolkata';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    throw new Error(`"${tz}" is not a timezone this system knows.`);
  }

  return ctx.db.transaction(async (tx) => {
    // Two partial unique indexes (channel IS NULL / IS NOT NULL) mean
    // ON CONFLICT cannot name a single constraint — so the update is
    // attempted first and the insert only runs when nothing matched.
    const upd = await tx.query<{ id: string }>(
      `UPDATE gt_cadence_policy
          SET max_touches = $max, window_days = $win, quiet_dows = $dows::smallint[],
              quiet_from = $from::time, quiet_to = $to::time, timezone = $tz,
              is_active = true, updated_at = now()
        WHERE tenant_id = $tenant_id AND is_live = $is_live AND scope = $scope
          AND (($channel::text IS NULL AND channel IS NULL) OR channel = $channel::text)
        RETURNING id::text`,
      {
        tenant_id: ctx.tenant_id, is_live: ctx.is_live, scope, channel,
        max, win, dows, from, to, tz,
      },
    );

    if (!upd.rows[0]) {
      await tx.query(
        `INSERT INTO gt_cadence_policy
           (tenant_id, is_live, scope, channel, max_touches, window_days,
            quiet_dows, quiet_from, quiet_to, timezone)
         VALUES ($tenant_id, $is_live, $scope, $channel, $max, $win,
                 $dows::smallint[], $from::time, $to::time, $tz)`,
        {
          tenant_id: ctx.tenant_id, is_live: ctx.is_live, scope, channel,
          max, win, dows, from, to, tz,
        },
      );
    }

    return {
      scope, channel, max_touches: max, window_days: win,
      quiet_dows: dows, quiet_from: from, quiet_to: to, timezone: tz,
      message: `At most ${max} touch${max === 1 ? '' : 'es'} per ${scope} `
        + `per rolling ${win} days${channel ? ` on ${channel}` : ''}. `
        + 'Existing reservations are not re-arbitrated.',
      recipe: 'cadence-policy' as const,
    };
  });
}
