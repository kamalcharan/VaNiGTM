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
  onBack?: () => void;
}

export default function OnboardUserProfile({ onComplete, onBack }: Props) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const submittingRef = useRef(false);

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

  useEffect(() => {
    if (DESIGNATIONS.length === 1 && !designation) {
      setDesignation(DESIGNATIONS[0].value);
    }
  }, [designation]);

  async function handleSubmit() {
    if (submittingRef.current) return;

    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (fullName.length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }

    if (mobile) {
      const phoneError = validateMobile(countryCode, mobile);
      if (phoneError) { setError(phoneError); return; }
    }

    submittingRef.current = true;
    setLoading(true);
    setError('');

    try {
      const token = typeof window !== 'undefined'
        ? (sessionStorage.getItem('pk-access-token') || localStorage.getItem('pk-access-token'))
        : null;
      if (!token) {
        setError('Session not found. Please go back and sign in.');
        setLoading(false);
        submittingRef.current = false;
        return;
      }

      await apiFetch(API.auth.preferences, {
        body: {
          profile_name: fullName,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          designation: designation || undefined,
          country_code: mobile ? countryCode : undefined,
          mobile: mobile || undefined,
          bio: bio || undefined,
        },
      });

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
    <div className={s.page}>
      {/* Header */}
      <div className={s.pageHeader}>
        <div className={s.headerIcon}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="28" height="28">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <h1 className={s.pageTitle}>Your Profile</h1>
        <p className={s.pageSubtitle}>How you appear across the platform to clients and team members</p>
      </div>

      {/* Identity Card */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <span className={s.cardTitle}>Personal Information</span>
          <span className={s.requiredTag}>* Required</span>
        </div>

        {/* Photo + Name row */}
        <div className={s.identityRow}>
          <div className={s.avatarArea}>
            <div className={s.avatar}>{initials}</div>
            <button className={s.avatarBtn} disabled type="button">Upload Photo</button>
            <div className={s.avatarHint}>JPG/PNG, max 2MB</div>
          </div>
          <div className={s.nameFields}>
            <div className={s.row2}>
              <div className={s.field}>
                <label className={s.label}>First Name *</label>
                <input className={s.input} placeholder="Rajesh" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={loading} />
              </div>
              <div className={s.field}>
                <label className={s.label}>Last Name *</label>
                <input className={s.input} placeholder="Kumar" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={loading} />
              </div>
            </div>
            <div className={s.field}>
              <label className={s.label}>Professional Role</label>
              <select className={s.select} value={designation} onChange={(e) => setDesignation(e.target.value)} disabled={loading}>
                {designation === '' && <option value="">Select your role...</option>}
                {DESIGNATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Contact Card */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
          </svg>
          <span className={s.cardTitle}>Contact</span>
        </div>

        <VdfMobileInput
          countryCode={countryCode}
          mobile={mobile}
          onCountryChange={(code) => { setCountryCode(code); setMobile(''); }}
          onMobileChange={setMobile}
          disabled={loading}
        />
      </div>

      {/* Bio Card */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
          </svg>
          <span className={s.cardTitle}>About You</span>
        </div>

        <VdfRichText
          value={bio}
          onChange={setBio}
          placeholder="Brief description for client-facing reports and team directory..."
          maxLength={500}
          minHeight={70}
          maxHeight={120}
          disabled={loading}
        />
      </div>

      {/* Error */}
      {error && <div className={s.errorBar}>{error}</div>}

      {/* Footer */}
      <div className={s.footerNav}>
        {onBack ? (
          <button className={s.backBtn} onClick={onBack} type="button">&larr; Back</button>
        ) : <div />}
        <button className={s.saveBtn} onClick={handleSubmit} disabled={loading}>
          {loading ? <InlineLoader size="sm" message="SAVING..." /> : 'SAVE & CONTINUE \u2192'}
        </button>
      </div>
    </div>
  );
}
