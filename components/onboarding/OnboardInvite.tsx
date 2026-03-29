'use client';

import { useState } from 'react';
import { useShellConfig } from '@/lib/shell-config';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '../toast';
import { InlineLoader } from '../loader';
import FormInput from '../ui/form-input';
import l from './step-layout.module.css';
import s from './OnboardInvite.module.css';

interface Props {
  onComplete: () => void;
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
    <div className={l.split}>
      <div className={l.narrative}>
        <div>
          <div className={l.chapter}>Step 4 of 6</div>
          <h2 className={l.narrTitle}>
            Build your<br /><span className={l.glow}>team</span>.
          </h2>
          <p className={l.narrText}>
            Invite planners, admins, or team members to your workspace.
            They&apos;ll receive an email with a link to join.
          </p>
          <div className={l.optionalBadge}>&#x25CB; Can be done later</div>
        </div>
      </div>

      <div className={l.form}>
        <div className={l.sectionTitle}>Invite Team Members</div>

        <div className={l.formRow}>
          <div style={{ flex: 2 }}>
            <FormInput
              label="Email Address"
              type="email"
              placeholder="colleague@firm.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={error}
              disabled={loading}
            />
          </div>
          <div className={l.selectGroup}>
            <label className={l.selectLabel}>Role</label>
            <select
              className={l.select}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={loading}
            >
              <option value="user">Planner</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>

        <button
          className={s.sendBtn}
          onClick={handleSend}
          disabled={loading || !email}
        >
          {loading ? <InlineLoader size="sm" message="Sending..." /> : 'Send Invite'}
        </button>

        {/* Sent list */}
        {sent.length > 0 && (
          <div className={s.sentList}>
            <div className={s.sentTitle}>Invitations</div>
            {sent.map((inv, i) => (
              <div key={i} className={`${s.sentItem} ${inv.status === 'error' ? s.sentError : ''}`}>
                <span className={s.sentEmail}>{inv.email}</span>
                <span className={s.sentRole}>{inv.role}</span>
                <span className={inv.status === 'sent' ? s.sentOk : s.sentFail}>
                  {inv.status === 'sent' ? '&#x2713; Sent' : '&#x2715; Failed'}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className={l.nav}>
          <div />
          <div className={l.navRight}>
            <button className={l.navSkip} onClick={onSkip}>Skip for now</button>
            <button className={l.navNext} onClick={onComplete}>CONTINUE &rarr;</button>
          </div>
        </div>
      </div>
    </div>
  );
}
