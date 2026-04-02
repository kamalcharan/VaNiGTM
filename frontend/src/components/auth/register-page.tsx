'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/toast';
import { InlineLoader } from '@/components/loader';
import FormInput from '@/components/ui/form-input';
import CountryDropdown, { type Country } from '@/components/ui/country-dropdown';
import PasswordStrength from '@/components/ui/password-strength';
import { useRegister } from '@/hooks';
import { storeTokens, type ApiError } from '@/lib/api-client';
import { VdfLoader } from '@/components/vdf';
import f from '@/styles/forms.module.css';
import s from './register-page.module.css';

export default function RegisterPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const registerMutation = useRegister();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState<Country>({
    code: 'in',
    dial_code: '+91',
    name: 'India',
  });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [termsAccepted, setTermsAccepted] = useState(false);

  /* ── Validation ────────────────────────────────────── */

  function validate(): boolean {
    const e: Record<string, string> = {};

    if (!fullName || fullName.trim().length < 2) {
      e.fullName = 'Name must be at least 2 characters';
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      e.email = 'Please enter a valid email address';
    }
    if (phone && !/^\d+$/.test(phone.replace(/\s/g, ''))) {
      e.phone = 'Phone must contain digits only';
    }
    if (!password || password.length < 8) {
      e.password = 'Password must be at least 8 characters';
    } else if (!/[A-Z]/.test(password)) {
      e.password = 'Password must contain at least 1 uppercase letter';
    } else if (!/[0-9]/.test(password)) {
      e.password = 'Password must contain at least 1 number';
    }
    if (password !== confirmPassword) {
      e.confirmPassword = 'Passwords do not match';
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  /* ── Submit ────────────────────────────────────────── */

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (registerMutation.isPending) return; // Race condition guard
    if (!validate()) return;

    const trimmedName = fullName.trim();

    registerMutation.mutate(
      {
        name: trimmedName,
        email: email.trim().toLowerCase(),
        country_code: phone ? country.dial_code : undefined,
        mobile: phone ? phone.replace(/\s/g, '') : undefined,
        password,
        tenant_name: `${trimmedName}'s Workspace`,
      },
      {
        onSuccess: (data) => {
          // CRITICAL: store tokens explicitly here before navigation
          // Don't rely on hook-level onSuccess timing (React 19 batching)
          if (data.tokens) {
            storeTokens(data.tokens);
            // Verify storage worked
            const stored = sessionStorage.getItem('pk-access-token');
            console.log('[Register] Token stored:', stored ? `${stored.slice(0, 20)}...` : 'FAILED');
          } else {
            console.error('[Register] No tokens in response:', JSON.stringify(data));
          }
          // Persist theme preference
          const user = data.user as Record<string, unknown>;
          const prefs = user?.preferences as Record<string, unknown> | undefined;
          try {
            if (user?.preferred_theme) localStorage.setItem('pk-theme-id', String(user.preferred_theme));
            if (prefs?.color_mode) localStorage.setItem('pk-color-mode', String(prefs.color_mode));
          } catch {}
          showToast({ message: 'Account created successfully!', type: 'success' });
          window.location.href = '/onboarding';
        },
        onError: (err: ApiError) => {
          if (err.code === 'EMAIL_EXISTS') {
            setErrors({ email: err.message });
          }
          showToast({ message: err.message, type: 'error' });
        },
      },
    );
  }

  const loading = registerMutation.isPending;

  /* ── Eye toggle button ─────────────────────────────── */

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

  /* ── Progress steps (visual only) ──────────────────── */

  const filledFields = [fullName, email, password, confirmPassword].filter(Boolean).length;

  return (
    <>
    {loading && <VdfLoader overlay message="Creating your account" hint="Setting up workspace & encryption" />}
    <div className={s.vault}>
      {/* ── LEFT: Branding Panel ── */}
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

          <h1 className={s.headline}>
            Begin your<br />
            <span className={s.glowWord}>legacy</span>.<br />
            One client at a time.
          </h1>

          <p className={s.storyText}>
            You&apos;re not just signing up for software — you&apos;re unlocking
            the intelligence that turns good advisors into unforgettable ones.
          </p>

          {/* Trust signals */}
          <div className={s.trustSignals}>
            <div className={s.trustItem}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
              <span>Bank-grade<br />encryption</span>
            </div>
            <div className={s.trustItem}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>Setup in<br />under 5 min</span>
            </div>
            <div className={s.trustItem}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
                <path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z" />
              </svg>
              <span>Free starter<br />tier included</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT: Registration Form ── */}
      <div className={s.formPanel}>
        {/* Top bar: breadcrumb + sign in link */}
        <div className={s.topBar}>
          <div className={s.breadcrumbSteps}>
            <div className={`${s.breadcrumbStep} ${s.breadcrumbActive}`}>
              <span className={s.breadcrumbDot} />
              <span>Create Account</span>
            </div>
            <div className={s.breadcrumbLine} />
            <div className={s.breadcrumbStep}>
              <span className={s.breadcrumbDot} />
              <span>Setup Workspace</span>
            </div>
            <div className={s.breadcrumbLine} />
            <div className={s.breadcrumbStep}>
              <span className={s.breadcrumbDot} />
              <span>Dashboard</span>
            </div>
          </div>
          <a href="/login" className={s.topBarLink}>
            Sign in &rarr;
          </a>
        </div>

        <div className={s.formHeader}>
          <div className={s.accentLine} />
          <h2 className={s.formTitle}>Create your account</h2>
          <p className={s.formSubtitle}>
            Start your free journey — no card required
          </p>
        </div>

        {/* Progress indicator */}
        <div className={s.progressTrack}>
          <div
            className={s.progressFill}
            style={{ width: `${(filledFields / 4) * 100}%` }}
          />
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {/* Full Name */}
          <FormInput
            label="Full Name"
            placeholder="Rajesh Kumar"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            error={errors.fullName}
            required
            disabled={loading}
            autoFocus
          />

          {/* Email */}
          <FormInput
            label="Email Address"
            type="email"
            placeholder="you@yourfirm.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            required
            disabled={loading}
          />

          {/* Password */}
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

          {/* Confirm Password */}
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

          {/* Terms */}
          <label className={s.termsRow}>
            <input
              type="checkbox"
              className={s.termsCheckbox}
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              disabled={loading}
            />
            <span className={s.termsText}>
              I agree to the <a href="#" className={s.termsLink}>Terms of Service</a> and <a href="#" className={s.termsLink}>Privacy Policy</a>
            </span>
          </label>

          {/* Submit */}
          <button
            type="submit"
            className={s.submitBtn}
            disabled={loading || !fullName || !email || !password || !confirmPassword || !termsAccepted}
          >
            {loading ? (
              <InlineLoader size="sm" message="CREATING ACCOUNT..." />
            ) : (
              'CREATE ACCOUNT \u2192'
            )}
          </button>
        </form>

        {/* Footer */}
        <div className={s.footer}>
          <a href="/login" className={f.footerLink}>
            Already have an account?{' '}
            <span className={f.footerAccent}>Sign in &rarr;</span>
          </a>
        </div>
      </div>
    </div>
    </>
  );
}
