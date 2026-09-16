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
    `SELECT DISTINCT ON (code) code, version, payload
       FROM vani_domain_pack
      WHERE domain = $domain AND payload -> 'vara' -> 'starter' IS NOT NULL
      ORDER BY code, version DESC`,
    { domain },
  );

  const candidates: PackCandidate[] = packs.rows.map((r) => ({
    pack_code: r.code,
    pack_version: r.version,
    family_name: r.payload.family_name,
    suggested_titles: r.payload.suggested_titles ?? [],
    researched: r.payload.researched != null,
    starter: r.payload.vara.starter,
  }));

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
    // So the UI can offer "not that? try these" without a second round trip.
    alternates: alternates.map((a) => ({
      family_name: a.family_name, matched_title: a.matched_title, score: a.score,
    })),
    detail: matched.researched
      ? `Matched "${matched.matched_title}" in ${matched.family_name}, researched for ${industry}.`
      : `Matched "${matched.matched_title}" in ${matched.family_name} — a Vikuna starter shape, `
        + `not researched for ${industry}.`,
  };
}
