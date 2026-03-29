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

export default function OnboardBusiness({ onComplete }: Props) {
  const { apiUrl } = useShellConfig();
  const { getAuthHeaders } = useAuth();
  const { showToast } = useToast();

  const [firmName, setFirmName] = useState('');
  const [businessType, setBusinessType] = useState('individual');
  const [arn, setArn] = useState('');
  const [pan, setPan] = useState('');
  const [euin, setEuin] = useState('');
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
      const res = await fetch(`${apiUrl}/api/v1/tenant/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          display_name: firmName.trim(),
          business_type: businessType,
          arn_number: arn || undefined,
          pan_number: pan.toUpperCase() || undefined,
          euin: euin || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message || 'Failed to save business details');
      }

      showToast({ message: 'Business details saved', type: 'success' });
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
          <div className={l.chapter}>Step 2 of 6</div>
          <h2 className={l.narrTitle}>
            Your <span className={l.glow}>firm</span> is<br />your identity.
          </h2>
          <p className={l.narrText}>
            This information appears on client communications, reports, and
            the investor portal. Make it count.
          </p>
          <div className={l.mandatoryBadge}>&#x25CF; Required to continue</div>
        </div>
      </div>

      <div className={l.form}>
        <div className={l.sectionTitle}>Business Details</div>

        {/* Firm logo placeholder */}
        <div className={l.photoUpload}>
          <div className={l.photoPreview} style={{ borderRadius: 12 }}>&#x1F3E2;</div>
          <div className={l.photoInfo}>
            <div className={l.photoInfoTitle}>Firm logo</div>
            <div className={l.photoInfoHint}>
              Square image, min 200&times;200px. Appears on client portal and reports.
            </div>
          </div>
          <button className={l.photoBtn} disabled title="Coming soon — requires storage setup">
            Upload
          </button>
        </div>

        <FormInput
          label="Firm / Business Name"
          placeholder="e.g. Meridian Wealth Partners"
          value={firmName}
          onChange={(e) => setFirmName(e.target.value)}
          error={error}
          required
          disabled={loading}
        />

        <div className={l.formRow}>
          <div className={l.selectGroup}>
            <label className={l.selectLabel}>Business Type</label>
            <select
              className={l.select}
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
          <div>
            <FormInput
              label="ARN Number"
              placeholder="ARN-XXXXX"
              value={arn}
              onChange={(e) => setArn(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>

        <div className={l.formRow}>
          <div>
            <FormInput
              label="PAN"
              placeholder="ABCDE1234F"
              value={pan}
              onChange={(e) => setPan(e.target.value)}
              disabled={loading}
            />
          </div>
          <div>
            <FormInput
              label="EUIN (optional)"
              placeholder="E123456"
              value={euin}
              onChange={(e) => setEuin(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>

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
