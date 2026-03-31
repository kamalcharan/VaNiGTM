'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useShellConfig } from '@/lib/shell-config';
import { useToast } from '@/../components/toast';
import { InlineLoader, FullPageLoader } from '@/../components/loader';
import FormInput from '@/../components/ui/form-input';
import CountryDropdown, { type Country } from '@/../components/ui/country-dropdown';
import PasswordStrength from '@/../components/ui/password-strength';
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
  const matched = password === confirmPassword && password.length > 0;

  /* ── Loading context ───────────────────────────────── */

  if (contextLoading) {
    return <FullPageLoader message="Loading invitation..." />;
  }

  /* ── No token ──────────────────────────────────────── */

  if (!token) {
    return (
      <div className={s.page}>
        <BrandMark name={product.name} />
        <div className={s.card}>
          <div className={s.errorState}>
            <div className={s.errorOrb}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h2 className={s.errorTitle}>Invalid invitation link</h2>
            <p className={s.errorDesc}>
              This link is missing an invitation token. Please check the link you received.
            </p>
            <a href="/login" className={s.backBtn}>&larr; Back to sign in</a>
          </div>
        </div>
      </div>
    );
  }

  /* ── Expired / invalid token ───────────────────────── */

  if (expired) {
    return (
      <div className={s.page}>
        <BrandMark name={product.name} />
        <div className={s.card}>
          <div className={s.errorState}>
            <div className={s.errorOrb}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2 className={s.errorTitle}>Invitation expired</h2>
            <p className={s.errorDesc}>{expiredMessage}</p>
            <p className={s.errorHint}>
              Contact your administrator to request a new invitation.
            </p>
            <a href="/login" className={s.backBtn}>&larr; Back to sign in</a>
          </div>
        </div>
      </div>
    );
  }

  /* ── Success state ─────────────────────────────────── */

  if (success) {
    const tenantName = invite?.tenant_name || 'the team';
    const roleName = invite?.role || 'member';

    return (
      <div className={s.page}>
        <BrandMark name={product.name} />
        <div className={s.card}>
          <div className={s.successState}>
            <div className={s.checkOrb}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" className={s.checkPath} />
              </svg>
              <div className={s.checkRing} />
            </div>
            <h2 className={s.successTitle}>Welcome to the team!</h2>
            <p className={s.successDesc}>
              You&apos;ve joined <strong>{tenantName}</strong> as a{' '}
              <strong>{roleName}</strong>. Let&apos;s set up your workspace.
            </p>
            <button
              className={s.submitBtn}
              onClick={() => router.replace('/')}
            >
              CONTINUE &rarr;
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Registration form ─────────────────────────────── */

  const emailReadonly = !!invite?.email;

  return (
    <div className={s.page}>
      <BrandMark name={product.name} />

      <div className={s.card}>
        {/* ── Invitation Banner ── */}
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

        {/* ── Expiry Notice ── */}
        {daysRemaining !== null && (
          <div className={s.expiryNotice}>
            &#x23F3; This invitation expires in {daysRemaining} day
            {daysRemaining !== 1 ? 's' : ''}
          </div>
        )}

        {/* ── Form Header ── */}
        <h2 className={s.cardTitle}>
          {invite ? 'Create your account to join' : 'Accept invitation'}
        </h2>
        <p className={s.cardDesc}>
          {invite
            ? `Set up your credentials to join ${invite.tenant_name}`
            : 'Set up your account to accept this invitation'}
        </p>

        {/* ── Form ── */}
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
            disabled={loading || emailReadonly}
            readOnly={emailReadonly}
            className={emailReadonly ? s.readonlyInput : ''}
          />
          {emailReadonly && (
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
          <div className={s.strengthWrap}>
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
            <div className={`${s.matchIndicator} ${matched ? s.matchOk : s.matchNo}`}>
              <span className={s.matchDot} />
              <span>{matched ? 'Passwords match' : 'Passwords do not match'}</span>
            </div>
          )}

          {/* Phone */}
          <div className={s.phoneGroup}>
            <label className={s.phoneLabel}>Phone Number</label>
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
          <a href="/login" className={s.footerLink}>
            &larr; Back to sign in
          </a>
        </div>
      </div>
    </div>
  );
}

/* ── Brand Mark (shared helper) ──────────────────────── */

function BrandMark({ name }: { name: string }) {
  return (
    <div className={s.brandMark}>
      <div className={s.brandIcon}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      </div>
      <div>
        <div className={s.brandName}>{name}</div>
        <div className={s.brandSub}>by Vikuna Technologies</div>
      </div>
    </div>
  );
}
