/**
 * contact-skill: get_prospect_contacts
 *
 * Every contact promoted onto ONE company, with each contact's channels
 * and the URL that evidenced each channel.
 *
 * A separate function from get_contacts on purpose. get_contacts is the
 * global list — search, pagination, all channels flattened onto primary
 * columns. This is the drawer's "the person" section, keyed on prospect,
 * and it needs the channels as an array (a person often has more than
 * one) with source_url attached so R-C1's evidence is readable at a
 * glance.
 *
 * Widening get_contacts to accept prospect_id would work — but it would
 * mean every screen using it now has to reason about a prospect-scoped
 * variant, and the shape (channels as array vs primary_email/mobile) is
 * different enough that one function serving both is a lie.
 */

import { SkillContext } from '../../../shared/types';

interface GetProspectContactsParams {
  prospect_id: number;
}

export async function get_prospect_contacts(
  params: GetProspectContactsParams, ctx: SkillContext,
) {
  const prospectId = Number(params.prospect_id);
  if (!Number.isFinite(prospectId)) throw new Error('prospect_id is required');

  const res = await ctx.db.query<Record<string, unknown>>(
    // tenant_id + is_live in the WHERE are the authorisation — a prospect
    // id from another tenant matches nothing.
    `SELECT c.id::text,
            c.name,
            c.job_title,
            c.source,
            c.brief_id::text,
            c.contact_no,
            c.created_at,
            COALESCE(json_agg(
              json_build_object(
                'id',              ch.id,
                'channel_type',    ch.channel_type,
                'channel_value',   ch.channel_value,
                'channel_subtype', ch.channel_subtype,
                'is_primary',      ch.is_primary,
                'source_url',      ch.source_url
              ) ORDER BY ch.is_primary DESC, ch.id
            ) FILTER (WHERE ch.id IS NOT NULL), '[]'::json) AS channels
       FROM gt_contacts c
       LEFT JOIN gt_contact_channels ch
         ON ch.contact_id = c.id
        AND ch.tenant_id  = c.tenant_id
        AND ch.is_live    = c.is_live
      WHERE c.prospect_id = $prospect_id
        AND c.tenant_id   = $tenant_id
        AND c.is_live     = $is_live
        AND c.is_active   = true
      GROUP BY c.id
      ORDER BY c.created_at`,
    { prospect_id: prospectId, tenant_id: ctx.tenant_id, is_live: ctx.is_live },
  );

  return {
    contacts: res.rows.map((r) => ({
      ...r,
      id: Number(r.id),
      brief_id: r.brief_id === null ? null : Number(r.brief_id),
    })),
    total: res.rows.length,
    recipe: 'contact-detail' as const,
  };
}
