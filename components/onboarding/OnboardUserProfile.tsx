'use client';

import { useState } from 'react';
import { useShellConfig } from '@/lib/shell-config';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '../toast';
import { InlineLoader } from '../loader';
import s from './OnboardUserProfile.module.css';

interface Props {
  onComplete: () => void;
  onSkip?: () => void;
}

export default function OnboardUserProfile({ onComplete }: Props) {
  const { apiUrl } = useShellConfig();
  const { user, getAuthHeaders } = useAuth();
  const { showToast } = useToast();

  const nameParts = (user?.name || '').split(' ');
  const [firstName, setFirstName] = useState(nameParts[0] || '');
  const [lastName, setLastName] = useState(nameParts.slice(1).join(' ') || '');
  const [designation, setDesignation] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const initials = `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase() || '?';

  async function handleSubmit() {
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (fullName.length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${apiUrl}/api/v1/auth/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          name: fullName,
          phone: phone || undefined,
          designation: designation || undefined,
          bio: bio || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message || 'Failed to save profile');
      }

      showToast({ message: 'Profile saved', type: 'success' });
      onComplete();
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Save failed', type: 'error' });
    } finally {
      setLoading(false);
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
              JPG or PNG, max 2MB. This appears on client reports and the team directory.
            </div>
          </div>
          <button className={s.photoBtn} disabled title="Coming soon — requires storage setup" type="button">
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

        {/* Designation */}
        <div className={s.formGroup}>
          <label className={s.formLabel}>Designation / Title</label>
          <select
            className={s.formSelect}
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            disabled={loading}
          >
            <option value="">Select your role...</option>
            <option value="mfd">Mutual Fund Distributor (MFD)</option>
            <option value="ria">Registered Investment Advisor (RIA)</option>
            <option value="ifa">Insurance Financial Advisor (IFA)</option>
            <option value="cfp">Certified Financial Planner (CFP)</option>
            <option value="wm">Wealth Manager</option>
            <option value="other">Other</option>
          </select>
        </div>

        {/* Phone (readonly style) */}
        <div className={s.formGroup}>
          <label className={s.formLabel}>Phone</label>
          <input
            type="tel"
            className={s.formInput}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98765 43210"
            disabled={loading}
          />
        </div>

        {/* Bio */}
        <div className={s.formGroup}>
          <label className={s.formLabel}>Brief Bio (optional)</label>
          <textarea
            className={s.formTextarea}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A short description that appears on client-facing reports..."
            disabled={loading}
          />
        </div>

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
