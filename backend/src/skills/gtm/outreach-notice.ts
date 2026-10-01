/**
 * The workspace's DPDP outreach acknowledgement (POA D9-e, design-notes-consent.md §6b).
 *
 * The platform publishes a notice (vani_consent_text, platform row, versioned);
 * an owner or admin of the workspace reads it and accepts; Settings can revoke.
 * comms/may-contact.ts lets GTM contact anyone only while the latest row is
 * `accept` — so this is the switch that turns GTM sending on, and off.
 *
 * What it is, stated plainly: the workspace confirming it has a lawful basis
 * for contacting the people it imports. It does not make any particular send
 * lawful, and suppression still applies on top of it.
 *
 * Replay-safe by construction, not by a stored Idempotency-Key: an accept of
 * the notice already accepted, or a revoke when nothing is in force, appends
 * nothing and returns the state as it stands. Both run under a per-workspace
 * advisory lock, so two clicks cannot both append.
 */
import { readFileSync } from 'fs';
import path from 'path';
import type { SkillContext, SkillDb } from '../../shared/types';

const sql = (f: string) => readFileSync(path.join(__dirname, 'queries', f), 'utf-8');
const SQL = {
  notice:      sql('outreach-notice-latest.sql'),
  history:     sql('outreach-ack-history.sql'),
  provisioned: sql('outreach-provisioned.sql'),
  lock:        sql('outreach-ack-lock.sql'),
  insert:      sql('outreach-ack-insert.sql'),
};

export type OutreachStatus =
  | 'no_notice'        // the platform has not published the notice yet
  | 'not_provisioned'  // no vani_tenant row — the Domain step is not done
  | 'not_accepted'     // never accepted
  | 'accepted'         // the current notice is accepted — GTM may send
  | 'accepted_older'   // an older version is accepted — still in force, review the new one
  | 'revoked';         // switched off in Settings

export interface OutreachNotice { id: string; version: number; body: string; published_at: string }
export interface OutreachEvent {
  id: string; action: 'accept' | 'revoke'; at: string;
  notice_version: number | null; actor_name: string | null; actor_email: string | null;
}
export interface OutreachState {
  status: OutreachStatus;
  /** True while the gate lets GTM contact people (latest row is accept). */
  in_force: boolean;
  notice: OutreachNotice | null;
  current: OutreachEvent | null;
  history: OutreachEvent[];
  /** Only an owner or admin may accept or revoke. */
  can_decide: boolean;
}

export const canDecide = (ctx: SkillContext) => ctx.role === 'owner' || ctx.role === 'admin';

export async function readState(db: SkillDb, ctx: SkillContext): Promise<OutreachState> {
  const p = { tenant_id: ctx.tenant_id };
  // In order, not Promise.all: inside a transaction these share one client.
  const n = await db.query<OutreachNotice>(SQL.notice, p);
  const h = await db.query<OutreachEvent & { notice_id: string | null }>(SQL.history, p);
  const v = await db.query<{ provisioned: boolean }>(SQL.provisioned, p);
  const notice = n.rows[0] ?? null;
  const history = h.rows.map(({ id, action, at, notice_version, actor_name, actor_email }) =>
    ({ id, action, at, notice_version, actor_name, actor_email }));
  const current = history[0] ?? null;
  const currentNoticeId = h.rows[0]?.notice_id ?? null;

  const in_force = current?.action === 'accept';
  const status: OutreachStatus =
    !v.rows[0]?.provisioned ? 'not_provisioned'
    : in_force ? (notice && currentNoticeId !== notice.id ? 'accepted_older' : 'accepted')
    : !notice ? 'no_notice'
    : current?.action === 'revoke' ? 'revoked'
    : 'not_accepted';

  return { status, in_force, notice, current, history, can_decide: canDecide(ctx) };
}

/** Lock, refuse what is not allowed, and hand back the state the decision is made on. */
export async function lockAndRead(tx: SkillDb, ctx: SkillContext, verb: string): Promise<OutreachState> {
  if (!canDecide(ctx)) {
    throw new Error(`Only a workspace owner or admin can ${verb} the DPDP outreach notice.`);
  }
  const l = await tx.query<{ vani_tenant_id: string | null }>(SQL.lock, { tenant_id: ctx.tenant_id });
  if (!l.rows[0]?.vani_tenant_id) {
    throw new Error('This workspace has no platform record yet — finish the Domain step in the Smart Profile first.');
  }
  return readState(tx, ctx);
}

export async function append(tx: SkillDb, ctx: SkillContext, action: 'accept' | 'revoke', noticeId: string | null) {
  await tx.query(SQL.insert, { action, notice_id: noticeId, actor_id: ctx.user_id });
}
