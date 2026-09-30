/**
 * Crawl before signup (Track E1, D3) — design-notes-funnel-anon-session.md.
 *
 *   submitSite   public: a visitor enters a website → their session, and the
 *                read it shares (new, reused, or in progress)
 *   siteStatus   public: poll by token → status and the teaser card
 *   runSiteRead  worker job (FUNNEL_SITE_SUBMITTED): homepage + ONE drafter call
 *   claimSite    signed in: attach the card to the new tenant
 *
 * Revisits never pay twice (D3-h): the visitor's token (layer 1), the same
 * host inside FUNNEL_REUSE_HOURS for anyone (layer 2), a read still running
 * (layer 3). Only a NEW read costs a model call, and only a new read counts
 * against the per-IP limit.
 *
 * Rule 12: a site that cannot be read says so with the real reason; nothing
 * is ever substituted. Spend: new reads run under the `vikuna-funnel` system
 * tenant, whose daily cap (FUNNEL_DAILY_TOKEN_LIMIT) is set before every new
 * read — without a spend row the cap does not exist, so it is never skipped.
 */
import { createHash, createHmac, randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import type { Pool, PoolClient } from 'pg';
import { withTenantClient } from '../db/query';
import { appendStep, setStatus } from '../agent-core/agent.runner';
import { getTokenBudget } from '../agent-core/llm.client';
import { IngestionAgent } from '../skills/ingestion-skill/ingestion.agent';
import { draftFromText, type ProfileDraft } from '../skills/profile-skill/profile.drafter';
import { getProfile, upsertProfile, type TenantProfile } from '../skills/profile-skill/profile.service';
import { FunnelError, readFunnelConfig } from './funnel.config';
import { fetchPublicHtml, normaliseSite } from './site';

export const FUNNEL_TENANT_SLUG = 'vikuna-funnel';
export const FUNNEL_EVENT = 'FUNNEL_SITE_SUBMITTED';
const MIN_TEXT_CHARS = 200;   // the same threshold ingestion escalates at

const sql = (f: string) => readFileSync(path.join(__dirname, 'queries', f), 'utf-8');
const SQL = {
  cleanup:     sql('cleanup-expired.sql'),
  byToken:     sql('session-by-token.sql'),
  reusable:    sql('reusable-read.sql'),
  ipCount:     sql('count-new-reads-by-ip.sql'),
  insertRead:  sql('insert-read.sql'),
  insertSess:  sql('insert-session.sql'),
  insertEvent: sql('insert-event.sql'),
  budget:      sql('funnel-budget.sql'),
  claimLock:   sql('claim-lock.sql'),
  claimSource: sql('claim-source.sql'),
  claimBind:   sql('claim-bind.sql'),
  markBusy:    sql('mark-busy.sql'),
  startRead:   sql('start-read.sql'),
  finishRead:  sql('finish-read.sql'),
  failRead:    sql('fail-read.sql'),
};

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

async function funnelTenantId(pool: Pool): Promise<string> {
  const r = await pool.query<{ id: string }>('SELECT id FROM vn_tenants WHERE slug = $1', [FUNNEL_TENANT_SLUG]);
  if (!r.rows[0]) {
    throw new FunnelError('FUNNEL_NOT_CONFIGURED',
      'the vikuna-funnel system tenant is missing — apply migration 261', 503);
  }
  return r.rows[0].id;
}

/** Plain transaction on a raw client: the two funnel tables have no RLS, by design (261). */
async function inTx<T>(pool: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => { /* connection is discarded */ });
    throw e;
  } finally {
    c.release();
  }
}

/* ── What the visitor sees ───────────────────────────────────────────────── */

export interface Card {
  product_name: string | null;
  product_tagline: string | null;
  product_category: string | null;
  product_description: string | null;
}

export interface SiteStatus {
  status: 'reading' | 'read' | 'failed';
  site: string;
  card: Card | null;
  /** The real reason, when failed (rule 12). */
  failure: string | null;
  claimed: boolean;
}

function toStatus(row: { website_host: string; status: string; failure: string | null; draft: ProfileDraft | null;
  read_created_at?: Date; bound_at?: Date | null }, timeoutMinutes: number): SiteStatus {
  const stale = (row.status === 'queued' || row.status === 'reading') && row.read_created_at
    && Date.now() - new Date(row.read_created_at).getTime() > timeoutMinutes * 60_000;
  const status: SiteStatus['status'] = stale ? 'failed'
    : row.status === 'read' ? 'read' : row.status === 'failed' ? 'failed' : 'reading';
  const d = row.draft;
  return {
    status,
    site: row.website_host,
    card: status === 'read' && d ? {
      product_name: d.product_name ?? null,
      product_tagline: d.product_tagline ?? null,
      product_category: d.product_category ?? null,
      product_description: d.product_description ?? null,
    } : null,
    failure: stale ? 'Reading this site took too long — please try again.' : (status === 'failed' ? row.failure : null),
    claimed: !!row.bound_at,
  };
}

/* ── Submit ──────────────────────────────────────────────────────────────── */

