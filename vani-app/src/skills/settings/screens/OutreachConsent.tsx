'use client';

/**
 * Settings → Outreach consent — the workspace's DPDP outreach acknowledgement
 * (design-notes-consent.md §6b, POA GTM activation step 1).
 *
 * GTM may contact anyone only while the latest acknowledgement is `accept`
 * (VaNiGTM comms/may-contact.ts). So this tab is the switch that turns GTM
 * sending on and off, and it says so. Anyone in the workspace can read the
 * notice and its history; only an owner or admin can decide (the server
 * enforces it — the disabled button is a courtesy).
 *
 * The accept is tied to the notice ON SCREEN: the id of the version shown is
 * sent, and the server refuses it if a newer one was published since. A tick
 * box comes first so the decision is a deliberate act, not one click.
 *
 * Switching off asks once more in place — it stops outreach at once.
 */

import { useState } from 'react';
import Link from 'next/link';
import { DataBoundary, InlineLoader, SkeletonRows } from '@/platform/feedback';
import { formatDate, formatDateTime } from '@/lib/format';
import u from '@/platform/shell/ui.module.css';
import f from './settings.module.css';
import s from './model-provider.module.css';
import o from './outreach.module.css';
import {
  useOutreachDecision, useOutreachNotice,
  type OutreachEvent, type OutreachState, type OutreachStatus,
} from '../useOutreachNotice';

const TAG: Record<OutreachStatus, { label: string; cls: string }> = {
  accepted:        { label: 'Outreach on',      cls: u.tagOk },
  accepted_older:  { label: 'On · new version', cls: u.tagWarn },
  not_accepted:    { label: 'Outreach off',     cls: u.tagDim },
  revoked:         { label: 'Switched off',     cls: u.tagDim },
  no_notice:       { label: 'Not published',    cls: u.tagDim },
  not_provisioned: { label: 'Domain step first', cls: u.tagWarn },
};

/** States in which the notice is waiting for an owner's or admin's decision. */
const NEEDS_DECISION: OutreachStatus[] = ['not_accepted', 'revoked', 'accepted_older'];

const who = (e: OutreachEvent) => e.actor_name || e.actor_email || 'a former member';

