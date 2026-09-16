/**
 * Canonical industry slug.
 *
 * `vn_tenant_profiles.industry` is free text a human typed: "Technology &
 * SaaS", "technology - saas", "Tech / SaaS" all mean the same thing.
 * `vani_domain_pack.domain` is a slug. This is the single deterministic
 * mapping between the two.
 *
 * It lived privately inside vara.routes.ts, which was right while one caller
 * used it. Three now do — the JD family lookup, the onboarding trigger that
 * requests enrichment, and the agent that fulfils the request — and they MUST
 * agree. If the trigger slugged "Tech / SaaS" differently from the lookup, the
 * pack would be researched under one key and searched for under another, and
 * the only symptom would be a tenant who never gets recommendations.
 *
 * Pure and dependency-free so a seed migration can reproduce it by hand.
 */

/** lowercase → strip accents → &,/ become word breaks → non-alnum runs to '-'. */
export function slugifyIndustry(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')   // strip combining marks
    .replace(/[&/]/g, ' ')             // ampersand and slash become word breaks, not "and"
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
