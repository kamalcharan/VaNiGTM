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

  // The titles each family covers, read from the pack it was taken from.
  // Without these, picking a family in JD Studio leaves the tenant staring at
  // an empty box: they have said WHICH family and still have to invent a title
  // unaided. The pack already lists the titles it covers — one query, and the
  // pick has a next action (rule 9b).
  const codes = [...new Set(r.rows
    .map((x) => (x.components ?? {}).from_pack?.code)
    .filter((c): c is string => typeof c === 'string' && c.length > 0))];
  const titlesByCode = new Map<string, string[]>();
  if (codes.length) {
    // Latest version per code, same DISTINCT ON shape every reader of this
    // table uses. Retired packs are not filtered here on purpose: the family
    // is already the tenant's, and a withdrawn pack does not make the titles
    // they took it for wrong.
    const packs = await ctx.db.query<{ code: string; payload: Record<string, any> }>(
      `SELECT DISTINCT ON (code) code, payload
         FROM vani_domain_pack
        WHERE code = ANY($codes::text[])
        ORDER BY code, version DESC`,
      { codes },
    );
    for (const row of packs.rows) {
      const t = row.payload?.suggested_titles;
      if (Array.isArray(t)) titlesByCode.set(row.code, t.filter((x) => typeof x === 'string'));
    }
  }

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
      // Empty for a family built from scratch — there is no pack to ask, and
      // inventing titles for it would be exactly the fabrication rule 9d bans.
      suggested_titles: titlesByCode.get(c.from_pack?.code) ?? [],
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
