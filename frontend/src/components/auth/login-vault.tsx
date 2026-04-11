'use client';

import { useState, type FormEvent } from 'react';
import { useLogin, type ActiveSession } from '@/hooks';
import { storeTokens, getAccessToken, type ApiError } from '@/lib/api-client';
import { VdfLoader } from '@/components/vdf';
import { useToast } from '@/components/toast';
import s from './login-vault.module.css';

interface SessionLimitData {
  max_sessions: number;
  active_sessions: ActiveSession[];
}

export default function LoginVault() {
  const loginMutation = useLogin();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');

  const [sessionLimit, setSessionLimit] = useState<SessionLimitData | null>(null);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [revokingLoading, setRevokingLoading] = useState(false);

  const loading = loginMutation.isPending;

  // If already have a token, redirect to dashboard (layout handles onboarding check)
  if (typeof window !== 'undefined' && getAccessToken()) {
    window.location.href = '/dashboard';
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loginMutation.isPending) return;
    setError('');

    loginMutation.mutate(
      { email: email.trim().toLowerCase(), password },
      {
        onSuccess: (data) => {
          // Store tokens explicitly before navigation
          if (data.tokens) {
            storeTokens(data.tokens);
          }

          // Persist theme from server response
          const user = data.user as Record<string, unknown>;
          const tenant = data.tenant as Record<string, unknown>;
          const prefs = user?.preferences as Record<string, unknown> | undefined;
          try {
            if (user?.preferred_theme) localStorage.setItem('pk-theme-id', String(user.preferred_theme));
            if (prefs?.color_mode) localStorage.setItem('pk-color-mode', String(prefs.color_mode));
          } catch {}

          showToast({ message: 'Welcome back!', type: 'success' });

          // Navigate based on onboarding status
          if (tenant?.onboarding_complete === true) {
            window.location.href = '/dashboard';
          } else {
            window.location.href = '/onboarding';
          }
        },
        onError: (err: ApiError) => {
          // Session limit → show dialog
          if (err.code === 'SESSION_LIMIT' && err.details) {
            setSessionLimit({
              max_sessions: (err.details as any).max_sessions || 5,
              active_sessions: (err.details as any).active_sessions || [],
            });
            return;
          }
          setError(err.message);
        },
      },
    );
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

    // TODO: Wire to real revoke endpoint when built
    showToast({ message: 'Session revoke not yet implemented', type: 'warning' });
    setRevokingLoading(false);
  }

  return (
    <>
      {/* ProKey loader during login */}
      {loading && <VdfLoader overlay message="Signing in" hint="Verifying credentials & creating session" />}

      <div className={s.vault}>
        {/* Atmospheric background */}
        <div className={s.atmosphere} />
        <div className={s.noise} />

        {/* ── LEFT: The Story ── */}
        <div className={s.vaultStory}>
          {/* Orbiting rings */}
          <div className={s.orbits}>
            <div className={`${s.orbit} ${s.orbit1}`} />
            <div className={`${s.orbit} ${s.orbit2}`} />
            <div className={`${s.orbit} ${s.orbit3}`} />
          </div>

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
            {/* Brand orb */}
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

            <h1 className={s.storyHeadline}>
              Every fortune<br />
              has a <span className={s.glowWord}>story</span>.<br />
              Help them write it.
            </h1>

            <p className={s.storyText}>
              You don&apos;t just manage portfolios — you architect futures.
              The intelligence to see what others miss.
            </p>
          </div>

          {/* Bottom ticker */}
          <div className={s.storyTicker}>
            <div className={s.tickerItem}>
              <span className={s.tickerValue}>&#8377;500Cr+</span>
              <span className={s.tickerLabel}>AUM Managed</span>
            </div>
            <div className={s.tickerDot} />
            <div className={s.tickerItem}>
              <span className={s.tickerValue}>2,000+</span>
              <span className={s.tickerLabel}>Families Served</span>
            </div>
            <div className={s.tickerDot} />
            <div className={s.tickerItem}>
              <span className={`${s.tickerValue} ${s.textUp}`}>18.4%</span>
              <span className={s.tickerLabel}>Avg XIRR</span>
            </div>
          </div>
        </div>

        {/* ── RIGHT: The Form ── */}
        <div className={s.vaultForm}>
          {/* Top navigation */}
          <div className={s.topNav}>
            <a href="/landing" className={s.backLink}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span>Back</span>
            </a>
            <a href="/register" className={s.registerLink}>
              Create account &rarr;
            </a>
          </div>

          <div className={s.formHeader}>
            <div className={s.goldLine} />
            <h2 className={s.formTitle}>Welcome back</h2>
            <p className={s.formSubtitle}>Sign in to your advisory dashboard</p>
          </div>

          {/* Platform feature strip */}
          <div className={s.featureStrip}>
            <div className={s.featureItem}>
              <div className={s.featureIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <div className={s.featureText}>
                <span className={s.featureName}>Portfolio Intelligence</span>
                <span className={s.featureDesc}>Real-time XIRR &middot; NAV sync &middot; Goal tracking</span>
              </div>
              <div className={s.featurePulse} />
            </div>
            <div className={s.featureItem}>
              <div className={s.featureIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div className={s.featureText}>
                <span className={s.featureName}>Client Universe</span>
                <span className={s.featureDesc}>360° profiles &middot; Family groups &middot; KYC records</span>
              </div>
              <div className={s.featurePulse} />
            </div>
            <div className={s.featureItem}>
              <div className={s.featureIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <path d="M8 21h8M12 17v4" />
                  <path d="M7 8l3 3 2-2 3 3" />
                </svg>
              </div>
              <div className={s.featureText}>
                <span className={s.featureName}>Market Intelligence</span>
                <span className={s.featureDesc}>40,000+ schemes &middot; Live NAV &middot; Sector coverage</span>
              </div>
              <div className={s.featurePulse} />
            </div>
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
              <div className={s.passwordWrap}>
                <input
                  type={showPw ? 'text' : 'password'}
                  className={s.formInput}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  className={s.eyeToggle}
                  onClick={() => setShowPw(!showPw)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPw ? '\u{1F648}' : '\u{1F441}'}
                </button>
              </div>
            </div>

            <div className={s.forgotLink}>
              <a href="/forgot-password">Forgot your password?</a>
            </div>

            <button
              type="submit"
              className={`${s.submitBtn} ${loading ? s.submitBtnLoading : ''}`}
              disabled={!email || !password || loading}
            >
              <span className={s.submitText}>
                {loading ? 'SIGNING IN...' : 'ENTER THE ATLAS \u2192'}
              </span>
            </button>
          </form>

          {/* Trust strip */}
          <div className={s.trustStrip}>
            <div className={s.trustItem}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
              <span>256-bit encrypted</span>
            </div>
            <div className={s.trustDot} />
            <div className={s.trustItem}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span>SOC 2 compliant</span>
            </div>
          </div>

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
