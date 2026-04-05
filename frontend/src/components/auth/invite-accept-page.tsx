'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useShellConfig } from '@/lib/shell-config';
import { useToast } from '@/components/toast';
import { InlineLoader } from '@/components/loader';
import { VdfLoader } from '@/components/vdf';
import FormInput from '@/components/ui/form-input';
import CountryDropdown, { type Country } from '@/components/ui/country-dropdown';
import PasswordStrength from '@/components/ui/password-strength';
import f from '@/styles/forms.module.css';
import s from './invite-accept-page.module.css';

/* ── Types ───────────────────────────────────────────── */

interface InviteContext {
  email: string;
  tenant_name: string;
  tenant_slug?: string;
  role: string;
  invited_by?: string;
  expires_at?: string;
}

export default function InviteAcceptPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { apiUrl, product } = useShellConfig();
  const { showToast } = useToast();

  const token = searchParams?.get('token') || '';

  /* ── Invite context state ──────────────────────────── */
  const [invite, setInvite] = useState<InviteContext | null>(null);
  const [contextLoading, setContextLoading] = useState(!!token);
  const [expired, setExpired] = useState(false);
  const [expiredMessage, setExpiredMessage] = useState('');

  /* ── Form state ────────────────────────────────────── */
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState<Country>({
    code: 'in',
    dial_code: '+91',
    name: 'India',
  });
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  /* ── Fetch invitation context ──────────────────────── */

  const fetchInviteContext = useCallback(async () => {
    if (!token) {
      setContextLoading(false);
      return;
    }
    try {
      const res = await fetch(
        `${apiUrl}/api/v1/auth/invite/validate?token=${encodeURIComponent(token)}`,
      );
      if (res.ok) {
        const data = await res.json();
        setInvite(data);
        if (data.email) setEmail(data.email);
      } else if (res.status === 410 || res.status === 404) {
        const data = await res.json().catch(() => ({}));
        setExpired(true);
        setExpiredMessage(
          data?.error?.message ||
            'This invitation has expired or is no longer valid.',
        );
      }
      // If validation endpoint doesn't exist, just proceed with form
    } catch {
      // Network error or endpoint not available — proceed with form
    } finally {
      setContextLoading(false);
    }
  }, [apiUrl, token]);

  useEffect(() => {
    fetchInviteContext();
  }, [fetchInviteContext]);

  /* ── Days remaining ────────────────────────────────── */

  const daysRemaining = invite?.expires_at
    ? Math.max(
        0,
        Math.ceil(
          (new Date(invite.expires_at).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24),
        ),
      )
    : null;

  /* ── Validation ────────────────────────────────────── */

  function validate(): boolean {
    const e: Record<string, string> = {};

    if (!fullName || fullName.trim().length < 2) {
      e.fullName = 'Name must be at least 2 characters';
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      e.email = 'Please enter a valid email address';
    }
    if (!password || password.length < 8) {
      e.password = 'Password must be at least 8 characters';
    }
    if (password !== confirmPassword) {
      e.confirmPassword = 'Passwords do not match';
    }
    if (phone && !/^\d+$/.test(phone.replace(/\s/g, ''))) {
      e.phone = 'Phone must contain digits only';
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
      const phoneWithCode = phone
        ? `${country.dial_code}${phone.replace(/\s/g, '')}`
        : undefined;

      const res = await fetch(`${apiUrl}/api/v1/auth/invite/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invitation_code: token,
          full_name: fullName.trim(),
          password,
          phone: phoneWithCode,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg =
          data?.error?.message || data?.message || 'Failed to accept invitation';

        if (res.status === 410 || res.status === 404) {
          setExpired(true);
          setExpiredMessage(msg);
          setLoading(false);
          return;
        }

        if (data?.error?.field) {
          setErrors({ [data.error.field]: msg });
        }

        showToast({ message: msg, type: 'error' });
        setLoading(false);
        return;
      }

      // Store tokens
      if (data.tokens) {
        sessionStorage.setItem('vani-access-token', data.tokens.access_token);
        sessionStorage.setItem('vani-refresh-token', data.tokens.refresh_token);
        sessionStorage.setItem(
          'vani-token-expires-at',
          String(Date.now() + data.tokens.expires_in * 1000),
        );
      }

      const tenantName = data.tenant?.display_name || data.tenant?.name || invite?.tenant_name || 'the team';
      showToast({
        message: `Welcome to ${tenantName}!`,
        type: 'success',
      });
      setSuccess(true);
    } catch {
      showToast({ message: 'Network error — please try again', type: 'error' });
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
        className={f.eyeToggle}
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
  const matched = password === confirmPassword && password.length > 0;

  /* ── Shared brand orb SVG ──────────────────────────── */

  const brandSvg = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );

  /* ── Determine left-panel headline & narrative ─────── */

  const getLeftPanelContent = () => {
    if (!token || expired) {
      return {
        headline: (
          <>
            Something went<br />
            <span className={s.glowWord}>wrong</span>.
          </>
        ),
        text: expired
          ? 'This invitation is no longer valid. Please contact your administrator for a new link.'
          : 'The invitation link appears to be incomplete. Please check the link you received.',
      };
    }
    if (success) {
      return {
        headline: (
          <>
            Welcome<br />
            <span className={s.glowWord}>aboard</span>.
          </>
        ),
        text: 'Your account is ready. You now have full access to your team workspace.',
      };
    }
    return {
      headline: (
        <>
          You&apos;ve been<br />
          <span className={s.glowWord}>invited</span>.
        </>
      ),
      text: 'A trusted advisor has invited you to join their workspace. Create your account to get started.',
    };
  };

  const leftContent = getLeftPanelContent();

  /* ── Loading context (full-page) ───────────────────── */

  if (contextLoading) {
    return <VdfLoader message="Loading invitation" hint="Verifying invite token" />;
  }

  /* ── Render ────────────────────────────────────────── */

  return (
    <div className={s.vault}>
      {/* ═══ LEFT: Story Panel ═══ */}
      <div className={s.storyPanel}>
        {/* Orbiting rings */}
        <div className={s.orbits}>
          <div className={`${s.orbit} ${s.orbit1}`} />
          <div className={`${s.orbit} ${s.orbit2}`} />
          <div className={`${s.orbit} ${s.orbit3}`} />
        </div>

        <div className={s.storyContent}>
          {/* Brand orb */}
          <div className={s.brandOrb}>
            <div className={s.brandOrbInner}>{brandSvg}</div>
            <div className={s.brandOrbRing} />
          </div>

          <div className={s.brandText}>
            <div className={s.brandName}>{product.name.toUpperCase()}</div>
            <div className={s.brandSub}>by Vikuna Technologies</div>
          </div>

          <h1 className={s.headline}>{leftContent.headline}</h1>
          <p className={s.storyText}>{leftContent.text}</p>

          {/* Invite context on left panel (form state only) */}
          {invite && !success && !expired && token && (
            <div className={s.inviteContext}>
              <div className={s.inviteContextRow}>
                <div className={s.firmLogoCircle}>
                  {(invite.tenant_name || '?')[0].toUpperCase()}
                </div>
                <div className={s.inviteContextInfo}>
                  <div className={s.inviteContextFirm}>{invite.tenant_name}</div>
                  <div className={s.inviteContextMeta}>
                    <span className={s.roleBadge}>{invite.role}</span>
                    {invite.invited_by && (
                      <span className={s.invitedBy}>
                        invited by {invite.invited_by}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ RIGHT: Form Panel ═══ */}
      <div className={s.formPanel}>
        {/* Top nav */}
        <div className={s.topNav}>
          <a href="/login" className={s.backLink}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span>Back to sign in</span>
          </a>
        </div>

        {/* ── No Token State ── */}
        {!token && (
          <div className={s.stateContainer}>
            <div className={s.errorOrb}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h2 className={s.stateTitle}>Invalid invitation link</h2>
            <p className={s.stateDesc}>
              This link is missing an invitation token. Please check the link you received or request a new one.
            </p>
            <a href="/login" className={s.stateBackBtn}>
              &larr; Back to sign in
            </a>
          </div>
        )}

        {/* ── Expired State ── */}
        {token && expired && (
          <div className={s.stateContainer}>
            <div className={s.errorOrb}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2 className={s.stateTitle}>Invitation expired</h2>
            <p className={s.stateDesc}>{expiredMessage}</p>
            <p className={s.stateHint}>
              Contact your administrator to request a new invitation.
            </p>
            <a href="/login" className={s.stateBackBtn}>
              &larr; Back to sign in
            </a>
          </div>
        )}

        {/* ── Success State ── */}
        {token && !expired && success && (
          <div className={s.stateContainer}>
            <div className={s.checkOrb}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" className={s.checkPath} />
              </svg>
              <div className={s.checkRing} />
            </div>
            <h2 className={s.successTitle}>Welcome to the team!</h2>
            <p className={s.stateDesc}>
              You&apos;ve joined <strong>{invite?.tenant_name || 'the team'}</strong> as a{' '}
              <strong>{invite?.role || 'member'}</strong>. Let&apos;s set up your workspace.
            </p>
            <button
              className={s.submitBtn}
              onClick={() => router.replace('/')}
            >
              CONTINUE &rarr;
            </button>
          </div>
        )}

        {/* ── Registration Form State ── */}
        {token && !expired && !success && (
          <>
            {/* Form header */}
            <div className={s.formHeader}>
              <div className={s.accentLine} />
              <h2 className={s.formTitle}>Create your account to join</h2>
              <p className={s.formSubtitle}>
                {invite
                  ? `Set up your credentials to join ${invite.tenant_name}`
                  : 'Set up your account to accept this invitation'}
              </p>
            </div>

            {/* Expiry badge */}
            {daysRemaining !== null && (
              <div className={s.expiryBadge}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span>
                  Expires in {daysRemaining} day{daysRemaining !== 1 ? 's' : ''}
                </span>
              </div>
            )}

            {/* Invitation banner (subtle) */}
            {invite && (
              <div className={s.banner}>
                <div className={s.bannerBar} />
                <div className={s.bannerContent}>
                  <div className={s.bannerFirm}>
                    <div className={s.firmLogo}>
                      {(invite.tenant_name || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <div className={s.firmName}>{invite.tenant_name}</div>
                      {invite.tenant_slug && (
                        <div className={s.firmCode}>{invite.tenant_slug}</div>
                      )}
                    </div>
                  </div>
                  <div className={s.bannerDetails}>
                    <div className={s.bannerDetail}>
                      <span className={s.detailLabel}>Your Role</span>
                      <span className={s.detailValue}>{invite.role}</span>
                    </div>
                    {invite.invited_by && (
                      <div className={s.bannerDetail}>
                        <span className={s.detailLabel}>Invited By</span>
                        <span className={s.detailMuted}>{invite.invited_by}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} noValidate>
              <FormInput
                label="Full Name"
                placeholder="Your full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                error={errors.fullName}
                required
                disabled={loading}
                autoFocus
              />

              <FormInput
                label="Email Address"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={errors.email}
                required
                disabled={loading || !!invite?.email}
                readOnly={!!invite?.email}
                className={invite?.email ? s.readonlyInput : ''}
              />
              {invite?.email && (
                <div className={s.fieldHint}>
                  Pre-filled from invitation — cannot be changed
                </div>
              )}

              <FormInput
                label="Password"
                type={showPw ? 'text' : 'password'}
                placeholder="Min 8 chars, 1 uppercase, 1 number"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={errors.password}
                required
                disabled={loading}
                rightElement={
                  <EyeToggle visible={showPw} onToggle={() => setShowPw(!showPw)} />
                }
              />
              <div className={f.strengthWrap}>
                <PasswordStrength password={password} />
              </div>

              <FormInput
                label="Confirm Password"
                type={showConfirm ? 'text' : 'password'}
                placeholder="Re-enter your password"
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
                <div className={`${f.matchIndicator} ${matched ? f.matchOk : f.matchNo}`}>
                  <span className={f.matchDot} />
                  <span>{matched ? 'Passwords match' : 'Passwords do not match'}</span>
                </div>
              )}

              {/* Phone */}
              <div className={s.phoneGroup}>
                <label className={f.label}>Phone Number</label>
                <div className={s.phoneRow}>
                  <CountryDropdown
                    value={country.code}
                    onChange={setCountry}
                    disabled={loading}
                  />
                  <div className={s.phoneInputWrap}>
                    <FormInput
                      label=""
                      type="tel"
                      placeholder="98765 43210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      error={errors.phone}
                      disabled={loading}
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className={s.submitBtn}
                disabled={loading || !fullName || !email || !password || !confirmPassword}
              >
                {loading ? (
                  <InlineLoader size="sm" message="JOINING..." />
                ) : invite ? (
                  `JOIN ${invite.tenant_name.toUpperCase()} \u2192`
                ) : (
                  'ACCEPT INVITATION \u2192'
                )}
              </button>
            </form>

            <div className={s.footer}>
              <a href="/login" className={f.footerLink}>
                Already have an account?{' '}
                <span className={f.footerAccent}>Sign in &rarr;</span>
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
