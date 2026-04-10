'use client';

import { useRef, useState } from 'react';
import { useToast } from '../toast';
import { InlineLoader } from '../loader';
import { VdfRichText, VdfColorPicker } from '@/components/vdf';
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
  onBack?: () => void;
}

export default function OnboardBusiness({ onComplete, onBack }: Props) {
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

  const panGstMatch = pan && gstin && gstin.length >= 12
    ? gstin.slice(2, 12) === pan
    : null;

  async function handleSubmit() {
    if (submittingRef.current) return;

    if (!firmName || firmName.trim().length < 2) {
      setError('Firm name is required');
      return;
    }

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

  /* ── SVG Icons ────────────────────────────────────── */

  const IconBuilding = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
      <path d="M3 21h18M5 21V7l8-4v18M13 21V3l6 3v15" />
      <path d="M9 9h1M9 13h1M9 17h1" />
    </svg>
  );

  const IconPalette = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="7" r="1.5" fill="currentColor" />
      <circle cx="8" cy="10" r="1.5" fill="currentColor" />
      <circle cx="16" cy="10" r="1.5" fill="currentColor" />
      <circle cx="9" cy="15" r="1.5" fill="currentColor" />
    </svg>
  );

  const IconDoc = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  );

  const IconPin = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );

  return (
    <div className={s.page}>
      {/* ── Header ── */}
      <div className={s.pageHeader}>
        <div className={s.stepTag}>Step 2 of 6</div>
        <h1 className={s.pageTitle}>Business Profile</h1>
        <p className={s.pageSubtitle}>
          This information appears on client communications, reports, and the investor portal.
        </p>
      </div>

      <div className={s.sections}>
        {/* ═══ Section: Identity ═══ */}
        <div className={s.card}>
          <div className={s.cardHeader}>
            <span className={s.cardIcon}><IconBuilding /></span>
            <span className={s.cardTitle}>Organization Identity</span>
          </div>

          {/* Logo + Firm Name row */}
          <div className={s.identityRow}>
            <div className={s.logoArea}>
              <div className={s.logoPreview}>&#x1F3E2;</div>
              <div>
                <button className={s.logoBtn} disabled type="button">Upload Logo</button>
                <div className={s.logoHint}>512&times;512px, PNG/JPG/SVG</div>
              </div>
            </div>
            <div className={s.identityFields}>
              <div className={s.field}>
                <label className={s.label}>Firm / Business Name *</label>
                <input className={s.input} placeholder="e.g. Meridian Wealth Partners" value={firmName} onChange={(e) => setFirmName(e.target.value)} disabled={loading} />
              </div>
            </div>
          </div>

          {/* Type + ARN */}
          <div className={s.row2}>
            <div className={s.field}>
              <label className={s.label}>Business Type</label>
              <select className={s.select} value={businessType} onChange={(e) => setBusinessType(e.target.value)} disabled={loading}>
                <option value="">Select type...</option>
                {BUSINESS_TYPES.map((bt) => <option key={bt.value} value={bt.value}>{bt.label}</option>)}
              </select>
            </div>
            <div className={s.field}>
              <label className={s.label}>ARN Number</label>
              <input className={s.input} placeholder="ARN-XXXXX" value={arn} onChange={(e) => setArn(e.target.value)} disabled={loading} />
            </div>
          </div>

          {/* PAN + GSTIN */}
          <div className={s.row2}>
            <div className={s.field}>
              <label className={s.label}>PAN</label>
              <input className={`${s.input} ${s.mono}`} placeholder="ABCDE1234F" value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} maxLength={10} disabled={loading} />
            </div>
            <div className={s.field}>
              <label className={s.label}>GSTIN (optional)</label>
              <input className={`${s.input} ${s.mono}`} placeholder="22AAAAA0000A1Z5" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} maxLength={15} disabled={loading} />
              {panGstMatch === true && <div className={s.matchOk}>PAN matches GSTIN</div>}
              {panGstMatch === false && <div className={s.matchWarn}>PAN does not match GSTIN</div>}
            </div>
          </div>
        </div>

        {/* ═══ Section: Brand Colors ═══ */}
        <div className={s.card}>
          <div className={s.cardHeader}>
            <span className={s.cardIcon}><IconPalette /></span>
            <span className={s.cardTitle}>Brand Color</span>
          </div>
          <p className={s.cardDesc}>Customize your application to match your firm&apos;s brand identity.</p>

          <VdfColorPicker
            value={brandColor}
            onChange={setBrandColor}
            disabled={loading}
          />

          <div className={s.colorPreviewBar}>
            <span className={s.previewLabel}>Preview</span>
            <div className={s.previewRow}>
              <div className={s.previewBtn} style={{ background: brandColor }}>Primary Button</div>
              <div className={s.previewGrad} style={{ background: `linear-gradient(135deg, ${brandColor}, ${brandColor}88)` }} />
            </div>
          </div>
        </div>

        {/* ═══ Section: Description ═══ */}
        <div className={s.card}>
          <div className={s.cardHeader}>
            <span className={s.cardIcon}><IconDoc /></span>
            <span className={s.cardTitle}>Business Description</span>
          </div>
          <VdfRichText
            value={description}
            onChange={setDescription}
            placeholder="Brief description for client-facing reports and investor portal..."
            maxLength={1000}
            minHeight={80}
            maxHeight={150}
            disabled={loading}
          />
        </div>

        {/* ═══ Section: Address ═══ */}
        <div className={s.card}>
          <div className={s.cardHeader}>
            <span className={s.cardIcon}><IconPin /></span>
            <span className={s.cardTitle}>Business Address</span>
          </div>

          <div className={s.row2}>
            <div className={s.field}>
              <label className={s.label}>Address Line 1</label>
              <input className={s.input} placeholder="Building, street" value={address1} onChange={(e) => setAddress1(e.target.value)} disabled={loading} />
            </div>
            <div className={s.field}>
              <label className={s.label}>Address Line 2</label>
              <input className={s.input} placeholder="Area, landmark" value={address2} onChange={(e) => setAddress2(e.target.value)} disabled={loading} />
            </div>
          </div>

          <div className={s.row4}>
            <div className={s.field}>
              <label className={s.label}>Country</label>
              <input className={s.input} value="India" readOnly disabled />
            </div>
            <div className={s.field}>
              <label className={s.label}>State</label>
              <select className={s.select} value={state} onChange={(e) => setState(e.target.value)} disabled={loading}>
                <option value="">Select...</option>
                {INDIAN_STATES.map((st) => <option key={st.code} value={st.name}>{st.name}</option>)}
              </select>
            </div>
            <div className={s.field}>
              <label className={s.label}>City</label>
              <input className={s.input} placeholder="Hyderabad" value={city} onChange={(e) => setCity(e.target.value)} disabled={loading} />
            </div>
            <div className={s.field}>
              <label className={s.label}>PIN Code</label>
              <input className={s.input} placeholder="500001" value={postalCode} onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} disabled={loading} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Error ── */}
      {error && <div className={s.errorBar}>{error}</div>}

      {/* ── Footer Nav ── */}
      <div className={s.footerNav}>
        {onBack ? (
          <button className={s.backBtn} onClick={onBack} type="button">
            &larr; Back
          </button>
        ) : <div />}
        <button className={s.saveBtn} onClick={handleSubmit} disabled={loading}>
          {loading ? <InlineLoader size="sm" message="SAVING..." /> : 'SAVE & CONTINUE \u2192'}
        </button>
      </div>
    </div>
  );
}
