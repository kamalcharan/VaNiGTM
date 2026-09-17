/**
 * The families in this tenant's own space, with the shape they are actually
 * on.
 *
 * The layer that was write-only. `vani_role_family` and `vara_family_profile`
 * have been written on every JD publish since August and read by nothing, so
 * the doorway kept showing the PLATFORM catalogue and a tenant who had cut two
 * must-haves last month saw the industry version again this month. This is the
 * read that turns that around: JD Studio matches against these first, and only
 * falls back to the catalogue for a role the tenant has not taken.
 *
 * `active_config_id` is followed rather than "the highest version", because an
 * edit that has not been activated is not what Vara scores against. Two
 * answers to "which version is live" is how they drift.
 */

import fs from 'fs';
import path from 'path';
import { SkillContext } from '../../../shared/types';

const VANI_TENANT_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/vani-tenant.sql'), 'utf-8');

export async function my_families(_params: Record<string, unknown>, ctx: SkillContext) {
  const vani = await ctx.db.query<{ id: string }>(VANI_TENANT_SQL, { tenant_id: ctx.tenant_id });
  if (!vani.rows.length) {
    return {
      families: [], reason: 'TENANT_NOT_PROVISIONED',
      detail: 'Complete the Domain step first — it is what creates your workspace.',
    };
  }

  const r = await ctx.db.query<{
    family_id: string; name: string; description: string | null;
    version: number; components: Record<string, any>; weights: Record<string, any>;
    threshold: number; created_at: string;
  }>(
    `SELECT rf.id            AS family_id,
            rf.name,
            rf.description,
            sc.version,
            sc.components,
            sc.weights,
            fp.default_threshold AS threshold,
            sc.created_at
       FROM vani_role_family rf
       JOIN vara_family_profile fp ON fp.family_id = rf.id
       LEFT JOIN vara_scoring_config sc ON sc.id = fp.active_config_id
      WHERE rf.tenant_id = $vani_tenant_id
      ORDER BY rf.name`,
    { vani_tenant_id: vani.rows[0].id },
  );

  const families = r.rows.map((x) => {
    const c = x.components ?? {};
    return {
      family_id: x.family_id,
      name: x.name,
      hint: x.description,
      version: x.version ?? 1,
      musthaves: c.musthaves ?? [],
      knockouts: c.knockouts ?? [],
      role_summary_hint: c.role_summary_hint ?? null,
      band_hint: c.band_hint ?? null,
      threshold: x.threshold,
      axis_weights: x.weights ?? null,
      // Where this copy came from. Absent means the tenant built it from
      // scratch — a real distinction, and the reason the console can say
      // "a family you built" rather than "your shape".
      from_pack: c.from_pack ?? null,
      edited: (x.version ?? 1) > 1,
    };
  });

  return {
    families,
    // Rule 9b: nothing here still says what to do next.
    detail: families.length
      ? `${families.length} famil${families.length === 1 ? 'y' : 'ies'} in your workspace.`
      : 'You have not taken any role families yet. Take one from your industry, or shape a role from scratch.',
  };
}
