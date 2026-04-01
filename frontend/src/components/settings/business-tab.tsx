'use client';

import { useState, useEffect } from 'react';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { InlineLoader } from '@/components/loader';
import FormInput from '@/components/ui/form-input';
import { INDIAN_STATES, validatePAN, validateGSTIN, validateARN, validatePIN } from '@/constants/business';
import s from './settings-tabs.module.css';

const BUSINESS_TYPES = [
  { value: 'mfd', label: 'Mutual Fund Distributor (MFD)' },
  { value: 'ria', label: 'Registered Investment Advisor (RIA)' },
  { value: 'ifa', label: 'Insurance Financial Advisor (IFA)' },
  { value: 'cfp', label: 'Certified Financial Planner (CFP)' },
  { value: 'wealthtech', label: 'Wealthtech Firm' },
  { value: 'other', label: 'Other' },
];

export default function BusinessTab() {
  const { showToast } = useToast();

  const [firmName, setFirmName] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [arn, setArn] = useState('');
  const [pan, setPan] = useState('');
  const [gstin, setGstin] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  // Load tenant profile
  useEffect(() => {
    async function load() {
      try {
        const res = await apiFetch<{ profile: Record<string, any> }>(API.tenant.profileGet);
        const p = res.profile || {};
        setFirmName(p.display_name || p.name || '');
        setBusinessType(p.type || '');
        setArn(p.arn || '');
        setPan(p.pan || '');
        setGstin(p.gstin || '');
        setAddressLine1(p.address_line1 || '');
        setAddressLine2(p.address_line2 || '');
        setState(p.state || '');
        setCity(p.city || '');
        setPostalCode(p.postal_code || '');
      } catch {
        // Profile not loaded — fields stay empty
      } finally {
        setFetching(false);
      }
    }
    load();
  }, []);

  async function handleSave() {
    if (!firmName || firmName.trim().length < 2) {
      showToast({ message: 'Firm name is required', type: 'error' });
      return;
    }
    if (pan && !validatePAN(pan)) {
      showToast({ message: 'Invalid PAN format (e.g. ABCDE1234F)', type: 'error' });
      return;
    }
    if (gstin && !validateGSTIN(gstin)) {
      showToast({ message: 'Invalid GSTIN format', type: 'error' });
      return;
    }
    if (arn && !validateARN(arn)) {
      showToast({ message: 'Invalid ARN format', type: 'error' });
      return;
    }
    if (postalCode && !validatePIN(postalCode)) {
      showToast({ message: 'PIN code must be 6 digits', type: 'error' });
      return;
    }

    setLoading(true);
    try {
      await apiFetch(API.tenant.profile, {
        body: {
          display_name: firmName.trim(),
          type: businessType || undefined,
          arn: arn || undefined,
          pan: pan.toUpperCase() || undefined,
          gstin: gstin.toUpperCase() || undefined,
          address_line1: addressLine1 || undefined,
          address_line2: addressLine2 || undefined,
          state: state || undefined,
          city: city || undefined,
          postal_code: postalCode || undefined,
          country: 'India',
        },
      });
      showToast({ message: 'Business profile updated', type: 'success' });
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Save failed', type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  if (fetching) return null;

  return (
    <>
      {/* Firm Info */}
      <div className={s.card}>
        <div className={s.cardTitle}>Business Information</div>
        <div className={s.cardDesc}>Your firm details visible on reports and client communications</div>

        <FormInput
          label="Firm / Business Name"
          placeholder="Your advisory firm name"
          value={firmName}
          onChange={(e) => setFirmName(e.target.value)}
          required
          disabled={loading}
        />

        <div className={s.selectGroup}>
          <label className={s.selectLabel}>Business Type</label>
          <select className={s.select} value={businessType} onChange={(e) => setBusinessType(e.target.value)} disabled={loading}>
            <option value="">Select business type...</option>
            {BUSINESS_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className={s.formRow}>
          <FormInput label="ARN" placeholder="ARN-12345" value={arn} onChange={(e) => setArn(e.target.value)} disabled={loading} />
          <FormInput label="PAN" placeholder="ABCDE1234F" value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} disabled={loading} />
        </div>

        <FormInput label="GSTIN" placeholder="22AAAAA0000A1Z5" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} disabled={loading} />
      </div>

      {/* Address */}
      <div className={s.card}>
        <div className={s.cardTitle}>Business Address</div>
        <div className={s.cardDesc}>Used for compliance documents and correspondence</div>

        <FormInput label="Address Line 1" placeholder="Building, street" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} disabled={loading} />
        <FormInput label="Address Line 2" placeholder="Area, landmark" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} disabled={loading} />

        <div className={s.formRow}>
          <div className={s.selectGroup}>
            <label className={s.selectLabel}>State</label>
            <select className={s.select} value={state} onChange={(e) => setState(e.target.value)} disabled={loading}>
              <option value="">Select...</option>
              {INDIAN_STATES.map((st) => (
                <option key={st.code} value={st.name}>{st.name}</option>
              ))}
            </select>
          </div>
          <FormInput label="City" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} disabled={loading} />
        </div>

        <div className={s.formRow}>
          <FormInput label="PIN Code" placeholder="500001" value={postalCode} onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, '').slice(0, 6))} disabled={loading} />
          <FormInput label="Country" value="India" onChange={() => {}} disabled readOnly />
        </div>

        <div className={s.actions}>
          <button className={s.btnSave} onClick={handleSave} disabled={loading}>
            {loading ? <InlineLoader size="sm" message="Saving..." /> : 'Save Changes'}
          </button>
        </div>
      </div>
    </>
  );
}
