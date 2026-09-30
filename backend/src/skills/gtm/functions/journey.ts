import { SkillContext } from '../../../types/skill.types';

const STEPS = ['profile', 'audience', 'people', 'motion', 'sending'] as const;

export async function journey(_params: Record<string, unknown>, ctx: SkillContext) {
  const r = await ctx.db.query<{ profile: boolean; score: number | null; prospects: number; contacts: number; journeys: number; touches: number }>(
    `SELECT COALESCE((SELECT is_complete FROM gt_tenant_profile WHERE tenant_id = $tenant_id), false) AS profile,
            (SELECT completion_score FROM gt_tenant_profile WHERE tenant_id = $tenant_id) AS score,
            (SELECT count(*)::int FROM gt_prospects WHERE tenant_id = $tenant_id) AS prospects,
            (SELECT count(*)::int FROM gt_contacts  WHERE tenant_id = $tenant_id) AS contacts,
            (SELECT count(*)::int FROM gt_journeys  WHERE tenant_id = $tenant_id) AS journeys,
            (SELECT count(*)::int FROM gt_touch_log WHERE tenant_id = $tenant_id) AS touches`,
    { tenant_id: ctx.tenant_id },
  );
  const x = r.rows[0];
  const flags: Record<typeof STEPS[number], boolean> = {
    profile: x.profile, audience: x.prospects > 0, people: x.contacts > 0, motion: x.journeys > 0, sending: x.touches > 0,
  };
  const done = STEPS.filter((s) => flags[s]);
  const current = STEPS.find((s) => !flags[s]) ?? null;
  const note =
    !flags.profile ? (x.score == null ? 'not started — build the Smart Profile first' : `profile at ${x.score}/100 — reach 60 to start`)
    : !flags.audience ? 'profile ready — build the audience'
    : !flags.people ? `${x.prospects} companies — find the people`
    : !flags.motion ? `${x.contacts} people — put them in motion`
    : !flags.sending ? `${x.journeys} in motion — nothing sent yet (sending is gated on consent)`
    : `${x.journeys} in motion · ${x.touches} touches`;
  return { done, current, note };
}
