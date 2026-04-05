'use client';

import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { useToast } from '@/components/toast';
import { InlineLoader } from '@/components/loader';
import FormInput from '@/components/ui/form-input';
import PasswordStrength from '@/components/ui/password-strength';
import { useResetPassword } from '@/hooks';
import type { ApiError } from '@/lib/api-client';
import f from '@/styles/forms.module.css';
import s from './reset-password-page.module.css';

export default function ResetPasswordPage() {
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const resetMutation = useResetPassword();

  const [token, setToken] = useState(searchParams?.get('token') || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!token.trim()) e.token = 'Reset token is required';
    if (!newPassword || newPassword.length < 8) {
      e.newPassword = 'Password must be at least 8 characters';
    } else if (!/[A-Z]/.test(newPassword)) {
      e.newPassword = 'Password must contain at least 1 uppercase letter';
    } else if (!/[0-9]/.test(newPassword)) {
      e.newPassword = 'Password must contain at least 1 number';
    }
    if (newPassword !== confirmPassword) e.confirmPassword = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (resetMutation.isPending) return;
    if (!validate()) return;

    resetMutation.mutate(
      { token: token.trim(), new_password: newPassword },
      {
        onSuccess: () => {
          showToast({ message: 'Password reset successful!', type: 'success' });
          setSuccess(true);
        },
        onError: (err: ApiError) => {
          showToast({ message: err.message || 'Failed to reset password', type: 'error' });
        },
      },
    );
  }

  function EyeToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
    return (
      <button type="button" className={f.eyeToggle} onClick={onToggle} aria-label={visible ? 'Hide password' : 'Show password'} tabIndex={-1}>
        {visible ? '\u{1F648}' : '\u{1F441}'}
      </button>
    );
  }

  const showMatch = confirmPassword.length > 0;
  const matched = newPassword === confirmPassword && newPassword.length > 0;
  const loading = resetMutation.isPending;

  return (
    <div className={s.vault}>
      {/* ── LEFT: Story Panel ── */}
      <div className={s.storyPanel}>
        <div className={s.orbits}>
          <div className={`${s.orbit} ${s.orbit1}`} />
          <div className={`${s.orbit} ${s.orbit2}`} />
          <div className={`${s.orbit} ${s.orbit3}`} />
        </div>

        <div className={s.storyContent}>
          <div className={s.brandOrb}>
            <div className={s.brandOrbInner}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <div className={s.brandOrbRing} />
          </div>

          <div className={s.brandText}>
            <div className={s.brandName}>KI-PRIME</div>
            <div className={s.brandSub}>by Vikuna Technologies</div>
          </div>

          {!success ? (
            <>
              <h1 className={s.headline}>
                Secure your<br /><span className={s.glowWord}>vault</span>.
              </h1>
              <p className={s.storyText}>
                Choose a strong, unique password to protect your financial intelligence.
              </p>
              <div className={s.keyOrb}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="8" cy="15" r="5" />
                  <path d="M11.5 11.5L22 1" />
                  <path d="M18 5l4-4" />
                  <path d="M16 7l2-2" />
                </svg>
              </div>
            </>
          ) : (
            <>
              <h1 className={s.headline}>
                You&apos;re back<br /><span className={s.glowWord}>in</span>.
              </h1>
              <p className={s.storyText}>
                Your vault is secured with a fresh password. Welcome back.
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── RIGHT: Form Panel ── */}
      <div className={s.formPanel}>
        {!success ? (
          <>
            <div className={s.topNav}>
              <a href="/login" className={s.backLink}>&larr; Back to sign in</a>
            </div>

            <div className={s.formHeader}>
              <div className={s.accentLine} />
              <h2 className={s.formTitle}>Choose a new password</h2>
              <p className={s.formSubtitle}>Enter your reset token and set a strong new password</p>
            </div>

            <form onSubmit={handleSubmit} noValidate>
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

              <FormInput
                label="New Password"
                type={showPw ? 'text' : 'password'}
                placeholder="Min 8 chars, 1 uppercase, 1 number"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                error={errors.newPassword}
                required
                disabled={loading}
                rightElement={<EyeToggle visible={showPw} onToggle={() => setShowPw(!showPw)} />}
              />
              <div className={f.strengthWrap}>
                <PasswordStrength password={newPassword} />
              </div>

              <FormInput
                label="Confirm New Password"
                type={showConfirm ? 'text' : 'password'}
                placeholder="Re-enter your new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={errors.confirmPassword}
                required
                disabled={loading}
                rightElement={<EyeToggle visible={showConfirm} onToggle={() => setShowConfirm(!showConfirm)} />}
              />
              {showMatch && (
                <div className={`${f.matchIndicator} ${matched ? f.matchOk : f.matchNo}`}>
                  <span className={f.matchDot} />
                  <span>{matched ? 'Passwords match' : 'Passwords do not match'}</span>
                </div>
              )}

              <button type="submit" className={s.submitBtn} disabled={loading || !token || !newPassword || !confirmPassword}>
                {loading ? <InlineLoader size="sm" message="RESETTING..." /> : 'RESET PASSWORD \u2192'}
              </button>
            </form>

            <div className={s.footer}>
              <a href="/login" className={s.footerLink}>&larr; Back to sign in</a>
            </div>
          </>
        ) : (
          <>
            <div className={s.topNav}>
              <a href="/login" className={s.backLink}>&larr; Back to sign in</a>
            </div>

            <div className={s.successContent}>
              <div className={s.checkOrb}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" className={s.checkPath} />
                </svg>
                <div className={s.checkRing} />
              </div>

              <h2 className={s.successTitle}>Password reset successful</h2>
              <p className={s.successDesc}>
                Your password has been updated. All existing sessions have been revoked for security.
              </p>

              <a href="/login" className={s.signInBtn}>
                SIGN IN WITH NEW PASSWORD &rarr;
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
