/**
 * Crawl before signup (Track E1, D3) — design-notes-funnel-anon-session.md.
 *
 *   submitSite   public: a visitor enters a website → their session, and the
 *                read it shares (new, reused, or in progress)
 *   siteStatus   public: poll by token → status and the teaser card
 *   runSiteRead  worker job (FUNNEL_SITE_SUBMITTED): homepage → the card (ONE
 *                drafter call), the digital audit (no call) and the graph
 *                (≤ FUNNEL_GRAPH_MAX_CHUNKS extraction calls) — 262
 *   claimSite    signed in: attach the card and the graph to the new tenant
 *   requestAccess public: the closed-beta Request access form → a lead in
 *                the FUNNEL_LEADS_TENANT_SLUG workspace
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
import { FunnelError, readFunnelConfig, readLeadsTenantSlug } from './funnel.config';
import { fetchPublicHtml, normaliseSite } from './site';
import { readSiteGraph, type SiteGraph } from './site-graph';
import { upsertEdge, upsertNode } from '../agent-core/kg.store';

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
  accessIp:     sql('access-count-by-ip.sql'),
  accessReplay: sql('access-replay.sql'),
  accessLead:   sql('access-find-lead.sql'),
  accessNewLead: sql('access-insert-lead.sql'),
  accessEvent:  sql('access-insert-event.sql'),
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

/** The five checks IngestionAgent.analyzeSiteHealth measures on the static page. */
export interface Audit { present: string[]; missing: string[] }

export interface SiteStatus {
  status: 'reading' | 'read' | 'failed';
  site: string;
  card: Card | null;
  /** The real reason, when failed (rule 12). */
  failure: string | null;
  claimed: boolean;
  /** 262. Null on reads made before it, and until the read is done. */
  audit: Audit | null;
  graph: { nodes: SiteGraphNodes; edges: SiteGraphEdges; partial: boolean } | null;
  /** The card read but the graph did not — the reason, shown under the card. */
  graph_failure: string | null;
  read_at: string | null;
}
type SiteGraphNodes = Extract<SiteGraph, { status: 'read' }>['nodes'];
type SiteGraphEdges = Extract<SiteGraph, { status: 'read' }>['edges'];