export async function submitSite(
  pool: Pool,
  input: { website: string; ip: string; token?: string | null },
): Promise<SiteStatus & { token: string; reused: 'session' | 'site' | 'in_progress' | 'new' }> {
  const cfg = readFunnelConfig();
  const site = normaliseSite(input.website);
  const ipHash = createHmac('sha256', cfg.ipHashKey).update(String(input.ip ?? '')).digest('hex');

  // Layer 1 — the same visitor, same browser, same site: their own session.
  if (input.token) {
    const own = (await pool.query(SQL.byToken, [hashToken(input.token)])).rows[0];
    if (own && !own.expired && own.website_host === site.host) {
      return { ...toStatus(own, cfg.readTimeoutMinutes), token: input.token, reused: 'session' };
    }
  }

  const tenant = await funnelTenantId(pool);
  const token = randomBytes(32).toString('base64url');

  const result = await inTx(pool, async (c) => {
    await c.query(SQL.cleanup, [cfg.reuseHours]);
    // One decision per host at a time, so two visitors a second apart share
    // one read instead of paying for two.
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`vani-funnel:${site.host}`]);

    // Layers 2 and 3 — anyone's read of this host: finished and recent, or running.
    const shared = (await c.query<{ id: string; status: string }>(SQL.reusable,
      [site.host, cfg.reuseHours, cfg.readTimeoutMinutes])).rows[0];
    if (shared) {
      await c.query(SQL.insertSess, [hashToken(token), shared.id, ipHash, false, cfg.sessionDays]);
      return { readId: shared.id, reused: (shared.status === 'read' ? 'site' : 'in_progress') as 'site' | 'in_progress' };
    }

    // A NEW read — the only thing that costs a model call.
    const n = (await c.query<{ n: number }>(SQL.ipCount, [ipHash])).rows[0].n;
    if (n >= cfg.maxPerIpPerHour) {
      throw new FunnelError('RATE_LIMITED',
        `you have previewed ${n} new websites in the last hour — please try again later`, 429);
    }
    const readId = (await c.query<{ id: string }>(SQL.insertRead, [site.host, site.url])).rows[0].id;
    await c.query(SQL.insertSess, [hashToken(token), readId, ipHash, true, cfg.sessionDays]);
    await c.query(SQL.insertEvent, [tenant, FUNNEL_EVENT, JSON.stringify({ site_read_id: readId })]);
    return { readId, reused: 'new' as const };
  });

  if (result.reused === 'new') {
    // The cap before the spend: written after the rows commit is fine — the
    // job cannot run before this request returns. Its own transaction because
    // gt_tenant_context is RLS-scoped to the funnel tenant.
    await withTenantClient(pool, tenant, (c) => c.query(SQL.budget, [tenant, cfg.dailyTokenLimit]));
    // Read AFTER the row above has committed — getTokenBudget uses its own
    // connection, and an uncommitted row reads as "no cap".
    const budget = await getTokenBudget(pool, tenant);
    if (budget.capped && budget.remaining <= 0) {
      // Visible, and the read is marked failed so nobody waits on it.
      await pool.query(SQL.markBusy, [result.readId, 'VaNi is busy right now — please try again later.']);
    }
  }

  const row = (await pool.query(SQL.byToken, [hashToken(token)])).rows[0];
  return { ...toStatus(row, cfg.readTimeoutMinutes), token, reused: result.reused };
}

/* ── Status ──────────────────────────────────────────────────────────────── */

export async function siteStatus(pool: Pool, token: string): Promise<SiteStatus> {
  const cfg = readFunnelConfig();
  const row = (await pool.query(SQL.byToken, [hashToken(String(token ?? ''))])).rows[0];
  if (!row || row.expired) throw new FunnelError('NOT_FOUND', 'this preview has expired — enter your website again', 404);
  return toStatus(row, cfg.readTimeoutMinutes);
}

/* ── The worker job ──────────────────────────────────────────────────────── */

/** Public wording for a failure: the real cause, without internals. */
function publicFailure(e: Error): string {
  const m = e.message;
  if (e instanceof FunnelError) return m.replace(/^[A-Z_]+: /, '');
  if (m.startsWith('TOKEN_BUDGET_EXCEEDED')) return 'VaNi is busy right now — please try again later.';
  if (m.startsWith('LLM_')) return 'VaNi could not finish reading the site right now — please try again later.';
  if (m.startsWith('URL_EMPTY_CONTENT') || m.startsWith('N8N') || m.includes('render')) {
    return 'This site shows almost no readable text, even when rendered. Sign up and paste your website copy instead.';
  }
  return `VaNi could not read the site: ${m.slice(0, 200)}`;
}

