'use client';

import { useState, useEffect } from 'react';
import { useMe } from '@/hooks';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { InlineLoader } from '@/components/loader';
import { VdfMobileInput, VdfRichText } from '@/components/vdf';
import FormInput from '@/components/ui/form-input';
import { validateMobile, getCountryByCode } from '@/constants/countries';
import s from './settings-tabs.module.css';

const DESIGNATIONS = [
  { value: 'mfd', label: 'Mutual Fund Distributor (MFD)' },
  { value: 'ria', label: 'Registered Investment Advisor (RIA)' },
  { value: 'ifa', label: 'Insurance Financial Advisor (IFA)' },
  { value: 'cfp', label: 'Certified Financial Planner (CFP)' },
  { value: 'wm', label: 'Wealth Manager' },
  { value: 'other', label: 'Other' },
];

export default function ProfileTab() {
  const { data: me } = useMe();
  const { showToast } = useToast();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [designation, setDesignation] = useState('');
  const [countryCode, setCountryCode] = useState('in');
  const [mobile, setMobile] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);

  // Populate from /me data
  useEffect(() => {
    if (me?.user) {
      const u = me.user;
      if (u.first_name || u.last_name) {
        setFirstName(u.first_name || '');
        setLastName(u.last_name || '');
      } else if (u.name) {
        const parts = u.name.split(' ');
        setFirstName(parts[0] || '');
        setLastName(parts.slice(1).join(' ') || '');
      }
      setDesignation(u.designation || '');
      setMobile(u.mobile || '');
      if (u.preferences && typeof u.preferences === 'object') {
        const cc = (u as any).country_code;
        if (cc) setCountryCode(cc);
      }
    }
  }, [me]);

  const initials = `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase() || '?';

  function handleCancel() {
    if (me?.user) {
      const u = me.user;
      if (u.first_name || u.last_name) {
        setFirstName(u.first_name || '');
        setLastName(u.last_name || '');
      } else if (u.name) {
        const parts = u.name.split(' ');
        setFirstName(parts[0] || '');
        setLastName(parts.slice(1).join(' ') || '');
      }
      setDesignation(u.designation || '');
      setMobile(u.mobile || '');
      setBio('');
    }
  }

  async function handleSave() {
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (fullName.length < 2) {
      showToast({ message: 'Name must be at least 2 characters', type: 'error' });
      return;
    }

    if (mobile) {
      const country = getCountryByCode(countryCode);
      if (country && !validateMobile(mobile, countryCode)) {
        showToast({ message: `Invalid mobile number for ${country.name}`, type: 'error' });
        return;
      }
    }

    setLoading(true);
    try {
      await apiFetch(API.auth.preferences, {
        body: {
          profile_name: fullName,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          designation: designation || undefined,
          country_code: countryCode,
          mobile: mobile || undefined,
          bio: bio || undefined,
        },
      });
      showToast({ message: 'Profile updated', type: 'success' });
    } catch (err) {
      const msg = (err as ApiError).message || 'Save failed';
      showToast({ message: msg, type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={s.card}>
      <div className={s.cardTitle}>Profile Information</div>
      <div className={s.cardDesc}>This is how you appear across the platform</div>

      <div className={s.photoUpload}>
        <div className={s.photoPreview}>{initials}</div>
        <div className={s.photoInfo}>
          <div className={s.photoInfoTitle}>Profile photo</div>
          <div className={s.photoInfoHint}>JPG or PNG, max 2MB</div>
        </div>
        <button className={s.photoBtn} disabled title="Coming soon">
          Change
        </button>
      </div>

      <div className={s.formRow}>
        <FormInput
          label="First Name"
          placeholder="Rajesh"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
          disabled={loading}
        />
        <FormInput
          label="Last Name"
          placeholder="Kumar"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          disabled={loading}
        />
      </div>

      <FormInput
        label="Email Address"
        type="email"
        value={me?.user?.email || ''}
        onChange={() => {}}
        disabled
        readOnly
      />

      <div className={s.selectGroup}>
        <label className={s.selectLabel}>Designation</label>
        <select
          className={s.select}
          value={designation}
          onChange={(e) => setDesignation(e.target.value)}
          disabled={loading}
        >
          <option value="">Select your role...</option>
          {DESIGNATIONS.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
      </div>

      <VdfMobileInput
        label="Phone Number"
        countryCode={countryCode}
        mobile={mobile}
        onCountryChange={setCountryCode}
        onMobileChange={setMobile}
        disabled={loading}
      />

      <div style={{ marginBottom: 'var(--form-group-gap)' }}>
        <VdfRichText
          label="Bio"
          placeholder="A short description for client-facing reports..."
          value={bio}
          onChange={setBio}
          maxLength={500}
          disabled={loading}
        />
      </div>

      <div className={s.actions}>
        <button className={s.btnCancel} onClick={handleCancel} disabled={loading}>
          Cancel
        </button>
        <button className={s.btnSave} onClick={handleSave} disabled={loading}>
          {loading ? <InlineLoader size="sm" message="Saving..." /> : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
