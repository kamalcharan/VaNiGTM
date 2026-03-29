'use client';

import { useState } from 'react';
import { useShellConfig } from '@/lib/shell-config';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '../toast';
import { InlineLoader } from '../loader';
import FormInput from '../ui/form-input';
import l from './step-layout.module.css';

interface Props {
  onComplete: () => void;
  onSkip?: () => void;
}

export default function OnboardUserProfile({ onComplete }: Props) {
  const { apiUrl } = useShellConfig();
  const { user, getAuthHeaders } = useAuth();
  const { showToast } = useToast();

  const [fullName, setFullName] = useState(user?.name || '');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const initials = fullName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  async function handleSubmit() {
    if (!fullName || fullName.trim().length < 2) {
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
          name: fullName.trim(),
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
    <div className={l.split}>
      <div className={l.narrative}>
        <div>
          <div className={l.chapter}>Step 1 of 6</div>
          <h2 className={l.narrTitle}>
            Let&apos;s put a face<br />to the <span className={l.glow}>name</span>.
          </h2>
          <p className={l.narrText}>
            Your profile helps clients and team members recognize you.
            This is how you&apos;ll appear across the platform.
          </p>
          <div className={l.mandatoryBadge}>&#x25CF; Required to continue</div>
        </div>
      </div>

      <div className={l.form}>
        <div className={l.sectionTitle}>Your Profile</div>

        {/* Avatar placeholder */}
        <div className={l.photoUpload}>
          <div className={l.photoPreview}>{initials || '?'}</div>
          <div className={l.photoInfo}>
            <div className={l.photoInfoTitle}>Profile photo</div>
            <div className={l.photoInfoHint}>
              JPG or PNG, max 2MB. Appears on client reports and the team directory.
            </div>
          </div>
          <button className={l.photoBtn} disabled title="Coming soon — requires storage setup">
            Upload
          </button>
        </div>

        <FormInput
          label="Full Name"
          placeholder="Your full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          error={error}
          required
          disabled={loading}
        />

        <div className={l.selectGroup}>
          <label className={l.selectLabel}>Designation / Title</label>
          <select
            className={l.select}
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

        <FormInput
          label="Phone"
          type="tel"
          placeholder="+91 98765 43210"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={loading}
        />

        <FormInput
          label="Brief Bio (optional)"
          placeholder="A short description for client-facing reports..."
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          disabled={loading}
        />

        <div className={l.nav}>
          <div />
          <div className={l.navRight}>
            <button className={l.navNext} onClick={handleSubmit} disabled={loading}>
              {loading ? <InlineLoader size="sm" message="SAVING..." /> : 'SAVE & CONTINUE \u2192'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
