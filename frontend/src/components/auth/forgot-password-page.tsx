'use client';

import { useState, type FormEvent } from 'react';
import { useShellConfig } from '@/lib/shell-config';
import { useToast } from '@/../components/toast';
import { InlineLoader } from '@/../components/loader';
import FormInput from '@/../components/ui/form-input';
import s from './forgot-password-page.module.css';

export default function ForgotPasswordPage() {
  const { apiUrl, product } = useShellConfig();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [resetToken, setResetToken] = useState('');

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${apiUrl}/api/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await res.json();

      if (!res.ok) {
        showToast({
          message: data?.error?.message || data?.message || 'Failed to send reset link',
          type: 'error',
        });
        setLoading(false);
        return;
      }

      // MVP: API returns the token directly
      if (data.token) {
        setResetToken(data.token);
      }

      setSuccess(true);
    } catch {
      showToast({ message: 'Network error — please try again', type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={s.page}>
      {/* ── Brand Mark ── */}
      <div className={s.brandMark}>
        <div className={s.brandIcon}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <div>
          <div className={s.brandName}>{product.name}</div>
          <div className={s.brandSub}>by Vikuna Technologies</div>
        </div>
      </div>

      {/* ── Glass Card ── */}
      <div className={s.card}>
        {!success ? (
          /* ── Request State ── */
          <div className={s.requestState}>
            <div className={s.lockOrb}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>

            <h2 className={s.cardTitle}>Forgot your password?</h2>
            <p className={s.cardDesc}>
              No worries. Enter the email linked to your account and
              we&apos;ll send you a reset link.
            </p>

            <form onSubmit={handleSubmit} noValidate>
              <FormInput
                label="Email Address"
                type="email"
                placeholder="you@yourfirm.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={error}
                required
                disabled={loading}
                autoFocus
              />

              <button
                type="submit"
                className={s.submitBtn}
                disabled={loading || !email}
              >
                {loading ? (
                  <InlineLoader size="sm" message="SENDING..." />
                ) : (
                  'SEND RESET LINK \u2192'
                )}
              </button>
            </form>

            <div className={s.footer}>
              <a href="/login" className={s.footerLink}>
                &larr; Back to sign in
              </a>
            </div>
          </div>
        ) : (
          /* ── Success State ── */
          <div className={s.successState}>
            <div className={s.checkOrb}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" className={s.checkPath} />
              </svg>
              <div className={s.checkRing} />
            </div>

            <h2 className={s.successTitle}>Check your inbox</h2>
            <p className={s.successDesc}>
              We&apos;ve sent a password reset link to:
            </p>
            <div className={s.successEmail}>{email}</div>

            {/* MVP: Show token directly */}
            {resetToken && (
              <div className={s.tokenBox}>
                <span className={s.tokenLabel}>Reset Token (MVP)</span>
                <code className={s.tokenValue}>{resetToken}</code>
              </div>
            )}

            <p className={s.successHint}>
              The link expires in 30 minutes. Didn&apos;t receive it?
              <br />
              Check your spam folder.
            </p>

            <a href="/login" className={s.backBtn}>
              &larr; Back to sign in
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
