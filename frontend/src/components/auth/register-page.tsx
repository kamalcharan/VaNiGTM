'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useShellConfig } from '@/lib/shell-config';
import { useToast } from '@/../components/toast';
import { InlineLoader } from '@/../components/loader';
import FormInput from '@/../components/ui/form-input';
import CountryDropdown, { type Country } from '@/../components/ui/country-dropdown';
import PasswordStrength from '@/../components/ui/password-strength';
import s from './register-page.module.css';

export default function RegisterPage() {
  const router = useRouter();
  const { apiUrl, product } = useShellConfig();
  const { showToast } = useToast();

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
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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
    if (!validate()) return;

    setLoading(true);
    setErrors({});

    try {
      const phoneWithCode = phone
        ? `${country.dial_code}${phone.replace(/\s/g, '')}`
        : undefined;

      const trimmedName = fullName.trim();
      const res = await fetch(`${apiUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          email: email.trim().toLowerCase(),
          phone: phoneWithCode,
          password,
          tenant_name: `${trimmedName}'s Workspace`,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // API error format: { error: string, code: string, status: number }
        const msg =
          (typeof data?.error === 'string' ? data.error : data?.error?.message)
          || data?.message
          || `Registration failed (${res.status})`;

        if (data?.error?.field) {
          setErrors({ [data.error.field]: msg });
        }

        showToast({ message: msg, type: 'error' });
        setLoading(false);
        return;
      }

      // Store tokens from register response — registration already created
      // a session, so we don't call login() again (would hit session limit).
      // Use full-page navigation so AuthProvider rehydrates from sessionStorage.
      if (data.tokens) {
        sessionStorage.setItem('vani-access-token', data.tokens.access_token);
        sessionStorage.setItem('vani-refresh-token', data.tokens.refresh_token);
        sessionStorage.setItem(
          'vani-token-expires-at',
          String(Date.now() + data.tokens.expires_in * 1000),
        );
      }

      showToast({ message: 'Account created successfully!', type: 'success' });
      window.location.href = '/onboarding';
    } catch {
      showToast({ message: 'Network error — please try again', type: 'error' });
      setLoading(false);
    }
  }

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

  return (
    <div className={s.vault}>
      {/* ── LEFT: Branding Panel ── */}
      <div className={s.storyPanel}>
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
              <div className={s.brandName}>{product.name}</div>
              <div className={s.brandSub}>by Vikuna Technologies</div>
            </div>
          </div>

          <h1 className={s.headline}>
            Begin your<br />
            <span className={s.accentWord}>legacy</span>.<br />
            One client at a time.
          </h1>

          <p className={s.storyText}>
            You&apos;re not just signing up for software — you&apos;re unlocking
            the intelligence that turns good advisors into unforgettable ones.
          </p>
        </div>

        <div className={s.trustSignals}>
          <div className={s.trustItem}>
            <span className={s.trustIcon}>&#x1F512;</span>
            <span className={s.trustText}>Bank-grade<br />encryption</span>
          </div>
          <div className={s.trustItem}>
            <span className={s.trustIcon}>&#x26A1;</span>
            <span className={s.trustText}>Setup in<br />under 5 min</span>
          </div>
          <div className={s.trustItem}>
            <span className={s.trustIcon}>&#x1F48E;</span>
            <span className={s.trustText}>Free starter<br />tier included</span>
          </div>
        </div>
      </div>

      {/* ── RIGHT: Registration Form ── */}
      <div className={s.formPanel}>
        <div className={s.formHeader}>
          <div className={s.accentLine} />
          <h2 className={s.formTitle}>Create your account</h2>
          <p className={s.formSubtitle}>
            Start your free journey — no card required
          </p>
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
          <div className={s.strengthWrap}>
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

          {/* Submit */}
          <button
            type="submit"
            className={s.submitBtn}
            disabled={loading || !fullName || !email || !password || !confirmPassword}
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
          <a href="/login" className={s.footerLink}>
            Already have an account?{' '}
            <span className={s.footerAccent}>Sign in &rarr;</span>
          </a>
          <div className={s.legalLinks}>
            <a href="#" className={s.legalLink}>Terms of Service</a>
            <span className={s.legalDot}>&middot;</span>
            <a href="#" className={s.legalLink}>Privacy Policy</a>
          </div>
        </div>
      </div>
    </div>
  );
}
