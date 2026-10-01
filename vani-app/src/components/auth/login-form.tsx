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
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-provider';
import { ApiError } from '@/lib/api-client';
import VaniMark from './vani-mark';
import styles from './auth-card.module.css';

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
      router.replace('/dashboard');
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
          <VaniMark className={styles.mark} />
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
          VaNi is not open to the public. Creating an organisation needs an
          access phrase from the Vikuna team.
        </p>

        <div className={styles.alt}>
          Have an access phrase?
          <Link className={styles.altLink} href="/gate">
            Create an organisation
          </Link>
        </div>

        {/* The way back out. Someone landing here cold has no other way to find
            out what VaNi is; the story is the console's own landing page. */}
        <Link className={styles.back} href="/">
          ← What is VaNi?
        </Link>
      </div>
    </div>
  );
}
