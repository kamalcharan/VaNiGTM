/**
 * Who may see a generated pack, and when.
 *
 * `vani_domain_pack` is PLATFORM data — one row is visible to every tenant in
 * an industry — so the original design parked a finished draft at `awaiting`
 * and waited for an operator to run `npm run packs --publish`. That is the
 * right instinct and the wrong mechanism: run 92 sat overnight, and the tenant
 * who triggered the 20-minute research got nothing out of it. A pipeline that
 * ends at a person inside Vikuna is a pipeline every tenant is stuck behind
 * (user ruling, 2026-09-17: "it should be user driven else everything will
 * get stuck").
 *
 * The filter that suggests itself — show an unreviewed pack only to the tenant
 * who asked — is worse than it looks. The SECOND tenant in that industry then
 * sees nothing AND cannot research it, because the claim correctly says the
 * industry has already been studied. Requester-scoping strands everyone who
 * did not ask first.
 *
 * So: three states, and the state is a LABEL rather than a gate.
 *
 *   unreviewed  published and visible, marked as not yet read by Vikuna
 *   reviewed    a human at Vikuna has read it and promoted it
 *   retired     withdrawn; visible to nobody
 *
 * What still protects tenants from a bad generated pack:
 *   - `assertNoTemplateLeak` refuses a draft before it is ever written
 *   - the label, surfaced in the console, so "researched" and "researched and
 *     checked" never read the same (rule 12: nothing degraded passes as real)
 *   - `--retire`, which withdraws one without deleting it
 *
 * `requested_by` records who paid for the run. It is provenance, not a filter.
 * It holds the **vn_tenants.id** — the id the event and `gt_agent_runs` carry
 * — NOT the `vani_tenant.id` the rest of the spine uses. `vani_domain_pack` is
 * platform-scoped with no tenant FK, so nothing joins on it; using the id the
 * caller already has avoids a bridge lookup that could only go wrong.
 */

export type ReviewState = 'unreviewed' | 'reviewed' | 'retired';

/**
 * `IS DISTINCT FROM` rather than `<>` on purpose: migration 244's seeded packs
 * have no `researched` block at all, so the expression is NULL for them, and
 * `NULL <> 'retired'` is NULL — which would silently hide every hand-written
 * starter pack the moment this shipped.
 */
export const NOT_RETIRED = `payload -> 'researched' ->> 'review_state' IS DISTINCT FROM 'retired'`;

/**
 * The visible packs of one domain, latest version per code.
 *
 * ORDER MATTERS AND IT IS NOT OBVIOUS. Packs are append-only, so retiring one
 * writes a NEW version carrying `retired` — and every reader takes
 * `DISTINCT ON (code) ORDER BY version DESC`. Applying NOT_RETIRED as a plain
 * WHERE therefore filters out the retired v2 and lets DISTINCT ON fall back to
 * v1, RESURRECTING the pack that was just withdrawn. The retirement would look
 * like it worked — the row count drops by one — while the tenant still sees
 * the family.
 *
 * So the latest version is chosen FIRST and the state is judged after. This
 * exists as one function because the bug is invisible at every call site and
 * four of them would have to get it right independently.
 */
export function visiblePacksOfDomain(domainRef: string): string {
  return `SELECT code, version, domain, payload FROM (
            SELECT DISTINCT ON (code) code, version, domain, payload
              FROM vani_domain_pack
             WHERE domain = ${domainRef}
               AND payload -> 'vara' -> 'starter' IS NOT NULL
             ORDER BY code, version DESC
          ) latest
          WHERE ${NOT_RETIRED}`;
}

/** The same rule for a lookup by family name rather than domain. */
export function visiblePackOfFamily(nameRef: string): string {
  return `SELECT code, version, domain, payload FROM (
            SELECT code, version, domain, payload
              FROM vani_domain_pack
             WHERE payload ->> 'family_name' = ${nameRef}
               AND payload -> 'vara' -> 'starter' IS NOT NULL
             ORDER BY version DESC LIMIT 1
          ) latest
          WHERE ${NOT_RETIRED}`;
}

/** Provenance of a pack row, for the console and the operator CLI. */
export interface PackProvenance {
  researched: boolean;
  review_state: ReviewState | null;
  requested_by: string | null;
  at: string | null;
}

export function provenanceOf(payload: Record<string, any>): PackProvenance {
  const r = payload?.researched;
  if (!r) return { researched: false, review_state: null, requested_by: null, at: null };
  return {
    researched: true,
    // A researched pack written before this file existed has no review_state.
    // It was published by an operator through the old --publish path, so
    // 'reviewed' is the truth about it, not a guess.
    review_state: (r.review_state as ReviewState) ?? 'reviewed',
    requested_by: r.requested_by ?? null,
    at: r.at ?? null,
  };
}
