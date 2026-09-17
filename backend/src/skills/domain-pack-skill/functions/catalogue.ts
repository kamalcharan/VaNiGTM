/**
 * What Vara knows about this tenant's industry, and what of it is already
 * theirs.
 *
 * The doorway used to render a family tile from the pack's name and hint
 * alone, so a tenant chose without ever seeing the must-haves Vara would
 * score, the knockouts, or the handover bar. Choosing blind is not choosing
 * (user, 2026-09-17: "we need to show the JD structure as view option here,
 * so that user should be able to see and decide"). So the full starter shape
 * comes back with every family — the screen decides when to show it, not the
 * server.
 */

import fs from 'fs';
import path from 'path';
import { SkillContext } from '../../../shared/types';
import { slugifyIndustry } from '../../../vani/industry-slug';
import { visiblePacksOfDomain, provenanceOf } from '../review-state';

const VANI_TENANT_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/vani-tenant.sql'), 'utf-8');

export async function catalogue(_params: Record<string, unknown>, ctx: SkillContext) {
  const profile = await ctx.db.query<{ industry: string | null }>(
    `SELECT industry FROM vn_tenant_profiles WHERE tenant_id = $tenant_id`,
    { tenant_id: ctx.tenant_id },
  );
  const industry = (profile.rows[0]?.industry ?? '').trim();
  const domain = industry ? slugifyIndustry(industry) : '';
  if (!domain) {
    return {
      industry: null, domain: null, families: [], mine: 0,
      reason: 'NO_INDUSTRY',
      detail: 'Set your industry in Smart Profile — Vara reads role families from it.',
    };
  }

  const packs = await ctx.db.query<{
    code: string; version: number; payload: Record<string, any>;
  }>(visiblePacksOfDomain('$domain'), { domain });

  // Which of them this tenant has already copied. Matched on family NAME
  // rather than pack code, because a tenant who built the same family from
  // scratch owns it just as much as one who took it from the catalogue.
  const vani = await ctx.db.query<{ id: string }>(VANI_TENANT_SQL, { tenant_id: ctx.tenant_id });
  const taken = new Set<string>();
  if (vani.rows.length) {
    const mine = await ctx.db.query<{ name: string }>(
      `SELECT rf.name
         FROM vani_role_family rf
         JOIN vara_family_profile fp ON fp.family_id = rf.id
        WHERE rf.tenant_id = $vani_tenant_id`,
      { vani_tenant_id: vani.rows[0].id },
    );
    for (const r of mine.rows) taken.add(r.name.trim().toLowerCase());
  }

  const families = packs.rows.map((r) => ({
    pack_code: r.code,
    pack_version: r.version,
    name: r.payload.family_name,
    hint: r.payload.hint ?? null,
    suggested_titles: r.payload.suggested_titles ?? [],
    // The whole shape, so "View the JD structure" needs no second round trip.
    starter: r.payload.vara.starter,
    provenance: provenanceOf(r.payload),
    mine: taken.has(String(r.payload.family_name ?? '').trim().toLowerCase()),
  }));

  return {
    industry, domain,
    families,
    mine: families.filter((f) => f.mine).length,
    // Rule 9b: an empty list still says what to do about it.
    detail: families.length
      ? `${families.length} role ${families.length === 1 ? 'family' : 'families'} known for ${industry}.`
      : `Vara has not studied ${industry} yet. Research it, or shape a role from scratch.`,
  };
}
