'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '@/components/toast';
import { InlineLoader } from '@/components/loader';
import { VdfLoader, VdfStatusBadge } from '@/components/vdf';
import FormInput from '@/components/ui/form-input';
import s from './settings-tabs.module.css';

interface Member {
  id: string;
  name: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  role_code: string | null;
  role_name: string | null;
}

interface PendingInvite {
  id: string;
  email: string;
  status: string;
  expires_at: string;
  created_at: string;
  role_code: string | null;
  role_name: string | null;
}

function initials(member: Member): string {
  const f = member.first_name?.[0] || member.name?.[0] || '';
  const l = member.last_name?.[0] || member.name?.split(' ')[1]?.[0] || '';
  return (f + l).toUpperCase() || '?';
}

export default function TeamTab() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('planner');
  const [sending, setSending] = useState(false);
  const [emailError, setEmailError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [membersRes, invitesRes] = await Promise.all([
        apiFetch<{ members: Member[] }>(API.invite.team),
        apiFetch<{ invitations: PendingInvite[] }>(API.invite.list),
      ]);
      setMembers(membersRes.members || []);
      setInvites(invitesRes.invitations || []);
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Failed to load team', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  async function handleSend() {
    if (sending) return;
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    setEmailError('');
    setSending(true);

    try {
      await apiFetch(API.invite.send, {
        body: { invitations: [{ email: trimmed, role_id: roleId }] },
      });
      showToast({ message: `Invitation sent to ${trimmed}`, type: 'success' });
      setEmail('');
      load(); // refresh pending invites
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Failed to send invitation', type: 'error' });
    } finally {
      setSending(false);
    }
  }

  if (loading) return <VdfLoader message="Loading team" hint="Fetching members and invitations" />;

  return (
    <>
      {/* ── Current Members ── */}
      <div className={s.card}>
        <div className={s.cardTitle}>Team Members ({members.length})</div>
        <div className={s.cardDesc}>All users with access to this workspace</div>

        {members.map((m) => (
          <div key={m.id} className={s.sessionCard}>
            <div className={s.inviteAvatar}>{initials(m)}</div>
            <div className={s.sessionInfo}>
              <div className={s.sessionDevice}>
                {m.name || m.email}
                {m.id === user?.id && (
                  <span className={s.sessionBadge} style={{ marginLeft: 8 }}>You</span>
                )}
              </div>
              <div className={s.sessionMeta}>
                <span>{m.email}</span>
                {m.role_name && <span>{m.role_name}</span>}
                {m.last_login_at && (
                  <span>Last login {new Date(m.last_login_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                )}
              </div>
            </div>
            <VdfStatusBadge
              label={m.is_active ? 'Active' : 'Inactive'}
              variant={m.is_active ? 'success' : 'muted'}
            />
          </div>
        ))}
      </div>

      {/* ── Pending Invitations ── */}
      {invites.length > 0 && (
        <div className={s.card}>
          <div className={s.cardTitle}>Pending Invitations ({invites.length})</div>
          <div className={s.cardDesc}>Invitations awaiting acceptance — expire in 7 days</div>

          {invites.map((inv) => (
            <div key={inv.id} className={s.sessionCard}>
              <div className={s.inviteAvatar}>{inv.email[0].toUpperCase()}</div>
              <div className={s.sessionInfo}>
                <div className={s.sessionDevice}>{inv.email}</div>
                <div className={s.sessionMeta}>
                  {inv.role_name && <span>{inv.role_name}</span>}
                  <span>Expires {new Date(inv.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                </div>
              </div>
              <VdfStatusBadge label="Pending" variant="warning" />
            </div>
          ))}
        </div>
      )}

      {/* ── Invite Form ── */}
      <div className={s.card}>
        <div className={s.cardTitle}>Invite a Team Member</div>
        <div className={s.cardDesc}>They will receive an email invitation to join this workspace</div>

        <div className={s.formRow}>
          <div style={{ flex: 2 }}>
            <FormInput
              label="Email Address"
              type="email"
              placeholder="colleague@firm.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailError(''); }}
              error={emailError}
              disabled={sending}
            />
          </div>
          <div className={s.selectGroup} style={{ flex: 1 }}>
            <label className={s.selectLabel}>Role</label>
            <select className={s.select} value={roleId} onChange={(e) => setRoleId(e.target.value)} disabled={sending}>
              <option value="admin">Admin</option>
              <option value="planner">Planner</option>
            </select>
          </div>
        </div>

        <div className={s.roleHints}>
          <span className={s.roleHint}><strong>Admin</strong> — Full access, can invite others and manage settings</span>
          <span className={s.roleHint}><strong>Planner</strong> — Advisory access, manage clients and portfolios</span>
        </div>

        <div className={s.actions}>
          <button className={s.btnSave} onClick={handleSend} disabled={sending || !email}>
            {sending ? <InlineLoader size="sm" message="Sending..." /> : 'Send Invitation'}
          </button>
        </div>
      </div>
    </>
  );
}
