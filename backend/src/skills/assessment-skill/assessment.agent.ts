/**
 * Assessment Agent — the anonymous, public-facing half of VaNi AI.
 *
 * Mirrors StorytellerAgent's shape (static methods over `pool` + resolved
 * tenantId, using createTenantDb internally) rather than the SkillContext
 * pattern the rest of this backend's functions use — there is no JWT for an
 * anonymous assessment-taker, so there is no ctx.tenant_id/user_id to read.
 * tenantId is resolved once from the fixed 'vikuna-consulting' slug (VaNi AI
 * is Vikuna's own product, not a tenant-facing GTM feature — see migration
 * 228) and cached for the process lifetime.
 *
 * The authenticated console side (list/manage leads) is plain skill
 * functions in functions/ instead — those DO have a JWT and go through the
 * normal SkillContext/registry path.
 */

import type { Pool } from 'pg';
import { createTenantDb } from '../../db';
import { scoreResponse, type AssessmentDefinition } from './scoring';

let cachedTenantId: string | null = null;

async function resolveTenantId(pool: Pool): Promise<string> {
  if (cachedTenantId) return cachedTenantId;
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM vn_tenants WHERE slug = 'vikuna-consulting'`,
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(
      'VIKUNA_CONSULTING_TENANT_NOT_FOUND: run migration 228 (creates the tenant) before using assessment-skill',
    );
  }
  cachedTenantId = row.id;
  return cachedTenantId;
}

export interface PublicDefinition {
  service_slug: string;
  version: string;
  title: string;
  short_title: string;
  estimated_minutes: number;
  landing: unknown;
  questions: unknown[];
  teaser: unknown;
  capture: unknown;
}

export class AssessmentAgent {
  /** GET /:slug — published definition only. Strips scoring internals
   * (weights, bands) that don't need to reach the client and that a
   * competitor/copycat has no reason to see verbatim. */
  static async getPublicDefinition(pool: Pool, slug: string): Promise<PublicDefinition | null> {
    const tenantId = await resolveTenantId(pool);
    const db = createTenantDb(pool, tenantId);
    const result = await db.query<{ definition: AssessmentDefinition & { service_slug: string; version: string; title: string; short_title: string; estimated_minutes: number } }>(
      `SELECT definition
         FROM gt_assessment_def
        WHERE tenant_id = $tenant_id AND is_live = true
          AND service_slug = $slug AND public = true AND is_active = true AND hold_for_review = false
        ORDER BY version DESC
        LIMIT 1`,
      { tenant_id: tenantId, slug },
    );
    const row = result.rows[0];
    if (!row) return null;
    const def = row.definition;
    return {
      service_slug: def.service_slug,
      version: def.version,
      title: def.title,
      short_title: def.short_title,
      estimated_minutes: def.estimated_minutes,
      landing: (def as any).landing,
      // Strip per-option `score` and the modes weight map — the client only
      // needs labels to render and an index to submit back.
      questions: def.questions.map((q) => ({
        id: q.id,
        context_only: q.context_only ?? false,
        framing: q.framing,
        text: q.text,
        options: q.options.map((o) => ({ label: o.label })),
      })),
      teaser: (def as any).teaser,
      capture: (def as any).capture,
    };
  }

  /**
   * First call (no responseId/anonToken) creates the response row — matches
   * the fixed flow order "response row on first answer," not on landing, so
   * nobody who loads the page and bounces leaves a row behind. `ref`, if
   * given on the first call, resolves a partner referral link
   * (?ref=rk-associates); an unknown/inactive ref is silently treated as
   * Direct rather than blocking the assessment.
   */
  static async saveAnswer(
    pool: Pool,
    params: {
      responseId?: string;
      anonToken?: string;
      serviceSlug: string;
      questionId: string;
      optionIndex: number;
      ref?: string;
    },
  ): Promise<{ responseId: string; anonToken: string }> {
    const tenantId = await resolveTenantId(pool);
    const db = createTenantDb(pool, tenantId);

    if (!params.responseId || !params.anonToken) {
      const defResult = await db.query<{ id: string }>(
        `SELECT id FROM gt_assessment_def
          WHERE tenant_id = $tenant_id AND is_live = true
            AND service_slug = $slug AND public = true AND is_active = true AND hold_for_review = false
          ORDER BY version DESC LIMIT 1`,
        { tenant_id: tenantId, slug: params.serviceSlug },
      );
      const def = defResult.rows[0];
      if (!def) throw new Error(`ASSESSMENT_NOT_FOUND: ${params.serviceSlug}`);

      let partnerId: string | null = null;
      if (params.ref) {
        const partnerResult = await db.query<{ id: string }>(
          `SELECT id FROM gt_partner
            WHERE tenant_id = $tenant_id AND is_live = true
              AND ref_code = $ref_code AND role = 'partner' AND is_active = true`,
          { tenant_id: tenantId, ref_code: params.ref },
        );
        partnerId = partnerResult.rows[0]?.id ?? null;
      }

      const result = await db.transaction(async (tx) => {
        const inserted = await tx.query<{ id: string; anon_token: string }>(
          `INSERT INTO gt_assessment_response
             (tenant_id, assessment_def_id, referred_by_partner_id, answers)
           VALUES ($tenant_id, $def_id, $partner_id, $answers::jsonb)
           RETURNING id, anon_token`,
          {
            tenant_id: tenantId,
            def_id: def.id,
            partner_id: partnerId,
            answers: JSON.stringify({ [params.questionId]: params.optionIndex }),
          },
        );
        const response = inserted.rows[0];

        await tx.query(
          `INSERT INTO gt_lead_event (tenant_id, assessment_response_id, event_type, payload)
           VALUES ($tenant_id, $response_id, 'response_started', $payload::jsonb)`,
          { tenant_id: tenantId, response_id: response.id, payload: JSON.stringify({ ref: params.ref ?? null }) },
        );

        return response;
      });

      return { responseId: result.id, anonToken: result.anon_token };
    }

    const updated = await db.query<{ id: string; anon_token: string }>(
      `UPDATE gt_assessment_response
          SET answers = answers || $patch::jsonb, updated_at = now()
        WHERE id = $response_id AND anon_token = $anon_token AND status = 'in_progress'
        RETURNING id, anon_token`,
      {
        response_id: params.responseId,
        anon_token: params.anonToken,
        patch: JSON.stringify({ [params.questionId]: params.optionIndex }),
      },
    );
    const row = updated.rows[0];
    if (!row) throw new Error('RESPONSE_NOT_FOUND: wrong id/token, or already completed');
    return { responseId: row.id, anonToken: row.anon_token };
  }

  /** Validates every scored question is answered, computes the score, persists it. */
  static async completeAssessment(
    pool: Pool,
    responseId: string,
    anonToken: string,
  ): Promise<{ health_score: number; band: string; top_modes: unknown }> {
    const tenantId = await resolveTenantId(pool);
    const db = createTenantDb(pool, tenantId);

    const result = await db.transaction(async (tx) => {
      const respResult = await tx.query<{ id: string; answers: Record<string, number>; assessment_def_id: string; tenant_id: string }>(
        `SELECT id, answers, assessment_def_id, tenant_id
           FROM gt_assessment_response
          WHERE id = $response_id AND anon_token = $anon_token AND status = 'in_progress'`,
        { response_id: responseId, anon_token: anonToken },
      );
      const response = respResult.rows[0];
      if (!response) throw new Error('RESPONSE_NOT_FOUND: wrong id/token, or already completed');

      const defResult = await tx.query<{ definition: AssessmentDefinition }>(
        `SELECT definition FROM gt_assessment_def WHERE id = $id`,
        { id: response.assessment_def_id },
      );
      const definition = defResult.rows[0].definition;

      const requiredIds = definition.questions.filter((q) => !q.context_only).map((q) => q.id);
      const answeredIds = new Set(Object.keys(response.answers ?? {}));
      const missing = requiredIds.filter((id) => !answeredIds.has(id));
      if (missing.length > 0) {
        throw new Error(`INCOMPLETE_RESPONSE: missing answers for ${missing.join(', ')}`);
      }

      const scored = scoreResponse(definition, response.answers);

      await tx.query(
        `UPDATE gt_assessment_response
            SET status = 'completed', completed_at = now(), updated_at = now(),
                health_score = $health, band = $band, top_modes = $top_modes::jsonb
          WHERE id = $response_id`,
        {
          response_id: responseId,
          health: scored.health,
          band: scored.band.key,
          top_modes: JSON.stringify(scored.top_modes),
        },
      );

      await tx.query(
        `INSERT INTO gt_lead_event (tenant_id, assessment_response_id, event_type, payload)
         VALUES ($tenant_id, $response_id, 'response_completed', $payload::jsonb)`,
        {
          tenant_id: response.tenant_id,
          response_id: responseId,
          payload: JSON.stringify({ health_score: scored.health, band: scored.band.key }),
        },
      );

      return scored;
    });

    return { health_score: result.health, band: result.band.key, top_modes: result.top_modes };
  }

  /**
   * Turns a completed, uncaptured response into a lead. Report row creation
   * and email dispatch are deliberately NOT done here — that's the next
   * piece of work (report generation + n8n/worker dispatch), this function's
   * job ends at "a lead row now exists, linked to its response."
   */
  static async captureLead(
    pool: Pool,
    params: {
      responseId: string;
      anonToken: string;
      name: string;
      email: string;
      company: string;
      roleTitle: string;
      phone?: string;
    },
  ): Promise<{ leadId: string; leadNo: string }> {
    const tenantId = await resolveTenantId(pool);
    const db = createTenantDb(pool, tenantId);

    return db.transaction(async (tx) => {
      const respResult = await tx.query<{ id: string; lead_id: string | null; referred_by_partner_id: string | null; tenant_id: string }>(
        `SELECT id, lead_id, referred_by_partner_id, tenant_id
           FROM gt_assessment_response
          WHERE id = $response_id AND anon_token = $anon_token AND status = 'completed'`,
        { response_id: params.responseId, anon_token: params.anonToken },
      );
      const response = respResult.rows[0];
      if (!response) throw new Error('RESPONSE_NOT_FOUND: wrong id/token, or not yet completed');
      if (response.lead_id) throw new Error('LEAD_ALREADY_CAPTURED');

      const leadResult = await tx.query<{ id: string; lead_no: string }>(
        `INSERT INTO gt_lead (tenant_id, partner_id, lead_no, name, email, company, role_title, phone)
         VALUES ($tenant_id, $partner_id, gt_next_seq($tenant_id::uuid, 'vani_lead'), $name, $email, $company, $role_title, $phone)
         RETURNING id, lead_no`,
        {
          tenant_id: tenantId,
          partner_id: response.referred_by_partner_id,
          name: params.name,
          email: params.email,
          company: params.company,
          role_title: params.roleTitle,
          phone: params.phone ?? null,
        },
      );
      const lead = leadResult.rows[0];

      await tx.query(
        `UPDATE gt_assessment_response SET lead_id = $lead_id, updated_at = now() WHERE id = $response_id`,
        { lead_id: lead.id, response_id: response.id },
      );

      await tx.query(
        `INSERT INTO gt_lead_event (tenant_id, assessment_response_id, lead_id, event_type, payload)
         VALUES ($tenant_id, $response_id, $lead_id, 'lead_captured', '{}'::jsonb)`,
        { tenant_id: tenantId, response_id: response.id, lead_id: lead.id },
      );

      return { leadId: lead.id, leadNo: lead.lead_no };
    });
  }

  /** GET /report/:token — bearer-capability model, same as
   * gt_presentations.share_token (storyteller-skill): security is token
   * unguessability, not row filtering. revoked_at is the one thing enforced
   * beyond the token match. Uses the RAW pool, no tenant context — same
   * reasoning as storyteller's public share route. */
  static async getReportByToken(pool: Pool, token: string) {
    const result = await pool.query<{
      ref: string | null; narrative: string | null; created_at: Date;
      health_score: number | null; band: string | null; top_modes: unknown;
      name: string; company: string;
    }>(
      `SELECT r.ref, r.narrative, r.created_at,
              resp.health_score, resp.band, resp.top_modes,
              l.name, l.company
         FROM gt_report r
         JOIN gt_assessment_response resp ON resp.id = r.assessment_response_id
         JOIN gt_lead l ON l.id = resp.lead_id
        WHERE r.report_token = $1 AND r.revoked_at IS NULL`,
      [token],
    );
    return result.rows[0] ?? null;
  }
}
