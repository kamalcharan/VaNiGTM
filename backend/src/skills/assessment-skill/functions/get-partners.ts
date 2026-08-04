/**
 * assessment-skill: get_partners
 *
 * Owner-only. The referral partners in this tenant, their lead counts, and
 * the assessments their links can point at — everything the console's
 * partner-links screen renders.
 *
 * A partner has exactly one link and no one else's to see, so this refuses
 * them outright rather than returning a single self row. The console also
 * hides the nav item for partners, but hiding a nav item is not access
 * control — this is.
 *
 * NOTE (Phase C3): this is a fifth function beyond the four C3 named. The
 * partner-links screen was also explicitly asked for, and none of those
 * four can list partners, so the screen could not exist without it. Kept
 * read-only and minimal for that reason — partner CRUD is still done by
 * hand in SQL.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';
import { resolvePartnerContext } from '../partner-context';

const GET_PARTNERS_SQL = fs.readFileSync(path.join(__dirname, '../queries/get-partners.sql'), 'utf-8');
const GET_ASSESSMENTS_SQL = `
  SELECT service_slug, definition->>'short_title' AS short_title
    FROM gt_assessment_def
   WHERE tenant_id = $tenant_id AND is_live = $is_live
     AND is_active = true AND public = true
   ORDER BY service_slug`;

interface PartnerRow {
  id: string;
  ref_code: string | null;
  display_name: string;
  role: string;
  is_active: boolean;
  created_at: Date;
  email: string;
  lead_count: number;
  last_lead_at: Date | null;
}

export async function get_partners(_params: Record<string, never>, ctx: SkillContext) {
  const access = await resolvePartnerContext(ctx);
  if (access.role !== 'owner') {
    throw new Error('OWNER_ONLY: partner links are visible to the owner only');
  }

  const partners = await ctx.db.query<PartnerRow>(GET_PARTNERS_SQL, {
    $tenant_id: ctx.tenant_id,
    $is_live: ctx.is_live,
  });

  // The assessments a link can point at. Returned so the screen builds
  // /a/<slug>?ref=<code> without hardcoding any slug — a second assessment
  // is a config row, and its links should appear here with no code change.
  const assessments = await ctx.db.query<{ service_slug: string; short_title: string | null }>(
    GET_ASSESSMENTS_SQL, { $tenant_id: ctx.tenant_id, $is_live: ctx.is_live },
  );

  return {
    partners: partners.rows,
    assessments: assessments.rows,
    recipe: 'partner-list',
  };
}
