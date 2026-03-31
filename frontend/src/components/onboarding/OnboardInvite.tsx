'use client';

import { useState } from 'react';
import { useToast } from '../toast';
import { InlineLoader } from '../loader';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import s from './OnboardInvite.module.css';

interface Props {
  onComplete: () => void;
  onSkip?: () => void;
  onBack?: () => void;
}

interface SentInvite {
  email: string;
  role: string;
  status: 'sent' | 'error';
  message?: string;
}

const ROLES = [
  { value: 'admin', label: 'Admin', desc: 'Full access to workspace settings' },
  { value: 'planner', label: 'Planner', desc: 'Manage clients and portfolios' },
];

export default function OnboardInvite({ onComplete, onSkip, onBack }: Props) {
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState('planner');
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
      await apiFetch(API.invite.send, {
        body: { invitations: [{ email: email.trim().toLowerCase(), role_id: role }] },
      });
      setSent((prev) => [...prev, { email: email.trim(), role, status: 'sent' }]);
      showToast({ message: `Invitation sent to ${email}`, type: 'success' });
      setEmail('');
    } catch (err) {
      const apiErr = err as ApiError;
      const msg = apiErr.message || 'Failed to send';
      setSent((prev) => [...prev, { email: email.trim(), role, status: 'error', message: msg }]);
      showToast({ message: msg, type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={s.page}>
      {/* Header */}
      <div className={s.pageHeader}>
        <div className={s.headerIcon}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="28" height="28">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
          </svg>
        </div>
        <h1 className={s.pageTitle}>Invite Your Team</h1>
        <p className={s.pageSubtitle}>Add team members to your workspace. They&apos;ll receive an email invitation to join.</p>
      </div>

      {/* Invite Card */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
          <span className={s.cardTitle}>Send Invitation</span>
        </div>

        <div className={s.inviteForm}>
          <div className={s.field} style={{ flex: 1 }}>
            <label className={s.label}>Email Address</label>
            <input
              className={s.input}
              type="email"
              placeholder="colleague@yourfirm.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              disabled={loading}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            />
          </div>
          <div className={s.field} style={{ width: 180 }}>
            <label className={s.label}>Role</label>
            <select className={s.select} value={role} onChange={(e) => setRole(e.target.value)} disabled={loading}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <button className={s.sendBtn} onClick={handleSend} disabled={loading || !email} type="button">
            {loading ? <InlineLoader size="sm" /> : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                Send
              </>
            )}
          </button>
        </div>

        {error && <div className={s.fieldError}>{error}</div>}

        {/* Role descriptions */}
        <div className={s.roleHints}>
          {ROLES.map((r) => (
            <div key={r.value} className={s.roleHint}>
              <span className={s.roleHintName}>{r.label}:</span>
              <span className={s.roleHintDesc}>{r.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sent List Card */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
          </svg>
          <span className={s.cardTitle}>Team Members ({sent.length})</span>
        </div>

        {sent.length > 0 ? (
          <div className={s.sentList}>
            {sent.map((inv, i) => (
              <div key={i} className={`${s.sentItem} ${inv.status === 'error' ? s.sentItemError : ''}`}>
                <div className={s.sentAvatar}>{inv.email[0].toUpperCase()}</div>
                <div className={s.sentInfo}>
                  <div className={s.sentEmail}>{inv.email}</div>
                  <div className={s.sentRole}>{inv.role}</div>
                </div>
                <span className={inv.status === 'sent' ? s.sentOk : s.sentFail}>
                  {inv.status === 'sent' ? '\u2713 Sent' : '\u2715 Failed'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className={s.emptyState}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" width="40" height="40" className={s.emptyIcon}>
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
            <div className={s.emptyText}>No invitations sent yet</div>
            <div className={s.emptyHint}>
              Invite team members now, or skip and do it later from Settings.
            </div>
          </div>
        )}
      </div>

      {/* Note */}
      <div className={s.note}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
        <span>Invitations expire in 7 days. You can manage and resend invitations from Settings at any time.</span>
      </div>

      {/* Footer */}
      <div className={s.footerNav}>
        {onBack && (
          <button className={s.backBtn} onClick={onBack} type="button">
            &larr; Back
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button className={s.skipBtn} onClick={onSkip}>Skip for now</button>
        <button className={s.saveBtn} onClick={onComplete}>
          {sent.length > 0 ? 'CONTINUE \u2192' : 'SKIP & CONTINUE \u2192'}
        </button>
      </div>
    </div>
  );
}
