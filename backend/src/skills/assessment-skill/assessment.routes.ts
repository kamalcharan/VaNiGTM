/**
 * Assessment public REST routes — mounted at /api/v1/assessment
 *
 *   GET   /:slug                    → PUBLIC: published assessment definition
 *   POST  /answer                   → PUBLIC: save one answer (creates the
 *                                      response row on the first call)
 *   POST  /complete                 → PUBLIC: score a completed response
 *   POST  /capture                  → PUBLIC: turn a completed response into a lead
 *   GET   /report/:token            → PUBLIC: fetch a report by its token
 *
 * No JWT anywhere in this file, unlike every other routes file in this
 * backend — an assessment-taker is anonymous by design (App Spec's fixed
 * flow: response row on first answer -> 12 Qs -> teaser -> capture -> lead).
 * Console operations (list/manage leads, partner links) are separate,
 * authenticated skill functions in functions/ instead, going through the
 * normal JWT-gated skill executor (POST /api/v1/skills/assessment-skill/:fn)
 * — this file exists ONLY for the parts that structurally cannot have a JWT.
 *
 * NOTE: report generation (narrative, emailing) is not wired yet — GET
 * /report/:token will 404 until something creates a gt_report row. That's
 * the next piece of work, not this pass's scope.
 *
 * Mounted in server.ts, mirrors storyteller.routes.ts's public-route pattern.
 */

import { Router, type Request, type Response } from 'express';
import type { Pool } from 'pg';
import { AssessmentAgent } from './assessment.agent';

export function createAssessmentRouter(pool: Pool): Router {
  const router = Router();

  // ── GET /:slug ───────────────────────────────────────────────────────────
  router.get('/:slug', async (req: Request, res: Response) => {
    try {
      const definition = await AssessmentAgent.getPublicDefinition(pool, String(req.params.slug));
      if (!definition) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Assessment not found' } });
        return;
      }
      res.json(definition);
    } catch (err) {
      console.error('[Assessment:/:slug]', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: messageOf(err) } });
    }
  });

  // ── POST /answer ─────────────────────────────────────────────────────────
  router.post('/answer', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as {
      response_id?: string; anon_token?: string;
      service_slug?: string; question_id?: string; option_index?: number; ref?: string;
    };
    if (!body.service_slug || !body.question_id || body.option_index === undefined) {
      res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'service_slug, question_id and option_index are required' } });
      return;
    }
    try {
      const result = await AssessmentAgent.saveAnswer(pool, {
        responseId: body.response_id,
        anonToken: body.anon_token,
        serviceSlug: body.service_slug,
        questionId: body.question_id,
        optionIndex: body.option_index,
        ref: body.ref,
      });
      res.json({ response_id: result.responseId, anon_token: result.anonToken });
    } catch (err) {
      const msg = messageOf(err);
      if (msg.startsWith('ASSESSMENT_NOT_FOUND')) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: msg } });
        return;
      }
      if (msg.startsWith('RESPONSE_NOT_FOUND')) {
        res.status(409).json({ error: { code: 'RESPONSE_NOT_FOUND', message: msg } });
        return;
      }
      console.error('[Assessment:/answer]', msg);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: msg } });
    }
  });

  // ── POST /complete ───────────────────────────────────────────────────────
  router.post('/complete', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { response_id?: string; anon_token?: string };
    if (!body.response_id || !body.anon_token) {
      res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'response_id and anon_token are required' } });
      return;
    }
    try {
      const result = await AssessmentAgent.completeAssessment(pool, body.response_id, body.anon_token);
      res.json(result);
    } catch (err) {
      const msg = messageOf(err);
      if (msg.startsWith('RESPONSE_NOT_FOUND')) {
        res.status(409).json({ error: { code: 'RESPONSE_NOT_FOUND', message: msg } });
        return;
      }
      if (msg.startsWith('INCOMPLETE_RESPONSE')) {
        res.status(422).json({ error: { code: 'INCOMPLETE_RESPONSE', message: msg } });
        return;
      }
      console.error('[Assessment:/complete]', msg);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: msg } });
    }
  });

  // ── POST /capture ────────────────────────────────────────────────────────
  router.post('/capture', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as {
      response_id?: string; anon_token?: string;
      name?: string; email?: string; company?: string; role_title?: string; phone?: string;
    };
    if (!body.response_id || !body.anon_token || !body.name || !body.email || !body.company || !body.role_title) {
      res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'response_id, anon_token, name, email, company and role_title are required' },
      });
      return;
    }
    try {
      const result = await AssessmentAgent.captureLead(pool, {
        responseId: body.response_id,
        anonToken: body.anon_token,
        name: body.name,
        email: body.email,
        company: body.company,
        roleTitle: body.role_title,
        phone: body.phone,
      });
      res.json({ lead_id: result.leadId, lead_no: result.leadNo });
    } catch (err) {
      const msg = messageOf(err);
      if (msg.startsWith('RESPONSE_NOT_FOUND')) {
        res.status(409).json({ error: { code: 'RESPONSE_NOT_FOUND', message: msg } });
        return;
      }
      if (msg.startsWith('LEAD_ALREADY_CAPTURED')) {
        res.status(409).json({ error: { code: 'LEAD_ALREADY_CAPTURED', message: msg } });
        return;
      }
      console.error('[Assessment:/capture]', msg);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: msg } });
    }
  });

  // ── GET /report/:token  (PUBLIC — no JWT) ────────────────────────────────
  router.get('/report/:token', async (req: Request, res: Response) => {
    try {
      const report = await AssessmentAgent.getReportByToken(pool, String(req.params.token));
      if (!report) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found' } });
        return;
      }
      res.json(report);
    } catch (err) {
      console.error('[Assessment:/report/:token]', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: messageOf(err) } });
    }
  });

  return router;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
