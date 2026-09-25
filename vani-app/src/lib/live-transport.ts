'use client';

/**
 * The live skill transport. This is the swap the whole seam exists for: screens
 * written against the mock keep working, and nothing above this file changes.
 *
 * ── Two surfaces, and the honest reason there are two ─────────────────────
 *
 * The rule is "auth is the only non-generic surface". Onboarding makes it two,
 * and that is a decision rather than a leak: onboarding is a PLATFORM concern
 * like auth — it gates access to the product rather than doing tenant business
 * work — and it needs one endpoint per atomic outcome, which is exactly what a
 * generic `(skill, fn, params)` runner cannot express. Its step endpoint commits
 * a payload and a completion mark in one transaction.
 *
 * So platform surfaces get an explicit table below. Everything else goes to the
 * generic runner. The table is the list of exceptions, in one place, countable —
 * if it grows past a handful, the rule is being eroded and that is worth an
 * argument rather than another row.
 */

import { API_ORIGIN, ApiError, apiRequest } from './api-client';
import type { SkillResult, SkillTransport } from './useSkill';
import { PREVIEW_FUNCTIONS } from './preview';

type PlatformCall = {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
};

/**
 * Platform surfaces that are not generic skills. Each entry maps a
 * `(skill, fn)` pair onto its real endpoint.
 */
const PLATFORM_ROUTES: Record<string, (params: Record<string, unknown>) => PlatformCall> = {
  'onboarding.status': (p) => ({
    method: 'GET',
    path: `/api/v1/onboarding/status?lane=${encodeURIComponent(String(p.lane ?? 'vani'))}`,
  }),
  'onboarding.complete_step': (p) => ({
    method: 'PATCH',
    path: '/api/v1/onboarding/step',
    // The step's payload and its completion travel together, because the server
    // commits them together. Splitting them here would recreate the half-apply
    // this endpoint exists to prevent.
    body: {
      lane: p.lane,
      step_id: p.step_id,
      status: 'completed',
      data: p.data ?? {},
    },
  }),
  // Auth is the one non-generic surface (CLAUDE.md §6), so its writes are
  // declared here rather than routed to the generic skill runner, which would
  // 404 on /api/v1/skills/auth/invite.
  'auth.invite': (p) => ({
    method: 'POST',
    path: '/api/v1/auth/invite',
    body: { invitations: p.invitations },
  }),
  // The ETL import is a REST router with a multipart upload, which no JSON
  // skill call can carry — so it stays REST. The upload itself goes through
  // apiRequest with a FormData body (gtm-audience/useImport.ts); the three
  // JSON steps after it are declared here so they keep useSkillMutation's
  // guarantees. nginx must expose /api/v1/etl/ for any of this to reach the
  // API (deploy/vani-main-vps/api.vikuna.io.conf).
  'etl.headers': (p) => ({
    method: 'GET',
    path: `/api/v1/etl/headers/${encodeURIComponent(String(p.file_id))}`,
  }),
  'etl.create_session': (p) => ({
    method: 'POST',
    path: '/api/v1/etl/sessions',
    body: p,
  }),
  'etl.process': (p) => ({
    method: 'POST',
    path: `/api/v1/etl/sessions/${encodeURIComponent(String(p.session_id))}/process`,
  }),
};

export const liveTransport: SkillTransport = async (skill, fn, params) => {
  const key = `${skill}.${fn}`;

  // useSkillMutation puts the idempotency key in params; it belongs in a header,
  // not in the body, so lift it out before anything is sent.
  const { idempotency_key: idempotencyKey, ...rest } = params as Record<string, unknown> & {
    idempotency_key?: string;
  };

  // UX preview: a screen whose backend does not exist yet is answered from
  // its fixture, stamped so the shell can say so. See lib/preview.ts.
  const preview = PREVIEW_FUNCTIONS[key];
  if (preview) {
    await new Promise((r) => setTimeout(r, 120));
    try {
      return { success: true, skill, function: fn, data: preview(rest), preview: true } as SkillResult;
    } catch (err) {
      return { success: false, skill, function: fn, data: null, error: err instanceof Error ? err.message : 'Preview failed', preview: true } as SkillResult;
    }
  }

  const route = PLATFORM_ROUTES[key];

  try {
    if (route) {
      const call = route(rest);
      const data = await apiRequest<unknown>(call.method, call.path, {
        body: call.body,
        idempotencyKey,
      });
      // Platform endpoints answer with plain JSON. Wrap it so every screen sees
      // one envelope regardless of which surface answered.
      return { success: true, skill, function: fn, data } as SkillResult;
    }

    // The generic runner already answers in SkillResult shape — including
    // `success: false` on a refusal, which DataBoundary and useSkillMutation
    // both check. Pass it through rather than re-wrapping and losing that.
    const result = await apiRequest<SkillResult>(
      'POST',
      `/api/v1/skills/${encodeURIComponent(skill)}/${encodeURIComponent(fn)}`,
      { body: { params: rest }, idempotencyKey },
    );
    // The server's envelope wins; only fill in what it omitted. Spreading it
    // over defaults would have made the defaults dead code, which is what
    // TS2783 pointed out when they were written the other way round.
    return {
      ...result,
      skill: result.skill ?? skill,
      function: result.function ?? fn,
    };
  } catch (err) {
    // A thrown ApiError becomes success:false rather than an exception, so the
    // two failure modes reach screens through one path.
    return {
      success: false,
      skill,
      function: fn,
      data: null,
      error: err instanceof ApiError ? err.message : 'The request failed.',
    };
  }
};

/** True when there is an API to talk to. Unset origin means mock. */
export const IS_LIVE = !!API_ORIGIN;
