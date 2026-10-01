'use client';

/**
 * People — who else is in the workspace, and how they get in.
 *
 * It writes the existing vn_ spine (vn_users / vn_invitations) via the auth
 * surface. Domain and Model need `vani_tenant_domain` / `vani_llm_provider`,
 * whose parent tables (vani_tenant, vani_user) are a separate spine that has
 * not been confirmed applied — so those two stay stated-not-built rather than
 * written against tables that may not exist.
 *
 * Inviting makes a LINK, not an email (Charan, 2026-10-01): nothing is sent,
 * so nothing here may say "sent". The link is shown once with a Copy button;
 * the person opens it, signs up and lands in this workspace. A link that was
 * not copied cannot be shown again (only its hash is stored) — "New link" on a
 * pending invitation makes a fresh one and the old one stops working.
 */

import { useState } from 'react';
import { DataBoundary, SkeletonRows, useToast } from '@/platform/feedback';
import { formatDate } from '@/lib/format';
import { usePeople, useInvite, joinLink, INVITE_ROLES, type InviteRow, type People } from '../usePeople';
import s from '../smart-profile.module.css';

interface Ready { email: string; link: string; renewed: boolean; expires_at?: string }

export function PeopleSection({ n }: { n: number }) {
  const query = usePeople();
  const { invite, isSending } = useInvite();
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState<string>(INVITE_ROLES[0].id);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState<Ready | null>(null);
  const [copied, setCopied] = useState(false);

  async function makeLink(address: string, role: string) {
    const result = await invite(address, role);
    if (!result) return;
    // The endpoint answers per-invitation, so a 201 can still carry a refusal.
    const row: InviteRow | undefined = result.invitations?.[0];
    if (!row || row.status === 'error' || !row.token) {
      showToast({ message: row?.message || `Could not make a link for ${address}`, type: 'error' });
      return;
    }
    setReady({ email: row.email, link: joinLink(row.token), renewed: row.status === 'renewed', expires_at: row.expires_at });
    setCopied(false);
    showToast({ message: `Invitation link ready for ${row.email} — copy it and share it with them.`, type: 'success' });
    setEmail('');
    setOpen(false);
  }

  function create() {
    const value = email.trim();
    if (!value) {
      showToast({ message: 'Enter an email address first', type: 'error' });
      return;
    }
    void makeLink(value, roleId);
  }

  async function copy() {
    if (!ready) return;
    try {
      await navigator.clipboard.writeText(ready.link);
      setCopied(true);
      showToast({ message: 'Link copied. Share it with them — it works once, for that email.', type: 'success' });
    } catch {
      // Clipboard blocked (permissions, an insecure origin). The link is on
      // screen and selected-on-focus, so say how to take it by hand.
      showToast({ message: 'Could not copy automatically — select the link and copy it.', type: 'warning' });
    }
  }

  return (
    <section className={s.section}>
      <header className={s.sectionHead}>
        <span className={s.sectionNum}>{n}</span>
        <div className={s.sectionTitles}>
          <h2 className={s.sectionTitle}>People</h2>
          <p className={s.sectionWhat}>Who else is in the organisation, and what they can do.</p>
        </div>
        <button type="button" className={s.sectionEdit} onClick={() => setOpen((v) => !v)}>
          {open ? 'Cancel' : 'Invite'}
        </button>
      </header>

      <div className={s.sectionBody}>
        {open && (
          <>
            <div className={s.inviteRow}>
              <input
                className={s.inviteInput}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !isSending) create(); }}
                placeholder="name@company.com"
                disabled={isSending}
                autoFocus
              />
              <select
                className={s.inviteRole}
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                disabled={isSending}
              >
                {INVITE_ROLES.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
              <button type="button" className={s.inviteSend} onClick={create} disabled={isSending}>
                {isSending ? 'Making link…' : 'Make invite link'}
              </button>
            </div>
            <p className={s.rowDetail}>No email is sent. You get a link to copy and share; they sign up with it and join this workspace.</p>
          </>
        )}

        {ready && (
          <div className={s.inviteLink} role="status">
            <div className={s.rowName}>
              {ready.renewed ? 'New link' : 'Invitation link'} for {ready.email}
            </div>
            <div className={s.inviteRow}>
              <input
                className={s.inviteInput}
                readOnly
                value={ready.link}
                onFocus={(e) => e.currentTarget.select()}
                aria-label={`Invitation link for ${ready.email}`}
              />
              <button type="button" className={s.inviteSend} onClick={copy}>
                {copied ? 'Copied ✓' : 'Copy link'}
              </button>
            </div>
            <p className={s.rowDetail}>
              Copy and share it with {ready.email}. It works once, only for that email
              {ready.expires_at ? `, until ${formatDate(ready.expires_at)}` : ''}.
              {ready.renewed && ' Any earlier link for this address no longer works.'}
              {' '}It is shown only now — if you lose it, make a new one.
            </p>
            <button type="button" className={s.sectionEdit} onClick={() => setReady(null)}>Done</button>
          </div>
        )}

        <DataBoundary
          query={query}
          label="people"
          skeleton={<SkeletonRows rows={2} />}
          isEmpty={(d: People) => !d.members.length && !d.pending.length}
          empty="Only you so far. Invite the people who will work with VaNi."
        >
          {(d: People) => (
            <ul className={s.rows}>
              {d.members.map((m) => (
                <li key={m.id} className={s.row}>
                  <span className={s.rowName}>
                    {m.name || [m.first_name, m.last_name].filter(Boolean).join(' ') || m.email}
                    {(m.role_name || m.role_code) && <span className={s.rowTag}>{m.role_name || m.role_code}</span>}
                  </span>
                  <span className={s.rowDetail}>{m.email}</span>
                </li>
              ))}
              {d.pending.map((p) => (
                <li key={p.id} className={s.row}>
                  <span className={s.rowName}>
                    {p.email}
                    <span className={s.rowTagMuted}>invited</span>
                  </span>
                  <span className={s.rowDetail}>
                    Has not joined yet{p.expires_at ? ` · link valid until ${formatDate(p.expires_at)}` : ''} ·{' '}
                    <button
                      type="button"
                      className={s.rowLinkBtn}
                      disabled={isSending}
                      onClick={() => void makeLink(p.email, p.role_code ?? INVITE_ROLES[0].id)}
                    >
                      New link
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DataBoundary>
      </div>
    </section>
  );
}
