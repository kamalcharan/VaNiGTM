/**
 * The contact gate (POA D9, design-notes-consent.md §5). The ONLY way anything
 * may decide to contact a person: every send path, and every assisted draft
 * (LinkedIn/X), asks `mayContact` first.
 *
 *   mayContact        yes, or no with the reason
 *   recordSuppression write a block (unsubscribe, manual, bounce, …)
 *   liftSuppression   undo a block — only as D9-d allows
 *
 * Nothing calls this yet: no send path exists. Building the gate first means
 * the first sender cannot be written without it.
 *
 * Tenant: callers pass the JWT's vn_tenants id; every query runs inside
 * withTenantClient, and the SQL resolves the vani_tenant id with
 * vani_current_tenant() (migration 248) — the two-tenant-id bridge (D9-c).
 *
 * FAILS CLOSED (rule 12). If the check itself cannot be made — database
 * error, missing SUPPRESSION_HASH_KEY, an address that will not normalise —
 * the answer is NO with `check_failed` / `invalid_identifier` and the real
 * cause in `detail`. A gate that says yes when it cannot look is not a gate.
 */
import type { Pool, PoolClient } from 'pg';
import { readFileSync } from 'fs';
import path from 'path';
import { withTenantClient } from '../db/query';
import { CommsError, emailDomain, fingerprint, type Identifier } from './identifiers';

export type AgentCode = 'vara' | 'gtm' | 'edge' | 'nova';
export type Channel = 'email' | 'sms' | 'whatsapp' | 'call' | 'linkedin' | 'x';

export type Refusal =
  | 'suppressed' | 'no_consent' | 'consent_withdrawn' | 'retention_expired'
  | 'no_basis' | 'invalid_identifier' | 'check_failed';

export type Verdict =
  | { allowed: true }
  | { allowed: false; reason: Refusal; detail: string };

const sql = (f: string) => readFileSync(path.join(__dirname, 'queries', f), 'utf-8');
const SQL = {
  state:          sql('suppression-state.sql'),
  latestTenant:   sql('latest-tenant-block.sql'),
  latestPlatform: sql('latest-platform-block.sql'),
  insert:         sql('insert-tenant-block.sql'),
  varaConsent:    sql('vara-consent-state.sql'),
  gtmAck:         sql('gtm-acknowledgement.sql'),
};

/* ── The gate ────────────────────────────────────────────────────────────── */

export interface ContactRequest {
  agent: AgentCode;
  channel: Channel;
  /** Every identifier this send would use for the person (usually one). */
  identifiers: Identifier[];
  /** Vara only: the candidate being contacted. */
  candidateId?: string;
}

export async function mayContact(pool: Pool, tenantId: string, req: ContactRequest): Promise<Verdict> {
  // Fingerprints first: an address that cannot be normalised is refused
  // before the database is touched.
  let prints: string[];
  try {
    if (!req.identifiers.length) {
      return { allowed: false, reason: 'invalid_identifier', detail: 'no identifier given — nothing to check' };
    }
    const set = new Set<string>();
    for (const id of req.identifiers) {
      set.add(fingerprint(id));
      // "Nobody at this company" (§6c): an email is also checked by its domain.
      if (id.kind === 'email') set.add(fingerprint({ kind: 'domain', value: emailDomain(id.value) }));
    }
    prints = [...set];
  } catch (e) {
    const err = e as Error;
    if (e instanceof CommsError && e.code === 'INVALID_IDENTIFIER') {
      return { allowed: false, reason: 'invalid_identifier', detail: err.message };
    }
    console.error('[Comms:mayContact] check failed before the database:', err.message);
    return { allowed: false, reason: 'check_failed', detail: err.message };
  }

  try {
    return await withTenantClient(pool, tenantId, (c) => decide(c, req, prints));
  } catch (e) {
    const detail = (e as Error).message;
    console.error('[Comms:mayContact] check failed:', detail);
    return { allowed: false, reason: 'check_failed', detail };
  }
}

