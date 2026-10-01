'use client';

/**
 * VN-11, the person. Writes vn_users in the same transaction that marks the
 * step done — one call, so the screen cannot leave one without the other.
 */

import { useState, type FormEvent } from 'react';
import type { StepArtefactProps, StepScreenProps } from '../lane';
import { ArtefactCard, ArtefactSection } from '@/platform/pathway';
import { InlineLoader } from '@/platform/feedback';
import { useAuth } from '@/context/auth-provider';
import s from '../onboarding.module.css';

export default function UserProfileStep({ initial, save, isSaving }: StepScreenProps) {
  // The name was given at signup; start from it rather than ask again.
  const { user } = useAuth();
  const [name, setName] = useState((initial.name as string) || user?.name || '');
  const [designation, setDesignation] = useState((initial.designation as string) ?? '');
  const [countryCode, setCountryCode] = useState((initial.country_code as string) ?? '+91');
  const [mobile, setMobile] = useState((initial.mobile as string) ?? '');
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSaving) return;

    if (name.trim().length < 2) {
      setError('Enter your full name.');
      return;
    }
    // Matches validateRegisterInput's rule so the server's 400 is never the
    // first time someone hears about it.
    if (mobile && !/^\d{6,15}$/.test(mobile.replace(/[\s-]/g, ''))) {
      setError('A mobile number is 6 to 15 digits.');
      return;
    }
    setError('');

    const parts = name.trim().split(/\s+/);
    await save({
      name: name.trim(),
      first_name: parts[0],
      last_name: parts.slice(1).join(' '),
      designation: designation.trim(),
      country_code: countryCode.trim(),
      mobile: mobile.replace(/[\s-]/g, ''),
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className={s.field}>
        <label className={s.label} htmlFor="ob-name">Your name</label>
        <input id="ob-name" className={s.input} value={name}
          onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace"
          autoComplete="name" autoFocus disabled={isSaving} />
      </div>

      <div className={s.field}>
        <label className={s.label} htmlFor="ob-designation">
          Your role <span className={s.optional}>— optional</span>
        </label>
        <input id="ob-designation" className={s.input} value={designation}
          onChange={(e) => setDesignation(e.target.value)} placeholder="Head of Operations"
          autoComplete="organization-title" disabled={isSaving} />
      </div>

      <div className={s.grid2}>
        <div className={s.field}>
          <label className={s.label} htmlFor="ob-cc">
            Code <span className={s.optional}>— optional</span>
          </label>
          <input id="ob-cc" className={s.input} value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)} placeholder="+91" disabled={isSaving} />
        </div>
        <div className={s.field}>
          <label className={s.label} htmlFor="ob-mobile">
            Mobile <span className={s.optional}>— optional</span>
          </label>
          <input id="ob-mobile" className={s.input} value={mobile}
            onChange={(e) => setMobile(e.target.value)} placeholder="9876543210"
            inputMode="numeric" autoComplete="tel-national" disabled={isSaving} />
        </div>
      </div>

      {error && <div className={s.err} role="alert"><span aria-hidden="true">⚠</span><span>{error}</span></div>}

      <div className={s.actions}>
        <button type="submit" className={s.primary} disabled={isSaving}>
          {isSaving ? <InlineLoader message="Saving…" /> : 'Save and continue →'}
        </button>
        <span className={s.note}>You can change any of this later in Settings.</span>
      </div>
    </form>
  );
}

/**
 * What survives into the rail: who is acting, and how to reach them. The
 * country code is folded into the number — two fields for one fact is noise in
 * a 240px column.
 */
export function UserProfileArtefact({ values, onReopen }: StepArtefactProps) {
  const cc = (values.country_code as string) ?? '';
  const mobile = (values.mobile as string) ?? '';
  return (
    <ArtefactSection label="You" onReopen={onReopen}>
      <ArtefactCard
        fields={[
          { label: 'Name', value: values.name as string },
          { label: 'Role', value: values.designation as string },
          { label: 'Mobile', value: mobile ? `${cc} ${mobile}`.trim() : null },
        ]}
      />
    </ArtefactSection>
  );
}
