import fs from 'fs';
import path from 'path';
import { SkillContext } from '../../../types/skill.types';

const VANI_TENANT_SQL = fs.readFileSync(path.join(__dirname, '../queries/vani-tenant.sql'), 'utf-8');
const STEPS = ['domain', 'families', 'jd', 'jd2'] as const;

export async function journey(_params: Record<string, unknown>, ctx: SkillContext) {
  const vani = await ctx.db.query<{ id: string }>(VANI_TENANT_SQL, { tenant_id: ctx.tenant_id });
  const vaniId = vani.rows[0]?.id;
  if (!vaniId) {
    return { done: [], current: 'domain', note: 'not started — declare your domain first' };
  }
  const r = await ctx.db.query<{ domains: number; families: number; jds: number }>(
    `SELECT (SELECT count(*)::int FROM vani_tenant_domain WHERE tenant_id = $vani_id) AS domains,
            (SELECT count(*)::int FROM vani_role_family  WHERE tenant_id = $vani_id) AS families,
            (SELECT count(*)::int FROM vara_jd WHERE tenant_id = $vani_id AND status = 'published') AS jds`,
    { vani_id: vaniId },
  );
  const { domains, families, jds } = r.rows[0];
  const flags: Record<typeof STEPS[number], boolean> = {
    domain: domains > 0, families: families > 0, jd: jds >= 1, jd2: jds >= 2,
  };
  const done = STEPS.filter((s) => flags[s]);
  const current = STEPS.find((s) => !flags[s]) ?? null;
  const note =
    !flags.domain ? 'not started — declare your domain first'
    : !flags.families ? 'domain declared — take the families you hire for'
    : !flags.jd ? `${families} ${families === 1 ? 'family' : 'families'} taken — publish the first JD`
    : jds === 1 ? 'screening 1 role — the second JD opens from your own shape'
    : `screening ${jds} roles`;
  return { done, current, note };
}