async function decide(c: PoolClient, req: ContactRequest, prints: string[]): Promise<Verdict> {
  // 1. Suppression — for everyone, on top of any basis.
  const blocks = await c.query<{ platform_wide: boolean; agent_code: string | null; channel: string; identifier_kind: string; reason: string; source: string }>(
    SQL.state, [prints, req.channel, req.agent]);
  if (blocks.rows.length) {
    const b = blocks.rows[0];
    return {
      allowed: false, reason: 'suppressed',
      detail: `${b.reason} (${b.platform_wide ? 'every tenant' : 'this tenant'}, `
        + `${b.agent_code ?? 'every agent'}, ${b.channel === 'all' ? 'every channel' : b.channel}`
        + `${b.identifier_kind === 'domain' ? ', whole email domain' : ''}; source: ${b.source})`,
    };
  }

  // 2. The basis for contacting at all — per agent.
  if (req.agent === 'vara') {
    if (!req.candidateId) {
      return { allowed: false, reason: 'no_consent', detail: 'Vara contacts only a candidate, and no candidate was named' };
    }
    const r = await c.query<{ current_consent_id: string | null; retention_until: Date | null; withdrawn_at: Date | null }>(
      SQL.varaConsent, [req.candidateId]);
    const row = r.rows[0];
    if (!row) return { allowed: false, reason: 'no_consent', detail: 'no such candidate for this tenant' };
    if (!row.current_consent_id) return { allowed: false, reason: 'no_consent', detail: 'the candidate has not given consent' };
    if (row.withdrawn_at) return { allowed: false, reason: 'consent_withdrawn', detail: `consent withdrawn on ${new Date(row.withdrawn_at).toISOString()}` };
    if (!row.retention_until || new Date(row.retention_until).getTime() < Date.now()) {
      return { allowed: false, reason: 'retention_expired',
        detail: row.retention_until ? `retention ended on ${new Date(row.retention_until).toISOString().slice(0, 10)}` : 'no retention date set' };
    }
    return { allowed: true };
  }

  if (req.agent === 'gtm') {
    const r = await c.query<{ action: string }>(SQL.gtmAck, []);
    if (r.rows[0]?.action !== 'accept') {
      return { allowed: false, reason: 'no_basis',
        detail: r.rows[0] ? 'the DPDP outreach acknowledgement was switched off in Settings'
                          : 'the tenant has not accepted the DPDP outreach notice (Smart Profile → I agree)' };
    }
    return { allowed: true };
  }

  return { allowed: false, reason: 'no_basis', detail: `no contact basis is defined for agent "${req.agent}"` };
}

/* ── Writing a block ─────────────────────────────────────────────────────── */

const PLATFORM_REASONS = ['bounced', 'complained', 'erasure'] as const;   // D9-a: every tenant
const TENANT_REASONS = ['unsubscribed', 'manual', 'never_contact', 'consent_withdrawn'] as const;

export type SuppressReason = typeof PLATFORM_REASONS[number] | typeof TENANT_REASONS[number];

export interface SuppressRequest {
  /** null = every agent. Platform reasons ignore it only if the caller passes null. */
  agent: AgentCode | null;
  channel: Channel | 'all';
  /** Every identifier to block — for "never contact me", every one we hold for the person (§6c). */
  identifiers: Identifier[];
  reason: SuppressReason;
  source: string;
  actor: { type: 'human' | 'subject' | 'rule' | 'system'; id?: string | null };
}

