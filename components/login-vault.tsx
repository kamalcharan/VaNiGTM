'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, type SessionLimitResponse, type ActiveSession } from '@/context/auth-provider';
import s from './login-vault.module.css';

/**
 * KI-Prime Login Vault — Atlas Design
 *
 * Glassmorphic split-layout login page matching the 01-login-vault.html prototype.
 * Uses custom Atlas palette (void black + gold), independent of vikuna-black theme vars.
 * Intended to be plugged into VaNiBase shell via ShellConfig.pages.login override.
 */
export default function LoginVault() {
  const { login, revokeSessions, isAuthenticated, tenant } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loginComplete, setLoginComplete] = useState(false);

  // Session limit state
  const [sessionLimit, setSessionLimit] = useState<SessionLimitResponse | null>(null);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [revokingLoading, setRevokingLoading] = useState(false);
  const [role, setRole] = useState<'planner' | 'admin' | 'investor'>('planner');

  // Redirect after auth state is fully resolved (including /auth/me)
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!loginComplete && !tenant) return; // wait for /auth/me to populate tenant

    if (tenant?.onboarding_complete === true) {
      router.replace('/');
    } else {
      router.replace('/onboarding');
    }
  }, [isAuthenticated, loginComplete, tenant, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(email, password);

      if ('code' in result && result.code === 'SESSION_LIMIT') {
        setSessionLimit(result);
        setLoading(false);
        return;
      }

      // Signal that login succeeded — useEffect handles redirect
      // after AuthProvider populates tenant with onboarding_complete
      setLoginComplete(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setLoading(false);
    }
  }

  function toggleSession(sessionId: string) {
    setSelectedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }

  async function handleRevokeSessions() {
    if (selectedSessions.size === 0) return;
    setRevokingLoading(true);
    setError('');

    try {
      const result = await revokeSessions(
        Array.from(selectedSessions),
        email,
        password,
      );

      if ('code' in result && result.code === 'SESSION_LIMIT') {
        setSessionLimit(result);
        setSelectedSessions(new Set());
        setRevokingLoading(false);
        return;
      }

      // Success — useEffect handles redirect based on onboarding status
      setSessionLimit(null);
      setLoginComplete(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke sessions');
      setRevokingLoading(false);
    }
  }

  // Already authenticated — useEffect will redirect, show nothing
  if (isAuthenticated) return null;

  return (
    <>
      <div className={s.vault}>
        {/* Atmospheric background */}
        <div className={s.atmosphere} />
        <div className={s.noise} />

        {/* ── LEFT: The Story ── */}
        <div className={s.vaultStory}>
          <div className={s.particles}>
            {[10, 25, 45, 65, 80, 15, 55, 90].map((left, i) => (
              <div
                key={i}
                className={s.particle}
                style={{
                  left: `${left}%`,
                  animationDelay: `${[0, 1.5, 3, 0.5, 2, 4, 5, 1][i]}s`,
                  animationDuration: `${[7, 9, 6, 8, 10, 7.5, 6.5, 9.5][i]}s`,
                }}
              />
            ))}
          </div>

          <div className={s.storyContent}>
            <div className={s.brandMark}>
              <div className={s.brandIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <div>
                <div className={s.brandName}>KI-PRIME</div>
                <div className={s.brandSub}>by Vikuna Technologies</div>
              </div>
            </div>

            <h1 className={s.storyHeadline}>
              Every fortune<br />
              has a <span className={s.goldWord}>story</span>.<br />
              Help them write it.
            </h1>

            <p className={s.storyText}>
              You don&apos;t just manage portfolios — you architect futures.
              KI-Prime gives you the intelligence to see what others miss,
              and the tools to act before the moment passes.
            </p>
          </div>

          <div className={s.storyTicker}>
            <div className={s.tickerItem}>
              <span className={s.tickerValue}>&#8377;500Cr+</span>
              <span className={s.tickerLabel}>AUM Managed</span>
            </div>
            <div className={s.tickerItem}>
              <span className={s.tickerValue}>2,000+</span>
              <span className={s.tickerLabel}>Families Served</span>
            </div>
            <div className={s.tickerItem}>
              <span className={`${s.tickerValue} ${s.textUp}`}>18.4%</span>
              <span className={s.tickerLabel}>Avg XIRR</span>
            </div>
          </div>
        </div>

        {/* ── RIGHT: The Form ── */}
        <div className={s.vaultForm}>
          <div className={s.formHeader}>
            <div className={s.goldLine} />
            <h2 className={s.formTitle}>Welcome back</h2>
            <p className={s.formSubtitle}>Select your role to continue</p>
          </div>

          {/* Role selector */}
          <div className={s.roleSelector}>
            <button
              type="button"
              className={`${s.roleOption} ${role === 'planner' ? s.roleOptionActive : ''}`}
              onClick={() => setRole('planner')}
            >
              <span className={s.roleIcon}>&#x2B21;</span>
              <span className={s.roleName}>Planner</span>
              <span className={s.roleDesc}>MFD / RIA / IFA</span>
            </button>
            <button
              type="button"
              className={`${s.roleOption} ${role === 'admin' ? s.roleOptionActive : ''}`}
              onClick={() => setRole('admin')}
            >
              <span className={s.roleIcon}>&#x25C8;</span>
              <span className={s.roleName}>Firm Admin</span>
              <span className={s.roleDesc}>Distributor / RIA Firm</span>
            </button>
            <button
              type="button"
              className={`${s.roleOption} ${role === 'investor' ? s.roleOptionActive : ''}`}
              onClick={() => setRole('investor')}
            >
              <span className={s.roleIcon}>&#x25CB;</span>
              <span className={s.roleName}>Investor</span>
              <span className={s.roleDesc}>Client Portal</span>
            </button>
          </div>

          {/* Error alert */}
          {error && (
            <div className={s.errorAlert}>
              <span>{error}</span>
              <button className={s.errorDismiss} onClick={() => setError('')}>&times;</button>
            </div>
          )}

          {/* Login form */}
          <form onSubmit={handleSubmit}>
            <div className={`${s.formGroup} ${s.delay1}`}>
              <label className={s.formLabel}>Email</label>
              <input
                type="email"
                className={s.formInput}
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
                disabled={loading}
              />
            </div>

            <div className={`${s.formGroup} ${s.delay2}`}>
              <label className={s.formLabel}>Password</label>
              <input
                type="password"
                className={s.formInput}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className={s.forgotLink}>
              <a href="/forgot-password">Forgot your password?</a>
            </div>

            <button
              type="submit"
              className={`${s.submitBtn} ${loading ? s.submitBtnLoading : ''}`}
              disabled={!email || !password || loading}
            >
              {loading ? 'SIGNING IN...' : 'ENTER THE ATLAS \u2192'}
            </button>
          </form>

          <div className={s.formFooter}>
            <a href="/register" className={s.formFooterLink}>
              Don&apos;t have an account? <span className={s.formFooterAccent}>Register &rarr;</span>
            </a>
          </div>
        </div>
      </div>

      {/* ── Session Limit Modal ── */}
      {sessionLimit && (
        <div className={s.modalOverlay}>
          <div className={s.modalCard}>
            <h3 className={s.modalTitle}>Session Limit Reached</h3>
            <p className={s.modalSubtitle}>
              You have reached the maximum of {sessionLimit.max_sessions} active sessions.
              Select sessions to end, then try again.
            </p>

            <div className={s.sessionList}>
              {sessionLimit.active_sessions.map((session: ActiveSession) => (
                <div
                  key={session.session_id}
                  className={`${s.sessionCard} ${
                    selectedSessions.has(session.session_id) ? s.sessionCardSelected : ''
                  }`}
                  onClick={() => toggleSession(session.session_id)}
                >
                  <input
                    type="checkbox"
                    className={s.sessionCheckbox}
                    checked={selectedSessions.has(session.session_id)}
                    onChange={() => toggleSession(session.session_id)}
                  />
                  <div className={s.sessionInfo}>
                    <div className={s.sessionDevice}>
                      {session.browser || 'Unknown'} on {session.os || 'Unknown'}
                    </div>
                    <div className={s.sessionMeta}>
                      {session.device_type || 'unknown'} &middot; {session.ip_address || 'unknown IP'}
                    </div>
                    <div className={s.sessionMeta}>
                      Last active: {new Date(session.last_activity_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {error && (
              <div className={s.errorAlert}>
                <span>{error}</span>
              </div>
            )}

            <div className={s.modalActions}>
              <button className={s.btnCancel} onClick={() => setSessionLimit(null)}>
                Cancel
              </button>
              <button
                className={s.btnRevoke}
                disabled={selectedSessions.size === 0 || revokingLoading}
                onClick={handleRevokeSessions}
              >
                {revokingLoading
                  ? 'Ending...'
                  : `End ${selectedSessions.size} session${selectedSessions.size !== 1 ? 's' : ''} & Sign in`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
