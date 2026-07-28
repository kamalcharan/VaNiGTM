/**
 * prospect-skill: get_prospect
 *
 * ONE company, in full. The list view necessarily shows a handful of columns;
 * this is the record itself — every mapped field, every column the source file
 * carried (including ones no field map claimed, like a membership number or a
 * fax), the people at that company, and its tags.
 *
 * A partial view of imported data is close to useless: the point of importing
 * a directory is that it holds more than a name and a city.
 */

import { SkillContext } from '../../../shared/types';

interface GetProspectParams {
  prospect_id: number;
}

export async function get_prospect(params: GetProspectParams, ctx: SkillContext) {
  if (!Number.isFinite(Number(params.prospect_id))) {
    throw new Error('prospect_id is required');
  }

  const p = await ctx.db.query<Record<string, unknown>>(
    `SELECT p.*,
            l.label AS load_label,
            l.as_of AS load_as_of,
            ds.code AS source_code
     FROM   gt_prospects p
     LEFT   JOIN gt_source_loads l  ON l.id = p.load_id
     LEFT   JOIN gt_data_sources ds ON ds.id = l.source_id
     WHERE  p.id = $prospect_id
       AND  p.tenant_id = $tenant_id
       AND  p.is_live = $is_live`,
    { $prospect_id: params.prospect_id, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live },
  );

  const prospect = p.rows[0];
  if (!prospect) throw new Error('Company not found');

  // The people at this company, with their channels. FTCCI carries up to
  // three representatives per member, so this is not a rare case.
  const people = await ctx.db.query<Record<string, unknown>>(
    `SELECT c.id, c.name, c.job_title, c.linkedin_url, c.location,
            COALESCE(
              json_agg(json_build_object('type', ch.channel_type, 'value', ch.channel_value)
                       ORDER BY ch.is_primary DESC) FILTER (WHERE ch.id IS NOT NULL),
              '[]'::json
            ) AS channels
     FROM   gt_contacts c
     LEFT   JOIN gt_contact_channels ch
            ON ch.contact_id = c.id AND ch.is_active = true
     WHERE  c.prospect_id = $prospect_id
       AND  c.tenant_id = $tenant_id
       AND  c.is_live = $is_live
       AND  c.is_active = true
     GROUP  BY c.id
     ORDER  BY c.id`,
    { $prospect_id: params.prospect_id, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live },
  );

  const tags = await ctx.db.query<Record<string, unknown>>(
    `SELECT t.id, t.label, src.inherited
     FROM (
        SELECT pt.tag_id, false AS inherited
        FROM   gt_prospect_tags pt WHERE pt.prospect_id = $prospect_id
        UNION
        SELECT lt.tag_id, true
        FROM   gt_load_tags lt
        JOIN   gt_prospects p2 ON p2.load_id = lt.load_id
        WHERE  p2.id = $prospect_id
     ) src
     JOIN gt_tags t ON t.id = src.tag_id AND t.is_active = true
     ORDER BY t.label`,
    { $prospect_id: params.prospect_id },
  );

  return {
    prospect,
    people: people.rows,
    tags: tags.rows,
    /**
     * Every column the source file carried, untouched. gt_prospects.raw holds
     * the ORIGINAL row — the landing step used to store the mapped projection
     * instead, which quietly discarded anything no field map claimed.
     */
    source_row: (prospect.raw as Record<string, unknown>) ?? {},
    recipe: 'prospect-profile' as const,
  };
}
