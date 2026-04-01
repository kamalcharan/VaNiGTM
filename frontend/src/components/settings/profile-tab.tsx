'use client';

import { useState, useEffect } from 'react';
import { useMe } from '@/hooks';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { InlineLoader } from '@/components/loader';
import FormInput from '@/components/ui/form-input';
import s from './settings-tabs.module.css';

export default function ProfileTab() {
  const { data: me } = useMe();
  const { showToast } = useToast();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);

  // Populate from /me data
  useEffect(() => {
    if (me?.user) {
      setFullName(me.user.name || '');
      setDesignation(me.user.designation || '');
      setPhone(me.user.mobile || '');
    }
  }, [me]);

  const initials = fullName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  function handleCancel() {
    if (me?.user) {
      setFullName(me.user.name || '');
      setDesignation(me.user.designation || '');
      setPhone(me.user.mobile || '');
      setBio('');
    }
  }

  async function handleSave() {
    if (!fullName || fullName.trim().length < 2) {
      showToast({ message: 'Name must be at least 2 characters', type: 'error' });
      return;
    }
    setLoading(true);
    try {
      await apiFetch(API.auth.preferences, {
        body: {
          profile_name: fullName.trim(),
          mobile: phone || undefined,
          designation: designation || undefined,
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
        <div className={s.photoPreview}>{initials || '?'}</div>
        <div className={s.photoInfo}>
          <div className={s.photoInfoTitle}>Profile photo</div>
          <div className={s.photoInfoHint}>JPG or PNG, max 2MB</div>
        </div>
        <button className={s.photoBtn} disabled title="Coming soon — requires storage setup">
          Change
        </button>
      </div>

      <FormInput
        label="Full Name"
        placeholder="Your full name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        required
        disabled={loading}
      />

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
          <option value="mfd">Mutual Fund Distributor (MFD)</option>
          <option value="ria">Registered Investment Advisor (RIA)</option>
          <option value="ifa">Insurance Financial Advisor (IFA)</option>
          <option value="cfp">Certified Financial Planner (CFP)</option>
          <option value="wm">Wealth Manager</option>
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
        label="Bio"
        placeholder="A short description for client-facing reports..."
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        disabled={loading}
      />

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