export async function recordSuppression(pool: Pool, tenantId: string, req: SuppressRequest): Promise<{ ids: string[] }> {
  if (!req.identifiers.length) throw new CommsError('INVALID_IDENTIFIER', 'nothing to suppress');
  const rows = req.identifiers.map((id) => ({ kind: id.kind, hash: fingerprint(id) }));
  const platform = (PLATFORM_REASONS as readonly string[]).includes(req.reason);
  if (!platform && !(TENANT_REASONS as readonly string[]).includes(req.reason)) {
    throw new CommsError('INVALID_REASON', `"${req.reason}" is not a suppression reason`);
  }

  return withTenantClient(pool, tenantId, async (c) => {
    const ids: string[] = [];
    for (const r of rows) {
      if (platform) {
        // Only the SECURITY DEFINER writer can create a platform-wide row (260).
        const res = await c.query<{ id: string }>(
          'SELECT vani_suppress_platform($1, $2, $3, $4, $5, $6) AS id',
          [req.channel, r.kind, r.hash, req.reason, req.source, req.agent]);
        ids.push(res.rows[0].id);
      } else {
        const res = await c.query<{ id: string }>(SQL.insert,
          [req.agent, req.channel, r.kind, r.hash, 'suppress', req.reason, req.source, req.actor.type, req.actor.id ?? null]);
        if (!res.rows[0]) {
          throw new CommsError('TENANT_NOT_PROVISIONED',
            'this tenant has no platform record yet (vani_tenant) — finish the Domain step first');
        }
        ids.push(res.rows[0].id);
      }
    }
    return { ids };
  });
}

/* ── Undoing a block (D9-d) ──────────────────────────────────────────────── */
//
//   admin (actor 'human')     may lift a tenant's own `manual` block
//   the person ('subject')    may lift their own unsubscribed / never_contact /
//                             consent_withdrawn, by opting in again ('reconsented')
//   platform-wide blocks      bounce, complaint, erasure — never from a tenant;
//                             a bounce is lifted by a platform operator only,
//                             an erasure never
//
// The CALLER proves the actor: that the user is a tenant admin, or that the
// opt-in came from the person (a signed link, a reply from the address).

export interface LiftRequest {
  agent: AgentCode | null;
  channel: Channel | 'all';
  identifier: Identifier;
  actor: { type: 'human' | 'subject'; id?: string | null };
  source: string;
}

const SUBJECT_MAY_LIFT = ['unsubscribed', 'never_contact', 'consent_withdrawn'];
const ADMIN_MAY_LIFT = ['manual'];

export async function liftSuppression(pool: Pool, tenantId: string, req: LiftRequest): Promise<{ id: string }> {
  const hash = fingerprint(req.identifier);
  return withTenantClient(pool, tenantId, async (c) => {
    const latest = (await c.query<{ action: string; reason: string }>(
      SQL.latestTenant, [hash, req.channel, req.agent])).rows[0];

    if (!latest || latest.action !== 'suppress') {
      const plat = (await c.query<{ action: string; reason: string }>(SQL.latestPlatform, [hash, req.channel])).rows[0];
      if (plat?.action === 'suppress') {
        throw new CommsError('LIFT_NOT_ALLOWED',
          `this address is blocked for every tenant (${plat.reason}); `
          + (plat.reason === 'erasure' ? 'an erasure is never lifted' : 'only a platform operator can lift it'));
      }
      throw new CommsError('NOT_SUPPRESSED', 'no block in force on this address, channel and agent for this tenant');
    }

    const allowed = req.actor.type === 'subject' ? SUBJECT_MAY_LIFT : ADMIN_MAY_LIFT;
    if (!allowed.includes(latest.reason)) {
      throw new CommsError('LIFT_NOT_ALLOWED', req.actor.type === 'human'
        ? `an admin cannot undo "${latest.reason}" — only the person can, by opting in again`
        : `"${latest.reason}" cannot be lifted by the person`);
    }

    const res = await c.query<{ id: string }>(SQL.insert, [
      req.agent, req.channel, req.identifier.kind, hash, 'lift',
      req.actor.type === 'subject' ? 'reconsented' : 'admin_lift',
      req.source, req.actor.type, req.actor.id ?? null]);
    return { id: res.rows[0].id };
  });
}
