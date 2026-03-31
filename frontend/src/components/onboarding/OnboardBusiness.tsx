'use client';

import { useRef, useState } from 'react';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '../toast';
import { InlineLoader } from '../loader';
import { VdfRichText } from '@/components/vdf';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import {
  BUSINESS_TYPES,
  INDIAN_STATES,
  validatePAN,
  validateGSTIN,
  validateARN,
  validatePIN,
} from '@/constants/business';
import s from './OnboardBusiness.module.css';

interface Props {
  onComplete: () => void;
  onSkip?: () => void;
}

export default function OnboardBusiness({ onComplete }: Props) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const submittingRef = useRef(false);

  const [firmName, setFirmName] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [arn, setArn] = useState('');
  const [pan, setPan] = useState('');
  const [gstin, setGstin] = useState('');
  const [description, setDescription] = useState('');
  const [brandColor, setBrandColor] = useState('#C9A84C');
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (submittingRef.current) return;

    if (!firmName || firmName.trim().length < 2) {
      setError('Firm name is required');
      return;
    }

    // Validate optional fields
    const panErr = validatePAN(pan);
    if (panErr) { setError(panErr); return; }

    const gstinErr = validateGSTIN(gstin, pan);
    if (gstinErr) { setError(gstinErr); return; }

    const arnErr = validateARN(arn);
    if (arnErr) { setError(arnErr); return; }

    const pinErr = validatePIN(postalCode);
    if (pinErr) { setError(pinErr); return; }

    submittingRef.current = true;
    setLoading(true);
    setError('');

    try {
      // Save to tenant profile
      await apiFetch(API.tenant.profile, {
        body: {
          name: firmName.trim(),
          display_name: firmName.trim(),
          type: businessType || 'mfd',
          description: description || undefined,
          brand_color: brandColor,
          arn: arn.trim().toUpperCase() || undefined,
          pan: pan.trim().toUpperCase() || undefined,
          gstin: gstin.trim().toUpperCase() || undefined,
          address_line1: address1.trim() || undefined,
          address_line2: address2.trim() || undefined,
          city: city.trim() || undefined,
          state: state || undefined,
          country: 'India',
          postal_code: postalCode.trim() || undefined,
        },
      });

      // Mark onboarding step complete
      await apiFetch(API.onboarding.completeStep, {
        body: {
          step_id: 'business_profile',
          status: 'completed',
          metadata: { business_type: businessType, has_arn: !!arn, has_pan: !!pan },
        },
      });

      showToast({ message: 'Business details saved', type: 'success' });
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
              Square image, min 200&times;200px
            </div>
          </div>
          <button className={s.photoBtn} disabled title="Coming soon" type="button">
            Upload
          </button>
        </div>

        {/* Firm Name */}
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
              <option value="">Select type...</option>
              {BUSINESS_TYPES.map((bt) => (
                <option key={bt.value} value={bt.value}>{bt.label}</option>
              ))}
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

        {/* PAN + GSTIN — linked */}
        <div className={s.formRow}>
          <div className={s.formGroup}>
            <label className={s.formLabel}>PAN</label>
            <input
              type="text"
              className={`${s.formInput} ${s.uppercase}`}
              placeholder="ABCDE1234F"
              value={pan}
              onChange={(e) => setPan(e.target.value.toUpperCase())}
              maxLength={10}
              disabled={loading}
            />
          </div>
          <div className={s.formGroup}>
            <label className={s.formLabel}>GSTIN (optional)</label>
            <input
              type="text"
              className={`${s.formInput} ${s.uppercase}`}
              placeholder="22AAAAA0000A1Z5"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              maxLength={15}
              disabled={loading}
            />
            {pan && gstin && gstin.length >= 12 && gstin.slice(2, 12) === pan && (
              <div className={s.matchBadge}>PAN matches GSTIN</div>
            )}
            {pan && gstin && gstin.length >= 12 && gstin.slice(2, 12) !== pan && (
              <div className={s.mismatchBadge}>PAN does not match GSTIN</div>
            )}
          </div>
        </div>

        {/* Brand Color */}
        <div className={s.formGroup}>
          <label className={s.formLabel}>Brand Color</label>
          <div className={s.colorRow}>
            <input
              type="color"
              className={s.colorPicker}
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              disabled={loading}
            />
            <input
              type="text"
              className={`${s.formInput} ${s.colorHex}`}
              value={brandColor}
              onChange={(e) => {
                const v = e.target.value;
                if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setBrandColor(v);
              }}
              maxLength={7}
              placeholder="#C9A84C"
              disabled={loading}
            />
            <div className={s.colorPreview} style={{ background: brandColor }} />
          </div>
        </div>

        {/* Description — Rich Text */}
        <VdfRichText
          value={description}
          onChange={setDescription}
          label="Business Description (optional)"
          placeholder="Brief description for client-facing reports..."
          maxLength={1000}
          minHeight={60}
          maxHeight={100}
          disabled={loading}
        />

        {/* Address */}
        <div className={s.formGroup}>
          <label className={s.formLabel}>Address Line 1</label>
          <input
            type="text"
            className={s.formInput}
            placeholder="Building, street"
            value={address1}
            onChange={(e) => setAddress1(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className={s.formGroup}>
          <label className={s.formLabel}>Address Line 2 (optional)</label>
          <input
            type="text"
            className={s.formInput}
            placeholder="Area, landmark"
            value={address2}
            onChange={(e) => setAddress2(e.target.value)}
            disabled={loading}
          />
        </div>

        {/* City + State + PIN */}
        <div className={s.formRow3}>
          <div className={s.formGroup}>
            <label className={s.formLabel}>City</label>
            <input
              type="text"
              className={s.formInput}
              placeholder="e.g. Hyderabad"
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
              {INDIAN_STATES.map((st) => (
                <option key={st.code} value={st.name}>{st.name}</option>
              ))}
            </select>
          </div>
          <div className={s.formGroup}>
            <label className={s.formLabel}>PIN Code</label>
            <input
              type="text"
              className={s.formInput}
              placeholder="500001"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
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
