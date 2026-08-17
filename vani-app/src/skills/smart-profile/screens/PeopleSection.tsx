'use client';

/**
 * People — the one declaration step that could be finished today.
 *
 * It writes the existing vn_ spine (vn_users / vn_invitations) via the auth
 * surface. Domain and Model need `vani_tenant_domain` / `vani_llm_provider`,
 * whose parent tables (vani_tenant, vani_user) are a separate spine that has
 * not been confirmed applied — so those two stay stated-not-built rather than
 * written against tables that may not exist.
 */

import { useState } from 'react';
import { DataBoundary, SkeletonRows, useToast } from '@/platform/feedback';
import { usePeople, useInvite, INVITE_ROLES, type People } from '../usePeople';
import s from '../smart-profile.module.css';

export function PeopleSection({ n }: { n: number }) {
  const query = usePeople();
  const { invite, isSending } = useInvite();
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState<string>(INVITE_ROLES[0].id);
  const [open, setOpen] = useState(false);

  async function send() {
    const value = email.trim();
    if (!value) {
      showToast({ message: 'Enter an email address first', type: 'error' });
      return;
    }
    const result = await invite(value, roleId);
    if (!result) return;
    // The endpoint answers per-invitation, so a 201 can still carry a refusal.
    // Reporting the row rather than the status code is the difference between
    // "sent" and "already invited" reaching the user.
    const row = result.invitations?.[0];
    if (row && row.status !== 'sent') {
      showToast({ message: row.message || `Could not invite ${row.email}`, type: 'error' });
      return;
    }
    showToast({ message: `Invitation sent to ${value}`, type: 'success' });
    setEmail('');
    setOpen(false);
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
          <div className={s.inviteRow}>
            <input
              className={s.inviteInput}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !isSending) void send(); }}
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
            <button type="button" className={s.inviteSend} onClick={send} disabled={isSending}>
              {isSending ? 'Sending…' : 'Send'}
            </button>
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
                    {m.role && <span className={s.rowTag}>{m.role}</span>}
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
                </li>
              ))}
            </ul>
          )}
        </DataBoundary>
      </div>
    </section>
  );
}
