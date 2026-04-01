'use client';

import { useState, useCallback, useEffect } from 'react';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { InlineLoader } from '@/components/loader';
import FormInput from '@/components/ui/form-input';
import s from './settings-tabs.module.css';

interface SentInvite {
  email: string;
  role: string;
  status: 'sent' | 'error';
  message?: string;
}

export default function TeamTab() {
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('planner');
  const [sending, setSending] = useState(false);
  const [sentInvites, setSentInvites] = useState<SentInvite[]>([]);
  const [emailError, setEmailError] = useState('');

  async function handleSend() {
    if (sending) return; // Prevent double-send
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    setEmailError('');
    setSending(true);

    try {
      const res = await apiFetch<{ invitations: SentInvite[] }>(API.invite.send, {
        body: { invitations: [{ email: trimmed, role_id: roleId }] },
      });
      const result = res.invitations?.[0];
      if (result) {
        setSentInvites((prev) => [result, ...prev]);
        if (result.status === 'sent') {
          showToast({ message: `Invitation sent to ${trimmed}`, type: 'success' });
          setEmail('');
        } else {
          showToast({ message: result.message || 'Failed to send', type: 'error' });
        }
      }
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Failed to send invitation', type: 'error' });
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className={s.card}>
        <div className={s.cardTitle}>Invite Team Members</div>
        <div className={s.cardDesc}>Add team members to your workspace by email</div>

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

      {/* Sent Invitations */}
      {sentInvites.length > 0 && (
        <div className={s.card}>
          <div className={s.cardTitle}>Sent Invitations</div>
          <div className={s.cardDesc}>Invitations expire in 7 days</div>

          {sentInvites.map((inv, i) => (
            <div key={`${inv.email}-${i}`} className={`${s.sessionCard} ${inv.status === 'error' ? s.inviteError : ''}`}>
              <div className={s.inviteAvatar}>
                {inv.email[0].toUpperCase()}
              </div>
              <div className={s.sessionInfo}>
                <div className={s.sessionDevice}>{inv.email}</div>
                <div className={s.sessionMeta}>
                  <span>{inv.role}</span>
                </div>
              </div>
              <span className={inv.status === 'sent' ? s.inviteOk : s.inviteFail}>
                {inv.status === 'sent' ? 'Sent' : inv.message || 'Failed'}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className={s.infoBanner}>
        {'\u2139\uFE0F'} Team members will receive an email with a link to join your workspace.
        They can also sign up and use the invitation code.
      </div>
    </>
  );
}