export default function OutreachConsent() {
  const q = useOutreachNotice();
  const st = q.data?.success ? q.data.data : undefined;

  return (
    <div>
      <h2 className={f.h2}>Outreach consent</h2>
      <p className={u.lede}>
        GTM contacts people only while this workspace has accepted the DPDP outreach notice. Anyone here
        can read it; an owner or admin decides.
      </p>

      <section className={u.card}>
        <div className={u.cardHead}>
          Status
          {st && <span className={`${u.tag} ${TAG[st.status].cls}`}>{TAG[st.status].label}</span>}
        </div>
        <DataBoundary query={q} label="the outreach notice" skeleton={<SkeletonRows rows={3} />}>
          {(d) => <Decision state={d} />}
        </DataBoundary>
      </section>

      {st?.notice && (
        <section className={u.card} style={{ marginTop: 16 }}>
          <div className={u.cardHead}>
            The notice
            <span className={u.cardMeta}>version {st.notice.version} · published {formatDate(st.notice.published_at)}</span>
          </div>
          <div className={s.body}>
            <div className={o.notice} tabIndex={0} aria-label={`DPDP outreach notice, version ${st.notice.version}`}>
              {st.notice.body}
            </div>
            {st.can_decide && NEEDS_DECISION.includes(st.status) && <AcceptForm state={st} />}
          </div>
        </section>
      )}

      {st && st.history.length > 0 && (
        <section className={u.card} style={{ marginTop: 16 }}>
          <div className={u.cardHead}>
            History
            <span className={u.cardMeta}>kept for every change, newest first</span>
          </div>
          <div className={s.body}>
            <table className={s.rows}>
              <tbody>
                {st.history.map((e) => (
                  <tr key={e.id}>
                    <th>{formatDateTime(e.at)}</th>
                    <td>
                      {e.action === 'accept' ? `Accepted version ${e.notice_version ?? '?'}` : 'Switched off'} — {who(e)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Decision({ state: d }: { state: OutreachState }) {
  const { revoke, refresh } = useOutreachDecision();
  const [confirmOff, setConfirmOff] = useState(false);

  async function onRevoke() {
    await revoke.mutate({});
    setConfirmOff(false);
    refresh();
  }

  const decideNote = !d.can_decide && (
    <p className={s.note}>Only a workspace owner or admin can change this. Ask one of them to open this tab.</p>
  );

  if (d.status === 'not_provisioned') {
    return (
      <div className={s.body}>
        <p className={s.note}>
          This workspace has no platform record yet, so there is nothing to record an acceptance against.
          It is created by the Domain step of the Smart Profile.
        </p>
        <div className={s.actions}>
          <Link className={`${s.btn} ${s.btnPrimary}`} href={`/onboarding/declare?step=vani:domain&next=/settings/consent`}>
            Finish the Domain step
          </Link>
        </div>
      </div>
    );
  }

  if (d.status === 'no_notice') {
    return (
      <div className={s.body}>
        <p className={s.note}>
          Vikuna has not published the DPDP outreach notice yet — its wording is being reviewed. Until it is,
          nothing can be accepted and GTM sends nothing.
        </p>
        <p className={s.note}>Everything before sending still works: build the audience and the offers in the meantime.</p>
        <div className={s.actions}>
          <Link className={s.btn} href="/agents/gtm">Back to GTM</Link>
        </div>
      </div>
    );
  }

  if (d.status === 'accepted') {
    const c = d.current!;
    return (
      <div className={s.body}>
        <p className={s.note}>
          Accepted by <strong>{who(c)}</strong> on {formatDate(c.at)} (version {c.notice_version}). GTM may contact
          people who have not opted out. Opt-outs, bounces and erasure requests are honoured whatever this says.
        </p>
        {decideNote}
        {d.can_decide && (confirmOff ? (
          <div className={o.confirm}>
            <p className={s.note}><strong>Switch outreach off?</strong> It stops at once. Anything already sent is not recalled.</p>
            <div className={s.actions}>
              <button type="button" className={`${s.btn} ${s.btnDanger}`} onClick={onRevoke} disabled={revoke.isPending}>
                {revoke.isPending ? <InlineLoader size="sm" message="Switching off…" /> : 'Yes, switch off'}
              </button>
              <button type="button" className={s.btn} onClick={() => setConfirmOff(false)} disabled={revoke.isPending}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className={s.actions}>
            <button type="button" className={`${s.btn} ${s.btnDanger}`} onClick={() => setConfirmOff(true)}>Switch outreach off</button>
          </div>
        ))}
      </div>
    );
  }

  // not_accepted · revoked · accepted_older — the notice below needs a decision,
  // and the tick box sits UNDER the notice, so it is read before it is agreed to.
  const lead =
    d.status === 'accepted_older'
      ? <>Version {d.notice!.version} of the notice has been published. Your acceptance of version {d.current?.notice_version} stays in force
          until you review it — read the new version below and accept it.</>
      : d.status === 'revoked'
        ? <>Outreach was switched off by <strong>{who(d.current!)}</strong> on {formatDate(d.current!.at)}. GTM sends nothing until the notice is accepted again.</>
        : <>GTM sends nothing until an owner or admin reads the notice below and accepts it for this workspace.</>;

  return (
    <div className={s.body}>
      <p className={s.note}>{lead}</p>
      {decideNote}
      {d.status === 'accepted_older' && d.can_decide && (
        <div className={s.actions}>
          <button type="button" className={`${s.btn} ${s.btnDanger}`} onClick={onRevoke} disabled={revoke.isPending}>
            {revoke.isPending ? <InlineLoader size="sm" message="Switching off…" /> : 'Switch outreach off instead'}
          </button>
        </div>
      )}
    </div>
  );
}

/** The tick box and Accept, at the foot of the notice they accept. */
function AcceptForm({ state: d }: { state: OutreachState }) {
  const { accept, refresh } = useOutreachDecision();
  const [ticked, setTicked] = useState(false);
  const notice = d.notice!;

  async function onAccept() {
    await accept.mutate({ notice_id: notice.id });
    setTicked(false);
    // Refresh on failure too: the usual refusal is "the notice changed", and
    // the reader then needs the new version on screen, not the old one.
    refresh();
  }

  return (
    <>
      <label className={o.tick}>
        <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} disabled={accept.isPending} />
        <span>
          I have read version {notice.version} of the notice above and accept it on behalf of this workspace.
          Our organisation is responsible for having a lawful basis to contact the people we import.
        </span>
      </label>
      <div className={s.actions}>
        <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={onAccept} disabled={!ticked || accept.isPending}>
          {accept.isPending ? <InlineLoader size="sm" message="Recording…" /> : `Accept version ${notice.version}`}
        </button>
      </div>
    </>
  );
}
