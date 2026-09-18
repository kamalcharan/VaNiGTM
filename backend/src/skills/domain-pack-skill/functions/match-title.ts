/**
 * "Senior Backend Engineer" → the starter shape Vara should open with.
 *
 * Called as the hiring manager types a title, before any family is chosen.
 * Returns the matched family's starter shape ready to hand to
 * `vara.composer.ask_next` as {{starter_shape_json}} — the variable migration
 * 245 declared in August and nothing has ever filled.
 *
 * Returns matched:false rather than the nearest family when nothing clears the
 * floor. That is the whole safety property: a Customer Success title must not
 * quietly inherit an engineering playbook, which is exactly how one got
 * PostgreSQL + RLS at 40% weight.
 */

import { SkillContext } from '../../../shared/types';
import { slugifyIndustry } from '../../../vani/industry-slug';
import { matchTitle, type PackCandidate } from '../title-match';
import { visiblePacksOfDomain } from '../review-state';
import fs from 'fs';
import path from 'path';

const VANI_TENANT_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/vani-tenant.sql'), 'utf-8');

export async function match_title(
  params: Record<string, unknown>,
  ctx: SkillContext,
) {
  const title = String(params.title ?? '').trim();
  if (title.length < 2) {
    return { matched: false, reason: 'NO_TITLE', detail: 'Type a role title first.' };
  }

  const profile = await ctx.db.query<{ industry: string | null }>(
    `SELECT industry FROM vn_tenant_profiles WHERE tenant_id = $tenant_id`,
    { tenant_id: ctx.tenant_id },
  );
  const industry = (profile.rows[0]?.industry ?? '').trim();
  const domain = industry ? slugifyIndustry(industry) : '';
  if (!domain) {
    return {
      matched: false,
      reason: 'NO_INDUSTRY',
      detail: 'Set your industry in Smart Profile — Vara matches roles against it.',
    };
  }

  // Latest version per pack code. vani_domain_pack carries no RLS (migration
  // 240: platform registries hold no tenant policy), so this reads the shared
  // artefact directly. Seeded and researched packs are BOTH candidates — the
  // match decides, not the provenance, and ties break toward researched.
  const packs = await ctx.db.query<{
    code: string; version: number; payload: Record<string, any>;
  }>(
    visiblePacksOfDomain('$domain'),
    { domain },
  );

  // THE TENANT'S OWN FAMILIES FIRST. This is what makes the second JD in a
  // family cheaper than the first: it opens from the shape they are on, not
  // the industry's. Matching the catalogue first would quietly hand back the
  // platform version and undo every edit they made — the product would look
  // identical and never compound.
  const vani = await ctx.db.query<{ id: string }>(VANI_TENANT_SQL, { tenant_id: ctx.tenant_id });
  const mine: PackCandidate[] = [];
  if (vani.rows.length) {
    const own = await ctx.db.query<{
      family_id: string; name: string; version: number; components: Record<string, any>;
      threshold: number;
    }>(
      `SELECT rf.id AS family_id, rf.name, sc.version, sc.components,
              fp.default_threshold AS threshold
         FROM vani_role_family rf
         JOIN vara_family_profile fp ON fp.family_id = rf.id
         LEFT JOIN vara_scoring_config sc ON sc.id = fp.active_config_id
        WHERE rf.tenant_id = $vani_tenant_id`,
      { vani_tenant_id: vani.rows[0].id },
    );
    for (const f of own.rows) {
      const c = f.components ?? {};
      // Titles come from the pack this family was copied from, when there was
      // one. A family built from scratch has only its name to match on, which
      // is honest: nobody has told Vara what that role is called elsewhere.
      const fromPack = c.from_pack ?? null;
      const packTitles = fromPack
        ? packs.rows.find((p) => p.code === fromPack.code)?.payload?.suggested_titles ?? []
        : [];
      mine.push({
        pack_code: fromPack?.code ?? `tenant:${f.family_id}`,
        pack_version: fromPack?.version ?? 0,
        family_name: f.name,
        suggested_titles: packTitles,
        researched: true,
        mine: true,
        family_id: f.family_id,
        version: f.version ?? 1,
        starter: {
          role_summary_hint: c.role_summary_hint ?? null,
          musthaves: c.musthaves ?? [],
          knockouts: c.knockouts ?? [],
          threshold: f.threshold,
          band_hint: c.band_hint ?? null,
        },
      });
    }
  }
  const takenNames = new Set(mine.map((m) => m.family_name.trim().toLowerCase()));

  const catalogue: PackCandidate[] = packs.rows.map((r) => ({
    pack_code: r.code,
    pack_version: r.version,
    family_name: r.payload.family_name,
    suggested_titles: r.payload.suggested_titles ?? [],
    researched: r.payload.researched != null,
    starter: r.payload.vara.starter,
  }));

  // A family they have taken is represented ONCE — by their copy. Leaving the
  // catalogue row in as well would let the platform version win a tie on
  // family-name alone and hand back a shape they had already changed.
  const candidates: PackCandidate[] = [
    ...mine,
    ...catalogue.filter((c) => !takenNames.has(c.family_name.trim().toLowerCase())),
  ];

  if (!candidates.length) {
    return {
      matched: false,
      reason: 'NO_PACKS',
      industry,
      domain,
      detail: `Vara has not studied ${industry} yet — you will shape this role from scratch.`,
    };
  }

  const { matched, alternates } = matchTitle(title, candidates);

  if (!matched) {
    // Honest, and actionable: the tenant is not blocked, they just get no
    // prefill. Saying so beats a wrong shape they have to notice and undo.
    return {
      matched: false,
      reason: 'NO_FAMILY_MATCH',
      industry,
      domain,
      families_considered: candidates.length,
      detail: `No role family in ${industry} looks like "${title}". `
        + 'Vara will ask about it from scratch.',
    };
  }

  return {
    matched: true,
    title,
    family_name: matched.family_name,
    matched_title: matched.matched_title,
    score: matched.score,
    researched: matched.researched,
    pack_code: matched.pack_code,
    pack_version: matched.pack_version,
    starter: matched.starter,
    // Whose shape this is. The console says "same bar as your last one" only
    // when it is genuinely theirs — claiming that about the industry's copy
    // would be the kind of quiet overstatement rule 12 exists to stop.
    mine: matched.mine === true,
    family_id: matched.family_id ?? null,
    version: matched.version ?? null,
    // So the UI can offer "not that? try these" without a second round trip.
    alternates: alternates.map((a) => ({
      family_name: a.family_name, matched_title: a.matched_title, score: a.score,
    })),
    detail: matched.mine
      ? `${matched.family_name} is already yours — opening on your v${matched.version ?? 1}.`
      : matched.researched
        ? `Matched "${matched.matched_title}" in ${matched.family_name}, researched for ${industry}.`
        : `Matched "${matched.matched_title}" in ${matched.family_name} — a Vikuna starter shape, `
          + `not researched for ${industry}.`,
  };
}
