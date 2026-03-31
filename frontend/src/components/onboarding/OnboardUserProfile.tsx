'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '../toast';
import { InlineLoader } from '../loader';
import { VdfMobileInput, VdfRichText } from '@/components/vdf';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { validateMobile, getCountryByCode } from '@/constants/countries';
import s from './OnboardUserProfile.module.css';

const DESIGNATIONS = [
  { value: 'mfd', label: 'Mutual Fund Distributor (MFD)' },
  { value: 'ria', label: 'Registered Investment Advisor (RIA)' },
  { value: 'ifa', label: 'Insurance Financial Advisor (IFA)' },
  { value: 'cfp', label: 'Certified Financial Planner (CFP)' },
  { value: 'wm', label: 'Wealth Manager' },
  { value: 'other', label: 'Other' },
];

interface Props {
  onComplete: () => void;
  onSkip?: () => void;
}

export default function OnboardUserProfile({ onComplete }: Props) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const submittingRef = useRef(false); // Race condition guard

  const nameParts = (user?.name || '').split(' ');
  const [firstName, setFirstName] = useState(nameParts[0] || '');
  const [lastName, setLastName] = useState(nameParts.slice(1).join(' ') || '');
  const [designation, setDesignation] = useState('');
  const [countryCode, setCountryCode] = useState('in');
  const [mobile, setMobile] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const initials = `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase() || '?';

  // Auto-select designation if only one option makes sense
  // (If user registered as MFD type, pre-select it)
  useEffect(() => {
    if (DESIGNATIONS.length === 1 && !designation) {
      setDesignation(DESIGNATIONS[0].value);
    }
  }, [designation]);

  async function handleSubmit() {
    // Race condition guard
    if (submittingRef.current) return;

    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (fullName.length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }

    // Validate phone if provided
    if (mobile) {
      const phoneError = validateMobile(countryCode, mobile);
      if (phoneError) {
        setError(phoneError);
        return;
      }
    }

    submittingRef.current = true;
    setLoading(true);
    setError('');

    try {
      // Debug: check if token exists
      const token = typeof window !== 'undefined' ? sessionStorage.getItem('pk-access-token') : null;
      if (!token) {
        console.error('[OnboardUserProfile] No access token in sessionStorage! Keys:',
          typeof window !== 'undefined' ? Object.keys(sessionStorage).join(', ') : 'SSR');
        setError('Session not found. Please go back and sign in.');
        setLoading(false);
        submittingRef.current = false;
        return;
      }

      // Save profile via PATCH /auth/preferences
      await apiFetch(API.auth.preferences, {
        body: {
          profile_name: fullName,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          designation: designation || undefined,
          country_code: mobile ? getCountryByCode(countryCode)?.dial_code : undefined,
          mobile: mobile || undefined,
          bio: bio || undefined,
        },
      });

      // Mark onboarding step complete
      await apiFetch(API.onboarding.completeStep, {
        body: {
          step_id: 'user_profile',
          status: 'completed',
          metadata: { designation, has_bio: !!bio },
        },
      });

      showToast({ message: 'Profile saved', type: 'success' });
      onComplete();
    } catch (err) {
      const apiErr = err as ApiError;
      showToast({ message: apiErr.message || 'Save failed', type: 'error' });
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  }

  return (
    <div className={s.split}>
      {/* ── Left: Narrative ── */}
      <div className={s.narrative}>
        <div className={s.narrativeGlow} />
        <div className={s.narrContent}>
          <div className={s.chapter}>Step 1 of 6</div>
          <h2 className={s.narrTitle}>
            Let&apos;s put a face<br />to the <span className={s.glow}>name</span>.
          </h2>
          <p className={s.narrText}>
            Your profile helps clients and team members recognize you.
            This is how you&apos;ll appear across the platform.
          </p>
          <div className={s.mandatoryBadge}>&#x25CF; Required to continue</div>
        </div>
      </div>

      {/* ── Right: Form ── */}
      <div className={s.formPanel}>
        <div className={s.formBorderAccent} />
        <div className={s.sectionTitle}>Your Profile</div>

        {/* Photo Upload */}
        <div className={s.photoUpload}>
          <div className={s.photoPreview}>{initials}</div>
          <div className={s.photoInfo}>
            <div className={s.photoInfoTitle}>Profile photo</div>
            <div className={s.photoInfoHint}>
              JPG or PNG, max 2MB
            </div>
          </div>
          <button className={s.photoBtn} disabled title="Coming soon" type="button">
            Upload
          </button>
        </div>

        {/* Name Row */}
        <div className={s.formRow}>
          <div className={s.formGroup}>
            <label className={s.formLabel}>First Name</label>
            <input
              type="text"
              className={s.formInput}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Rajesh"
              disabled={loading}
            />
          </div>
          <div className={s.formGroup}>
            <label className={s.formLabel}>Last Name</label>
            <input
              type="text"
              className={s.formInput}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Kumar"
              disabled={loading}
            />
          </div>
        </div>

        {/* Designation — auto-select if only 1 value */}
        <div className={s.formGroup}>
          <label className={s.formLabel}>Designation / Title</label>
          <select
            className={s.formSelect}
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            disabled={loading}
          >
            {designation === '' && <option value="">Select your role...</option>}
            {DESIGNATIONS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>

        {/* Phone — VdfMobileInput */}
        <VdfMobileInput
          countryCode={countryCode}
          mobile={mobile}
          onCountryChange={(code) => { setCountryCode(code); setMobile(''); }}
          onMobileChange={setMobile}
          disabled={loading}
        />

        {/* Bio — VdfRichText */}
        <VdfRichText
          value={bio}
          onChange={setBio}
          label="Brief Bio (optional)"
          placeholder="A short description for client-facing reports..."
          maxLength={500}
          minHeight={60}
          maxHeight={120}
          disabled={loading}
        />

        {/* Error */}
        {error && <div className={s.errorMsg}>{error}</div>}

        {/* Navigation */}
        <div className={s.wizardNav}>
          <div />
          <div className={s.navRight}>
            <button className={s.navNext} onClick={handleSubmit} disabled={loading}>
              {loading ? <InlineLoader size="sm" message="SAVING..." /> : 'SAVE & CONTINUE \u2192'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
