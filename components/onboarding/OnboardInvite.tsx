'use client';

import { useState } from 'react';
import { useShellConfig } from '@/lib/shell-config';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '../toast';
import { InlineLoader } from '../loader';
import s from './OnboardInvite.module.css';

interface Props {
  onComplete: (data?: Record<string, unknown>) => void;
  onSkip?: () => void;
}

interface SentInvite {
  email: string;
  role: string;
  status: 'sent' | 'error';
  message?: string;
}

export default function OnboardInvite({ onComplete, onSkip }: Props) {
  const { apiUrl } = useShellConfig();
  const { getAuthHeaders } = useAuth();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<SentInvite[]>([]);
  const [error, setError] = useState('');

  async function handleSend() {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${apiUrl}/api/v1/auth/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          invitations: [{ email: email.trim().toLowerCase(), role }],
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error?.message || 'Failed to send invitation');
      }

      setSent((prev) => [...prev, { email: email.trim(), role, status: 'sent' }]);
      showToast({ message: `Invitation sent to ${email}`, type: 'success' });
      setEmail('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send';
      setSent((prev) => [...prev, { email: email.trim(), role, status: 'error', message: msg }]);
      showToast({ message: msg, type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={s.split}>
      {/* ── Left: Narrative ── */}
      <div className={s.narrative}>
        <div className={s.narrativeGlow} />
        <div className={s.narrContent}>
          <div className={s.chapter}>Step 4 of 6</div>
          <h2 className={s.narrTitle}>
            Build your<br /><span className={s.glow}>team</span>.
          </h2>
          <p className={s.narrText}>
            Invite planners, admins, or team members to your workspace.
            They&apos;ll receive an email with a link to join.
          </p>
          <div className={s.optionalBadge}>&#x25CB; Can be done later</div>
        </div>
      </div>

      {/* ── Right: Form ── */}
      <div className={s.formPanel}>
        <div className={s.formBorderAccent} />
        <div className={s.sectionTitle}>Invite Team Members</div>

        {/* Email + Role row */}
        <div className={s.inviteRow}>
          <div className={s.emailField}>
            <label className={s.formLabel}>Email Address</label>
            <input
              type="email"
              className={s.formInput}
              placeholder="colleague@firm.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              disabled={loading}
            />
            {error && <div className={s.fieldError}>{error}</div>}
          </div>
          <div className={s.roleField}>
            <label className={s.formLabel}>Role</label>
            <select
              className={s.formSelect}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={loading}
            >
              <option value="admin">Admin</option>
              <option value="user">User</option>
            </select>
          </div>
          <button
            className={s.sendBtn}
            onClick={handleSend}
            disabled={loading || !email}
            type="button"
          >
            {loading ? <InlineLoader size="sm" /> : 'Send'}
          </button>
        </div>

        {/* Sent invitations list */}
        {sent.length > 0 && (
          <div className={s.sentList}>
            <div className={s.sentTitle}>Sent Invitations</div>
            {sent.map((inv, i) => (
              <div key={i} className={`${s.sentItem} ${inv.status === 'error' ? s.sentItemError : ''}`}>
                <div className={s.sentAvatar}>
                  {inv.email[0].toUpperCase()}
                </div>
                <div className={s.sentInfo}>
                  <div className={s.sentEmail}>{inv.email}</div>
                </div>
                <span className={s.sentRole}>{inv.role}</span>
                <span className={inv.status === 'sent' ? s.sentOk : s.sentFail}>
                  {inv.status === 'sent' ? '\u2713 Sent' : '\u2715 Failed'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {sent.length === 0 && (
          <div className={s.emptyState}>
            <div className={s.emptyIcon}>&#x1F465;</div>
            <div className={s.emptyText}>No invitations sent yet</div>
            <div className={s.emptyHint}>Add team members above — you can always invite more later from Settings.</div>
          </div>
        )}

        {/* Navigation */}
        <div className={s.wizardNav}>
          <div />
          <div className={s.navRight}>
            <button className={s.navSkip} onClick={onSkip}>Skip for now</button>
            <button className={s.navNext} onClick={() => onComplete({ invitations_sent: sent.length })}>CONTINUE &rarr;</button>
          </div>
        </div>
      </div>
    </div>
  );
}
