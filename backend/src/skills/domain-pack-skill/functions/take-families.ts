/**
 * Copy chosen families out of the platform catalogue and into the tenant's
 * own space.
 *
 * This is the step the product was missing. A family tile used to be a
 * SELECTOR — you clicked it, its name rode to JD Studio in a URL, and nothing
 * was written. So a tenant's own families existed only as a side effect of
 * publishing a JD, and nothing ever read them back: the second JD in a family
 * was identical work to the first, and "save it to my space" meant nothing.
 *
 * Four rows per family, one transaction:
 *
 *   vani_tenant_pack_binding   which pack version was copied, and by whom
 *   vani_role_family           the family, in their space
 *   vara_scoring_config v1     the shape, copied verbatim
 *   vara_family_profile        pointing at that v1 as live
 *
 * The schema has modelled this since migration 240/241 and nothing has ever
 * written it. `vani_role_family`'s own comment says so: "Org structure —
 * agent-neutral. Agents extend (vara_family_profile), never modify."
 *
 * IDEMPOTENT BY CONSTRUCTION, not by a stored request key. Taking a family is
 * keyed on (tenant_id, name) and the profile insert is ON CONFLICT DO NOTHING,
 * so a double-submit produces the same state and reports the family as already
 * theirs. That is stronger than store-and-replay and needs no Idempotency-Key
 * header — which matters, because `SkillContext` carries no request headers and
 * inventing a path for one would be a platform change, not a skill.
 */

import fs from 'fs';
import path from 'path';
import { SkillContext } from '../../../shared/types';
import { slugifyIndustry } from '../../../vani/industry-slug';
import { visiblePacksOfDomain } from '../review-state';

const q = (f: string) => fs.readFileSync(path.join(__dirname, '../queries/', f), 'utf-8');
const VANI_TENANT_SQL = q('vani-tenant.sql');
const TAKE_FAMILY_SQL = q('take-family.sql');
const SEED_CONFIG_SQL = q('seed-scoring-config.sql');
const SEED_PROFILE_SQL = q('seed-family-profile.sql');
const BIND_PACK_SQL = q('bind-pack.sql');

/** The axis split a family profile starts on — migration 241's own default. */
const DEFAULT_WEIGHTS = { skill: 55, avail: 25, exp: 20 };

