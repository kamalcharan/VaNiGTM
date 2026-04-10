'use client';

import { useState } from 'react';
import { useShellConfig } from '@/lib/shell-config';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '../toast';
import { InlineLoader } from '../loader';
import s from './OnboardBusiness.module.css';

interface Props {
  onComplete: (data?: Record<string, unknown>) => void;
  onSkip?: () => void;
}

export default function OnboardBusiness({ onComplete }: Props) {
  const { apiUrl } = useShellConfig();
  const { getAuthHeaders } = useAuth();
  const { showToast } = useToast();

  const [firmName, setFirmName] = useState('');
  const [businessType, setBusinessType] = useState('partnership');
  const [arn, setArn] = useState('');
  const [pan, setPan] = useState('');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (!firmName || firmName.trim().length < 2) {
      setError('Firm name is required');
      return;
    }
    if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(pan)) {
      setError('Invalid PAN format (e.g. ABCDE1234F)');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // PATCH /tenant/profile accepts: name, logo_url, theme_id
      // Business-specific fields (arn, pan, gstin, address) require a dedicated
      // API endpoint. For MVP, save firm name via tenant profile.
      const res = await fetch(`${apiUrl}/api/v1/tenant/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          name: firmName.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message || 'Failed to save business details');
      }

      showToast({ message: 'Business details saved', type: 'success' });
      onComplete({
        firm_name: firmName.trim(),
        business_type: businessType,
        arn: arn || undefined,
        pan: pan || undefined,
        gstin: gstin || undefined,
        address: address || undefined,
        city: city || undefined,
        state: state || undefined,
        pin: pin || undefined,
      });
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
          <div className={s.chapter}>Step 2 of 6</div>
          <h2 className={s.narrTitle}>
            Your <span className={s.glow}>firm</span> is<br />your identity.
          </h2>
          <p className={s.narrText}>
            This information appears on client communications, reports, and
            the investor portal. Make it count.
          </p>
          <div className={s.mandatoryBadge}>&#x25CF; Required to continue</div>
        </div>
      </div>

      {/* ── Right: Form ── */}
      <div className={s.formPanel}>
        <div className={s.formBorderAccent} />
        <div className={s.sectionTitle}>Business Details</div>

        {/* Firm Logo */}
        <div className={s.photoUpload}>
          <div className={s.logoPreview}>&#x1F3E2;</div>
          <div className={s.photoInfo}>
            <div className={s.photoInfoTitle}>Firm logo</div>
            <div className={s.photoInfoHint}>
              Square image, min 200&times;200px. Appears on client portal and reports.
            </div>
          </div>
          <button className={s.photoBtn} disabled title="Coming soon — requires storage setup" type="button">
            Upload
          </button>
        </div>

        {/* Firm Name (full width) */}
        <div className={s.formGroup}>
          <label className={s.formLabel}>Firm / Business Name</label>
          <input
            type="text"
            className={s.formInput}
            placeholder="e.g. Meridian Wealth Partners"
            value={firmName}
            onChange={(e) => setFirmName(e.target.value)}
            disabled={loading}
          />
        </div>

        {/* Business Type + ARN */}
        <div className={s.formRow}>
          <div className={s.formGroup}>
            <label className={s.formLabel}>Business Type</label>
            <select
              className={s.formSelect}
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              disabled={loading}
            >
              <option value="individual">Individual MFD</option>
              <option value="partnership">Partnership Firm</option>
              <option value="pvt_ltd">Private Limited</option>
              <option value="llp">LLP</option>
              <option value="proprietorship">Proprietorship</option>
            </select>
          </div>
          <div className={s.formGroup}>
            <label className={s.formLabel}>ARN Number</label>
            <input
              type="text"
              className={s.formInput}
              placeholder="ARN-XXXXX"
              value={arn}
              onChange={(e) => setArn(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>

        {/* PAN + GSTIN */}
        <div className={s.formRow}>
          <div className={s.formGroup}>
            <label className={s.formLabel}>PAN</label>
            <input
              type="text"
              className={`${s.formInput} ${s.uppercase}`}
              placeholder="ABCDE1234F"
              value={pan}
              onChange={(e) => setPan(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className={s.formGroup}>
            <label className={s.formLabel}>GSTIN (optional)</label>
            <input
              type="text"
              className={s.formInput}
              placeholder="22AAAAA0000A1Z5"
              value={gstin}
              onChange={(e) => setGstin(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>

        {/* Business Address */}
        <div className={s.formGroup}>
          <label className={s.formLabel}>Business Address</label>
          <textarea
            className={s.formTextarea}
            placeholder="Full address with city, state, PIN..."
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={loading}
          />
        </div>

        {/* City + State + PIN (3-col) */}
        <div className={s.formRow3}>
          <div className={s.formGroup}>
            <label className={s.formLabel}>City</label>
            <input
              type="text"
              className={s.formInput}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className={s.formGroup}>
            <label className={s.formLabel}>State</label>
            <select
              className={s.formSelect}
              value={state}
              onChange={(e) => setState(e.target.value)}
              disabled={loading}
            >
              <option value="">Select state...</option>
              <option value="telangana">Telangana</option>
              <option value="andhra_pradesh">Andhra Pradesh</option>
              <option value="karnataka">Karnataka</option>
              <option value="maharashtra">Maharashtra</option>
              <option value="tamil_nadu">Tamil Nadu</option>
              <option value="delhi">Delhi</option>
              <option value="gujarat">Gujarat</option>
              <option value="rajasthan">Rajasthan</option>
              <option value="west_bengal">West Bengal</option>
              <option value="kerala">Kerala</option>
            </select>
          </div>
          <div className={s.formGroup}>
            <label className={s.formLabel}>PIN Code</label>
            <input
              type="text"
              className={s.formInput}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              disabled={loading}
            />
          </div>
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