export async function runSiteRead(pool: Pool, tenantId: string, payload: Record<string, unknown>, runId: string): Promise<void> {
  const readId = String(payload.site_read_id ?? '');
  const claimed = await pool.query<{ website_url: string; website_host: string }>(SQL.startRead, [readId]);
  const row = claimed.rows[0];
  if (!row) {
    // Already read, failed (e.g. the budget was spent), or deleted: nothing to do.
    await setStatus(pool, runId, 'completed', { output: { skipped: true, site_read_id: readId } });
    return;
  }

  try {
    const fetched = await fetchPublicHtml(row.website_url);
    let text = IngestionAgent.extractFromHtml(fetched.html).text;
    await appendStep(pool, runId, { step_name: 'read_homepage', action: `Read ${row.website_host}`,
      output_summary: `${text.length} chars of readable text`, status: 'ok' });

    if (text.length < MIN_TEXT_CHARS) {
      // Escalation, not a fallback — the same rule ingestion follows.
      await appendStep(pool, runId, { step_name: 'render_page',
        action: 'Static read too thin — rendering the page in a headless browser (n8n)', status: 'ok' });
      text = IngestionAgent.extractFromHtml(await IngestionAgent.renderPageViaN8n(fetched.finalUrl)).text;
      if (text.length < MIN_TEXT_CHARS) {
        throw new Error(`URL_EMPTY_CONTENT: ${row.website_host} yielded ${text.length} chars even after rendering`);
      }
    }

    const draft = await draftFromText(pool, tenantId, text, runId);
    if (!draft.product_name && !draft.product_description) {
      throw new FunnelError('SITE_UNCLEAR', 'VaNi could not tell from this page what the company does');
    }
    await pool.query(SQL.finishRead, [readId, text, JSON.stringify(draft), runId]);
    await setStatus(pool, runId, 'completed', { output: { site: row.website_host, product_name: draft.product_name ?? null } });
  } catch (e) {
    const err = e as Error;
    await pool.query(SQL.failRead, [readId, publicFailure(err), runId]);
    throw err;   // the run and the event record the real error too (rule 12)
  }
}

/* ── Claim ───────────────────────────────────────────────────────────────── */

const PROFILE_KEYS = ['product_name', 'product_tagline', 'product_category', 'product_description',
  'core_problem', 'key_differentiators', 'icp_role', 'icp_company_type', 'icp_industry',
  'primary_pain_points'] as const;

const isEmpty = (v: unknown) => v === null || v === undefined
  || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

export interface ClaimResult {
  site: string;
  source_id: string;
  /** false when the card could not be written; the full crawl still runs and drafts it. */
  profile_applied: boolean;
  detail?: string;
  already_claimed?: boolean;
}

/**
 * Attach a visitor's read to the tenant that just signed up. The claim
 * itself — lock the session, create the tenant's knowledge source, queue the
 * full crawl, mark the session bound — is ONE transaction. The card is then
 * written with the normal profile upsert (fill only empty fields), which has
 * its own transaction; if that step fails the claim still stands and the full
 * crawl drafts the profile anyway, and the result says so (rule 12).
 */
export async function claimSite(pool: Pool, tenantId: string, token: string): Promise<ClaimResult> {
  const tokenHash = hashToken(String(token ?? ''));

  const claim = await inTx(pool, async (c) => {
    const s = (await c.query(SQL.claimLock, [tokenHash])).rows[0];
    if (!s || s.expired) throw new FunnelError('NOT_FOUND', 'this preview has expired or does not exist', 404);
    if (s.bound_tenant_id && s.bound_tenant_id !== tenantId) {
      throw new FunnelError('ALREADY_CLAIMED', 'this preview belongs to another workspace', 409);
    }
    if (s.bound_tenant_id === tenantId) return { ...s, already: true, sourceId: null as string | null };
    if (s.status !== 'read') {
      throw new FunnelError('NOT_READY', 'this preview has nothing to keep — start the Mission Wizard with your website', 409);
    }

    // The claiming tenant's context, AFTER BEGIN (set_tenant_context is
    // transaction-local): gt_kb_sources is RLS-scoped.
    await c.query('SELECT set_tenant_context($1)', [tenantId]);
    const url = `https://${s.website_host}/`;
    const sourceId = (await c.query<{ id: string }>(SQL.claimSource, [tenantId, url, s.website_host])).rows[0].id;
    await c.query(SQL.insertEvent, [tenantId, 'URL_SUBMITTED', JSON.stringify({ source_id: sourceId, url, from: 'funnel' })]);
    await c.query(SQL.claimBind, [s.id, tenantId]);
    return { ...s, already: false, sourceId };
  });

  if (claim.already) {
    return { site: claim.website_host, source_id: '', profile_applied: true, already_claimed: true };
  }

  try {
    const existing = await getProfile(pool, tenantId);
    const draft = (claim.draft ?? {}) as ProfileDraft;
    const fill: Partial<TenantProfile> = {};
    for (const k of PROFILE_KEYS) {
      const v = (draft as Record<string, unknown>)[k];
      if (!isEmpty(v) && isEmpty(existing?.[k as keyof TenantProfile])) (fill as Record<string, unknown>)[k] = v;
    }
    if (Object.keys(fill).length) {
      fill.source = 'vani';
      await upsertProfile(pool, tenantId, fill, 'vani', 'website preview before signup');
    }
    return { site: claim.website_host, source_id: claim.sourceId!, profile_applied: true };
  } catch (e) {
    const detail = (e as Error).message;
    console.error('[Funnel:claim] claimed, but the card could not be written:', detail);
    return { site: claim.website_host, source_id: claim.sourceId!, profile_applied: false, detail };
  }
}