function toStatus(row: { website_host: string; status: string; failure: string | null; draft: ProfileDraft | null;
  audit?: Audit | null; graph?: SiteGraph | null; finished_at?: Date | null;
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
    audit: status === 'read' && row.audit ? { present: row.audit.present, missing: row.audit.missing } : null,
    graph: status === 'read' && row.graph?.status === 'read'
      ? { nodes: row.graph.nodes, edges: row.graph.edges, partial: row.graph.truncated || row.graph.chunks_read < row.graph.chunks_total }
      : null,
    graph_failure: status === 'read' && row.graph?.status === 'failed' ? row.graph.failure : null,
    read_at: status === 'read' && row.finished_at ? new Date(row.finished_at).toISOString() : null,
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
    const cfg = readFunnelConfig();
    const fetched = await fetchPublicHtml(row.website_url);
    const staticRead = IngestionAgent.extractFromHtml(fetched.html);
    let text = staticRead.text;
    // The digital audit is measured on the STATIC page — what search engines
    // and AI answer engines see — even when the text comes from a render.
    const audit: Audit = { present: staticRead.health.present, missing: staticRead.health.missing };
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

    // The graph. Its failure never costs the visitor the card: it is stored
    // with its reason and shown under the card (rule 12).
    let graph: SiteGraph;
    try {
      graph = await readSiteGraph(pool, tenantId, runId, text, fetched.finalUrl, cfg.graphMaxChunks);
    } catch (ge) {
      graph = { status: 'failed', failure: publicFailure(ge as Error) };
    }
    await appendStep(pool, runId, { step_name: 'read_graph', action: 'Read the homepage into a knowledge graph',
      output_summary: graph.status === 'read'
        ? `${graph.nodes.length} entries, ${graph.edges.length} relationships from ${graph.chunks_read} of ${graph.chunks_total} chunk(s)${graph.truncated ? ' — an answer was cut off' : ''}`
        : graph.failure,
      status: graph.status === 'read' && !graph.truncated ? 'ok' : 'error' });

    await pool.query(SQL.finishRead, [readId, text, JSON.stringify(draft), runId, JSON.stringify(audit), JSON.stringify(graph)]);
    await setStatus(pool, runId, 'completed', { output: { site: row.website_host, product_name: draft.product_name ?? null,
      graph: graph.status === 'read' ? { nodes: graph.nodes.length, edges: graph.edges.length } : { failed: graph.failure } } });
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
  /** Entries and relationships from the preview's graph written into the tenant's knowledge graph. */
  graph_written?: { nodes: number; edges: number; failed: number };
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

  // The preview's graph, into the tenant's own knowledge graph — the normal
  // writer, so a re-read of the same page merges rather than duplicates, and
  // the full crawl queued above links each entry to its source as it re-reads
  // it. Every failure is counted and reported, never swallowed (rule 12).
  const graph = claim.graph as SiteGraph | null;
  let graphWritten: ClaimResult['graph_written'];
  if (graph?.status === 'read') {
    graphWritten = { nodes: 0, edges: 0, failed: 0 };
    const idMap = new Map<string, string>();
    for (const n of graph.nodes) {
      try {
        idMap.set(n.id, await upsertNode(pool, tenantId, { label: n.label, name: n.name, description: n.description ?? '',
          properties: { ...n.properties, from: 'website preview' } }));
        graphWritten.nodes++;
      } catch (e) { graphWritten.failed++; console.error('[Funnel:claim] node not written:', (e as Error).message); }
    }
    for (const e of graph.edges) {
      const from = idMap.get(e.from_node_id), to = idMap.get(e.to_node_id);
      if (!from || !to) { graphWritten.failed++; continue; }
      try { await upsertEdge(pool, tenantId, from, e.relationship, to); graphWritten.edges++; }
      catch (err) { graphWritten.failed++; console.error('[Funnel:claim] edge not written:', (err as Error).message); }
    }
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
    return { site: claim.website_host, source_id: claim.sourceId!, profile_applied: true, graph_written: graphWritten };
  } catch (e) {
    const detail = (e as Error).message;
    console.error('[Funnel:claim] claimed, but the card could not be written:', detail);
    return { site: claim.website_host, source_id: claim.sourceId!, profile_applied: false, graph_written: graphWritten, detail };
  }
}

/* ── Request access ──────────────────────────────────────────────────────── */

export interface AccessRequestInput {
  name: unknown; email: unknown; role_title: unknown; company: unknown;
  country_code?: unknown; mobile?: unknown;
  /** The funnel token, when the visitor read a site first: the site is taken from their session, not from the browser. */
  token?: unknown;
  /** The words next to the checkbox, recorded exactly as the person saw them. */
  consent_text: unknown;
  ip: string;
  /** The Idempotency-Key header (vani-app CLAUDE.md §2). */
  idempotencyKey?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A field the person typed: trimmed, required or not, never longer than its column. */
function field(v: unknown, label: string, max: number, required: boolean): string | null {
  const t = typeof v === 'string' ? v.trim() : '';
  if (!t) {
    if (required) throw new FunnelError('INVALID_REQUEST', `${label} is required`);
    return null;
  }
  if (t.length > max) throw new FunnelError('INVALID_REQUEST', `${label} is longer than ${max} characters`);
  return t;
}

/**
 * The closed-beta Request access form → a lead in the workspace named by
 * FUNNEL_LEADS_TENANT_SLUG, plus one 'access_requested' event that carries
 * the site they read (from their own session), how to reach them, and the
 * exact consent words. One transaction.
 *
 *   · the same email again  → a new event on the existing lead, not a second lead
 *   · the same request again (Idempotency-Key + email) → the first answer, replayed
 *   · more than FUNNEL_MAX_PER_IP_PER_HOUR from one IP in an hour → 429
 */
export async function requestAccess(pool: Pool, input: AccessRequestInput): Promise<{ received: true; replayed: boolean }> {
  const cfg = readFunnelConfig();
  const slug = readLeadsTenantSlug();

  const name = field(input.name, 'Name', 200, true)!;
  const email = field(input.email, 'Work email', 320, true)!;
  if (!EMAIL_RE.test(email)) throw new FunnelError('INVALID_REQUEST', 'enter a valid work email');
  const role = field(input.role_title, 'Your role', 200, true)!;
  const company = field(input.company, 'Company', 200, true)!;
  const countryCode = field(input.country_code, 'Country code', 8, false);
  const mobile = field(input.mobile, 'Mobile', 40, false);
  if (countryCode && !/^\+?[0-9]{1,4}$/.test(countryCode)) throw new FunnelError('INVALID_REQUEST', 'the country code should look like +91');
  if (mobile && !/^[0-9 ()-]{5,40}$/.test(mobile)) throw new FunnelError('INVALID_REQUEST', 'the mobile number should be digits only');
  const consent = field(input.consent_text, 'Consent', 1000, true)!;

  const tenant = (await pool.query<{ id: string }>('SELECT id FROM vn_tenants WHERE slug = $1', [slug])).rows[0];
  if (!tenant) {
    throw new FunnelError('FUNNEL_NOT_CONFIGURED',
      `Request access is switched off: no workspace has the slug set in FUNNEL_LEADS_TENANT_SLUG ("${slug}")`, 503);
  }

  // The site comes from the visitor's own session, never from the browser's word for it.
  let site: string | null = null;
  if (typeof input.token === 'string' && input.token) {
    const s = (await pool.query(SQL.byToken, [hashToken(input.token)])).rows[0];
    if (s && !s.expired) site = s.website_host;
  }

  const ipHash = createHmac('sha256', cfg.ipHashKey).update(String(input.ip ?? '')).digest('hex');
  const requestKey = input.idempotencyKey
    ? createHash('sha256').update(`${input.idempotencyKey}\u0000${email.toLowerCase()}`).digest('hex')
    : null;

  return withTenantClient(pool, tenant.id, async (c) => {
    if (requestKey) {
      // One request per key at a time, so a double submit waits for the first and replays it.
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`vani-access:${requestKey}`]);
      const done = (await c.query(SQL.accessReplay, [tenant.id, requestKey])).rows[0];
      if (done) return { received: true as const, replayed: true };
    }
    const n = (await c.query<{ n: number }>(SQL.accessIp, [tenant.id, ipHash])).rows[0].n;
    if (n >= cfg.maxPerIpPerHour) {
      throw new FunnelError('RATE_LIMITED', 'too many requests from this connection — please try again in an hour', 429);
    }
    const existing = (await c.query<{ id: string }>(SQL.accessLead, [tenant.id, email])).rows[0];
    const leadId = existing?.id
      ?? (await c.query<{ id: string }>(SQL.accessNewLead, [tenant.id, name, email, company, role, mobile])).rows[0].id;
    await c.query(SQL.accessEvent, [tenant.id, leadId, JSON.stringify({
      name, company, role_title: role, country_code: countryCode, mobile, site,
      consent_text: consent, consent_at: new Date().toISOString(),
      ip_hash: ipHash, request_key: requestKey, repeat: !!existing,
    })]);
    return { received: true as const, replayed: false };
  });
}