export async function take_families(params: Record<string, unknown>, ctx: SkillContext) {
  const codes = Array.isArray(params.codes)
    ? [...new Set(params.codes.map((c) => String(c).trim()).filter(Boolean))]
    : [];
  if (!codes.length) {
    return { taken: [], already: [], reason: 'NO_CODES', detail: 'Pick at least one family.' };
  }
  if (codes.length > 50) {
    return { taken: [], already: [], reason: 'TOO_MANY', detail: 'At most 50 families at once.' };
  }

  const profile = await ctx.db.query<{ industry: string | null }>(
    `SELECT industry FROM vn_tenant_profiles WHERE tenant_id = $tenant_id`,
    { tenant_id: ctx.tenant_id },
  );
  const industry = (profile.rows[0]?.industry ?? '').trim();
  const domain = industry ? slugifyIndustry(industry) : '';
  if (!domain) {
    return {
      taken: [], already: [], reason: 'NO_INDUSTRY',
      detail: 'Set your industry in Smart Profile first.',
    };
  }

  const vani = await ctx.db.query<{ id: string }>(VANI_TENANT_SQL, { tenant_id: ctx.tenant_id });
  if (!vani.rows.length) {
    return {
      taken: [], already: [], reason: 'TENANT_NOT_PROVISIONED',
      detail: 'Complete the Domain step first — it is what creates your workspace.',
    };
  }
  const vaniTenantId = vani.rows[0].id;

  // Only packs of THIS tenant's industry, and only visible ones. Reading the
  // catalogue by code alone would let a caller copy a family out of somebody
  // else's industry — or a retired one — by naming it.
  const packs = await ctx.db.query<{
    id: string; code: string; version: number; payload: Record<string, any>;
  }>(
    `SELECT v.*, p.id FROM (${visiblePacksOfDomain('$domain')}) v
       JOIN vani_domain_pack p ON p.code = v.code AND p.version = v.version`,
    { domain },
  );
  const byCode = new Map(packs.rows.map((r) => [r.code, r]));

  const unknown = codes.filter((c) => !byCode.has(c));
  if (unknown.length) {
    // Loud, not skipped. Silently taking three of four and reporting success
    // is how a tenant ends up missing a family they believe they have.
    return {
      taken: [], already: [], reason: 'UNKNOWN_PACK',
      detail: `Not a role family in ${industry}: ${unknown.join(', ')}`,
    };
  }

  const taken: { code: string; name: string; family_id: string }[] = [];
  const already: { code: string; name: string; family_id: string }[] = [];

  await ctx.db.transaction(async (tx) => {
    for (const code of codes) {
      const pack = byCode.get(code)!;
      const starter = pack.payload?.vara?.starter ?? {};
      const name = String(pack.payload?.family_name ?? '').trim();

      const fam = await tx.query<{ id: string; created: boolean }>(TAKE_FAMILY_SQL, {
        vani_tenant_id: vaniTenantId,
        name,
        description: pack.payload?.hint ?? null,
      });
      const familyId = fam.rows[0].id;

      // Already theirs? Ask BEFORE writing anything else. vara_scoring_config
      // is unique on (tenant_id, family_id, version), so a replay that went on
      // to insert v1 again would raise and roll back the whole batch — every
      // family in the request lost because one was taken twice. "Idempotent by
      // construction" has to mean the second call is a no-op, not a crash.
      const has = await tx.query<{ id: string }>(
        `SELECT id FROM vara_family_profile WHERE family_id = $family_id`,
        { family_id: familyId },
      );
      if (has.rows.length) {
        // Still record the binding: a tenant may have built this family from
        // scratch and be taking the pack version for it now, and that is worth
        // knowing even though the shape is already theirs and stays theirs.
        await tx.query(BIND_PACK_SQL, {
          vani_tenant_id: vaniTenantId, pack_id: pack.id, bound_by: ctx.user_id,
        });
        already.push({ code, name, family_id: familyId });
        continue;
      }

      // The shape, copied verbatim. A reference would let a later pack version
      // rewrite what the tenant decided; a copy cannot.
      const cfg = await tx.query<{ id: string }>(SEED_CONFIG_SQL, {
        vani_tenant_id: vaniTenantId,
        family_id: familyId,
        weights: JSON.stringify(DEFAULT_WEIGHTS),
        components: JSON.stringify({
          musthaves: starter.musthaves ?? [],
          knockouts: starter.knockouts ?? [],
          role_summary_hint: starter.role_summary_hint ?? null,
          band_hint: starter.band_hint ?? null,
          from_pack: { code: pack.code, version: pack.version },
        }),
        threshold: typeof starter.threshold === 'number' ? starter.threshold : 30,
        approved_by: ctx.user_id,
      });

      await tx.query(SEED_PROFILE_SQL, {
        vani_tenant_id: vaniTenantId,
        family_id: familyId,
        threshold: typeof starter.threshold === 'number' ? starter.threshold : 30,
        config_id: cfg.rows[0].id,
      });

      await tx.query(BIND_PACK_SQL, {
        vani_tenant_id: vaniTenantId,
        pack_id: pack.id,
        bound_by: ctx.user_id,
      });

      taken.push({ code, name, family_id: familyId });
    }
  });

  return {
    taken, already,
    detail: taken.length
      ? `${taken.length} famil${taken.length === 1 ? 'y is' : 'ies are'} now yours`
        + (already.length ? `; ${already.length} you already had.` : '.')
      : 'You already had all of those.',
  };
}
