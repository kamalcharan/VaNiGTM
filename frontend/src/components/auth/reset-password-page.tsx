'use client';

import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { useShellConfig } from '@/lib/shell-config';
import { useToast } from './toast';
import { InlineLoader } from './loader';
import FormInput from './ui/form-input';
import PasswordStrength from './ui/password-strength';
import s from './reset-password-page.module.css';

export default function ResetPasswordPage() {
  const { apiUrl, product } = useShellConfig();
  const { showToast } = useToast();
  const searchParams = useSearchParams();

  const [token, setToken] = useState(searchParams?.get('token') || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  /* ── Validation ────────────────────────────────────── */

  function validate(): boolean {
    const e: Record<string, string> = {};

    if (!token.trim()) {
      e.token = 'Reset token is required';
    }
    if (!newPassword || newPassword.length < 8) {
      e.newPassword = 'Password must be at least 8 characters';
    }
    if (newPassword !== confirmPassword) {
      e.confirmPassword = 'Passwords do not match';
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  /* ── Submit ────────────────────────────────────────── */

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setErrors({});

    try {
      const res = await fetch(`${apiUrl}/api/v1/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token.trim(),
          new_password: newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg =
          data?.error?.message || data?.message || 'Failed to reset password';
        showToast({ message: msg, type: 'error' });
        setLoading(false);
        return;
      }

      showToast({ message: 'Password reset successful!', type: 'success' });
      setSuccess(true);
    } catch {
      showToast({ message: 'Network error — please try again', type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  /* ── Eye toggle ────────────────────────────────────── */

  function EyeToggle({
    visible,
    onToggle,
  }: {
    visible: boolean;
    onToggle: () => void;
  }) {
    return (
      <button
        type="button"
        className={s.eyeToggle}
        onClick={onToggle}
        aria-label={visible ? 'Hide password' : 'Show password'}
        tabIndex={-1}
      >
        {visible ? '\u{1F648}' : '\u{1F441}'}
      </button>
    );
  }

  /* ── Match indicator ───────────────────────────────── */

  const showMatch = confirmPassword.length > 0;
  const matched = newPassword === confirmPassword && newPassword.length > 0;

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
          /* ── Reset Form ── */
          <div className={s.formState}>
            <div className={s.keyOrb}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="8" cy="15" r="5" />
                <path d="M11.5 11.5L22 1" />
                <path d="M18 5l4-4" />
                <path d="M16 7l2-2" />
              </svg>
            </div>

            <h2 className={s.cardTitle}>Reset your password</h2>
            <p className={s.cardDesc}>
              Enter your reset token and choose a new password.
            </p>

            <form onSubmit={handleSubmit} noValidate>
              {/* Token */}
              <FormInput
                label="Reset Token"
                placeholder="Paste your reset token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                error={errors.token}
                required
                disabled={loading}
                autoFocus={!token}
              />

              {/* New Password */}
              <FormInput
                label="New Password"
                type={showPw ? 'text' : 'password'}
                placeholder="Min 8 chars, 1 uppercase, 1 number"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                error={errors.newPassword}
                required
                disabled={loading}
                rightElement={
                  <EyeToggle visible={showPw} onToggle={() => setShowPw(!showPw)} />
                }
              />
              <div className={s.strengthWrap}>
                <PasswordStrength password={newPassword} />
              </div>

              {/* Confirm Password */}
              <FormInput
                label="Confirm New Password"
                type={showConfirm ? 'text' : 'password'}
                placeholder="Re-enter your new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={errors.confirmPassword}
                required
                disabled={loading}
                rightElement={
                  <EyeToggle
                    visible={showConfirm}
                    onToggle={() => setShowConfirm(!showConfirm)}
                  />
                }
              />
              {showMatch && (
                <div className={`${s.matchIndicator} ${matched ? s.matchOk : s.matchNo}`}>
                  <span className={s.matchDot} />
                  <span>{matched ? 'Passwords match' : 'Passwords do not match'}</span>
                </div>
              )}

              <button
                type="submit"
                className={s.submitBtn}
                disabled={loading || !token || !newPassword || !confirmPassword}
              >
                {loading ? (
                  <InlineLoader size="sm" message="RESETTING..." />
                ) : (
                  'RESET PASSWORD \u2192'
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

            <h2 className={s.successTitle}>Password reset successful</h2>
            <p className={s.successDesc}>
              Your password has been updated. You can now sign in with your new password.
            </p>

            <a href="/login" className={s.signInBtn}>
              SIGN IN WITH NEW PASSWORD &rarr;
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
