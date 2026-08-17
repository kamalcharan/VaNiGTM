'use client';

/**
 * Login — the base slice.
 *
 * Shape follows VaNiGTM's login-vault.tsx; the session-limit / revoke-sessions
 * branch is deliberately left out until session management moves over.
 *
 * The error message stays generic on every failure. Distinguishing "no such
 * user" from "wrong password" is how account enumeration starts, and the
 * backend already returns a single message for both.
 */

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-provider';
import { ApiError } from '@/lib/api-client';
import styles from './login-form.module.css';

export default function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;

    if (!email.trim() || !password) {
      setError('Enter both an email and a password.');
      return;
    }

    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
      router.replace('/home');
    } catch (err) {
      setPassword('');
      setError(
        err instanceof ApiError
          ? err.message
          : 'Something went wrong. Please try again.',
      );
      setBusy(false);
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.glow} />
      <div className={styles.mesh} />

      <div className={styles.card}>
        <div className={styles.brand}>
          <svg className={styles.mark} viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <circle cx="16" cy="16" r="3.2" fill="var(--gold)" />
            <circle cx="16" cy="5.5" r="2.4" fill="none" stroke="var(--gold)" strokeWidth="1.5" />
            <circle cx="25" cy="21.5" r="2.4" fill="none" stroke="var(--gold)" strokeWidth="1.5" />
            <circle cx="7" cy="21.5" r="2.4" fill="none" stroke="var(--gold)" strokeWidth="1.5" />
            <line x1="16" y1="8" x2="16" y2="12.8" stroke="var(--gold)" strokeWidth="1" strokeOpacity="0.6" />
            <line x1="23" y1="19.8" x2="18.9" y2="17.6" stroke="var(--gold)" strokeWidth="1" strokeOpacity="0.6" />
            <line x1="9" y1="19.8" x2="13.1" y2="17.6" stroke="var(--gold)" strokeWidth="1" strokeOpacity="0.6" />
            <circle cx="16" cy="16" r="12.5" stroke="var(--gold)" strokeWidth="1" strokeOpacity="0.22" />
          </svg>
          <div className={styles.word}>VaNi</div>
          <div className={styles.kicker}>Vikuna AI Platform</div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="vani-email">
              Email
            </label>
            <input
              id="vani-email"
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@vikuna.io"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              disabled={busy}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="vani-password">
              Password
            </label>
            <div className={styles.pwWrap}>
              <input
                id="vani-password"
                className={styles.input}
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={busy}
              />
              <button
                type="button"
                className={styles.reveal}
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {error && (
            <div className={styles.error} role="alert">
              <span aria-hidden="true">⚠</span>
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className={styles.submit} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className={styles.foot}>
          VaNi is an internal platform. Accounts are issued by the Vikuna team —
          there is no public registration.
        </p>

        {/* The way back out. Someone landing here cold has no other way to find
            out what VaNi is; the public story lives on the marketing site. */}
        <a className={styles.back} href="https://www.vikuna.io/vani">
          What is VaNi? →
        </a>
      </div>
    </div>
  );
}
