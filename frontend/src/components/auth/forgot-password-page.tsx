'use client';

import { useState, type FormEvent } from 'react';
import { useToast } from '@/components/toast';
import { InlineLoader } from '@/components/loader';
import FormInput from '@/components/ui/form-input';
import { useForgotPassword } from '@/hooks';
import type { ApiError } from '@/lib/api-client';
import s from './forgot-password-page.module.css';

export default function ForgotPasswordPage() {
  const { showToast } = useToast();
  const forgotMutation = useForgotPassword();

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [resetToken, setResetToken] = useState('');

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (forgotMutation.isPending) return;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setError('');

    forgotMutation.mutate(
      { email: email.trim().toLowerCase() },
      {
        onSuccess: (data) => {
          if (data.token) setResetToken(data.token);
          setSuccess(true);
        },
        onError: (err: ApiError) => {
          showToast({ message: err.message || 'Failed to send reset link', type: 'error' });
        },
      },
    );
  }

  const loading = forgotMutation.isPending;

  return (
    <div className={s.vault}>
      {/* ── LEFT: Story/Branding Panel ── */}
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
                Don&apos;t worry,<br />
                we&apos;ve got you<br />
                <span className={s.glowWord}>covered</span>.
              </h1>
              <p className={s.storyText}>
                Forgotten passwords happen to the best of us. We&apos;ll have you
                back in your vault in no time.
              </p>
              <div className={s.lockOrb}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
            </>
          ) : (
            <>
              <h1 className={s.headline}>
                Check your<br />
                <span className={s.glowWord}>inbox</span>.
              </h1>
              <p className={s.storyText}>
                A password reset link is on its way. Follow the instructions
                in the email to regain access.
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
              <a href="/register" className={s.topNavRight}>Create account &rarr;</a>
            </div>

            <div className={s.formHeader}>
              <div className={s.accentLine} />
              <h2 className={s.formTitle}>Reset your password</h2>
              <p className={s.formSubtitle}>Enter your email and we&apos;ll send you a reset link</p>
            </div>

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

              <button type="submit" className={s.submitBtn} disabled={loading || !email}>
                {loading ? (
                  <InlineLoader size="sm" message="SENDING..." />
                ) : (
                  'SEND RESET LINK \u2192'
                )}
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

              <h2 className={s.successTitle}>Check your inbox</h2>
              <p className={s.successDesc}>We&apos;ve sent a password reset link to:</p>
              <div className={s.successEmail}>{email}</div>

              {resetToken && (
                <div className={s.tokenBox}>
                  <span className={s.tokenLabel}>Reset Token (MVP)</span>
                  <code className={s.tokenValue}>{resetToken}</code>
                </div>
              )}

              <p className={s.successHint}>
                The link expires in 1 hour. Didn&apos;t receive it?<br />Check your spam folder.
              </p>

              <a href={`/reset-password${resetToken ? `?token=${resetToken}` : ''}`} className={s.backBtn}>
                RESET PASSWORD &rarr;
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
