'use client';

/**
 * VaNi AI console login — /console/login
 *
 * The blueprint's own .login-card markup, backed by the app's existing
 * useLogin() / AuthProvider / /api/v1/auth/* — no new auth, and the GTM
 * app's own /login page is left exactly as it is (this is a second
 * front door onto the same auth, not a restyle of the first).
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLogin } from '@/hooks';
import { useAuth } from '@/context/auth-provider';
import type { ApiError } from '@/lib/api-client';
import s from '../console.module.css';
import v from '../../vani-tokens.module.css';

export default function ConsoleLoginPage() {
  const router = useRouter();
  const login = useLogin();
  const { isAuthenticated, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Already signed in (e.g. refreshed the tab) — don't make them log in twice.
  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace('/console');
  }, [isLoading, isAuthenticated, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login.mutateAsync({ email: email.trim(), password });
      router.push('/console');
    } catch (err) {
      const apiErr = err as ApiError;
      // Deliberately not distinguishing "no such user" from "wrong password"
      // — the backend doesn't either, and neither should the screen.
      setError(apiErr?.code === 'SESSION_LIMIT'
        ? 'Too many active sessions. Sign out elsewhere and try again.'
        : 'Those credentials were not accepted.');
    }
  }

  return (
    <div className={v.vaniRoot}>
      <div className={v.darkStage}>
        <div className={v.wrap}>
          <div className={s.loginStage}>
            <div className={s.loginCard}>
              <div className={s.orb} />
              <h2>VaNi <em className={s.cyanEm}>AI</em> Console</h2>
              <div className={s.sub}>Owner &amp; partner access only</div>

              {error && (
                <div className={s.errBanner} role="alert">
                  <span aria-hidden>⚠</span><span>{error}</span>
                </div>
              )}

              <form onSubmit={onSubmit} noValidate>
                <div className={s.field}>
                  <label htmlFor="c-email">EMAIL</label>
                  <input id="c-email" type="email" autoComplete="username" required
                    value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className={s.field}>
                  <label htmlFor="c-password">PASSWORD</label>
                  <input id="c-password" type="password" autoComplete="current-password" required
                    value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <button type="submit" className={`${s.btn} ${s.btnFull}`}
                  style={{ marginTop: 8 }} disabled={login.isPending}>
                  {login.isPending ? 'Signing in…' : 'Sign in →'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
