/**
 * What Vara offers a visitor on the tenant's own site.
 *
 * Owned by Vara, consumed by the platform embed. The split matters: the
 * platform decides WHERE the widget runs and WHO may boot it; each agent
 * decides WHAT it has to say. Vara's answer is its published JDs.
 *
 * Only the PUBLIC half of the current version ships. The scoring contract —
 * must_haves weights, knockouts, threshold — stays server-side; publishing the
 * weights would tell a candidate exactly what to claim, which is the one thing
 * that makes the score meaningless.
 */

import type { Pool } from 'pg';

export interface VaraOffer {
  id: string;
  title: string;
  one_liner: string | null;
  description: string | null;
  employment_type: string | null;
  onsite_pct: number | null;
  locations: string[] | null;
  band: string | null;
}

export async function varaOffers(pool: Pool, vaniTenantId: string): Promise<VaraOffer[]> {
  // LEFT JOIN so a JD whose version row is somehow missing still lists with
  // nulls rather than vanishing from the widget without explanation.
  const r = await pool.query(
    `SELECT jd.id, jd.title,
            ver.facts ->> 'one_liner'       AS one_liner,
            ver.facts ->> 'description'     AS description,
            ver.facts ->> 'employment_type' AS employment_type,
            ver.facts ->  'onsite_pct'      AS onsite_pct,
            ver.facts ->  'locations'       AS locations,
            ver.facts ->> 'band'            AS band
       FROM vara_jd jd
       LEFT JOIN vara_jd_version ver ON ver.id = jd.current_version_id
      WHERE jd.tenant_id = $1 AND jd.status = 'published'
      ORDER BY jd.created_at DESC`,
    [vaniTenantId],
  );
  return r.rows as VaraOffer[];
}
