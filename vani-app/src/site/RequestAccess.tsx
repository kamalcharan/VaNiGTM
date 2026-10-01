'use client';
/**
 * Request access — VaNi is in closed beta. The request becomes a lead in
 * Vikuna's own workspace (VaNiGTM `POST /api/v1/funnel/access-request`),
 * carrying the site the visitor read, if they read one.
 *
 * Works without a read too: someone who never tried the box can still ask.
 * Country code and mobile are separate fields (VaNiGTM lesson 11).
 */
import { useEffect, useState, type FormEvent } from 'react';
import { InlineLoader } from '@/platform/feedback';
import { useSkillMutation } from '@/lib/useSkillMutation';
import { useSiteRead } from './SiteState';
import s from './landing.module.css';

/** What the person agrees to. Sent with the request so the server records the exact words. */
export const ACCESS_CONSENT = 'Vikuna may contact me about VaNi access. I can ask to be removed at any time.';

export function RequestAccess() {
  const { read } = useSiteRead();
  const [f, setF] = useState({ name: '', email: '', role_title: '', country_code: '+91', mobile: '', company: '' });
  const [agreed, setAgreed] = useState(false);
  const [touchedCompany, setTouchedCompany] = useState(false);
  const [done, setDone] = useState(false);

  // The company comes from the card until the person types their own.
  useEffect(() => {
    if (!touchedCompany && read.company) setF((v) => ({ ...v, company: read.company ?? '' }));
  }, [read.company, touchedCompany]);

  const send = useSkillMutation('funnel', 'request_access', {
    errorMessage: 'Your request did not go through',
    onSuccess: () => setDone(true),
  });

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((v) => ({ ...v, [k]: e.target.value }));
  const ready = f.name.trim() && f.email.includes('@') && f.role_title.trim() && f.company.trim() && agreed;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    void send.mutate({
      name: f.name.trim(), email: f.email.trim(), role_title: f.role_title.trim(),
      country_code: f.country_code.trim(), mobile: f.mobile.trim(), company: f.company.trim(),
      site: read.site, token: read.token, consent_text: ACCESS_CONSENT,
    });
  };

  if (done) {
    return (
      <div className={s.accessDone} role="status">
        <h3 className={s.blockTitle}>Thanks — we will be in touch.</h3>
        <p className={s.blockBody}>VaNi is in closed beta. We read every request and reply from connect@vikuna.io.</p>
      </div>
    );
  }

  return (
    <form className={s.access} onSubmit={onSubmit}>
      <div className={s.fieldRow}>
        <label className={s.field}><span>Name</span><input value={f.name} onChange={set('name')} autoComplete="name" required /></label>
        <label className={s.field}><span>Work email</span><input type="email" value={f.email} onChange={set('email')} autoComplete="email" required /></label>
      </div>
      <div className={s.fieldRow}>
        <label className={s.field}><span>Your role</span><input value={f.role_title} onChange={set('role_title')} autoComplete="organization-title" placeholder="Founder, Head of Sales…" required /></label>
        <label className={s.field}><span>Company</span><input value={f.company} onChange={(e) => { setTouchedCompany(true); set('company')(e); }} autoComplete="organization" required /></label>
      </div>
      <div className={s.fieldRow}>
        <label className={`${s.field} ${s.fieldCode}`}><span>Code</span><input value={f.country_code} onChange={set('country_code')} autoComplete="tel-country-code" /></label>
        <label className={s.field}><span>Mobile <em>(optional)</em></span><input type="tel" value={f.mobile} onChange={set('mobile')} autoComplete="tel-national" inputMode="numeric" /></label>
      </div>
      {read.site && <p className={s.tryNote}>We will attach the read of <strong>{read.site}</strong> to your request.</p>}
      <label className={s.consent}>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} required />
        <span>{ACCESS_CONSENT}</span>
      </label>
      <button className={s.btnPrimary} type="submit" disabled={!ready || send.isPending}>
        {send.isPending ? <InlineLoader size="sm" message="Sending…" /> : 'Request access'}
      </button>
      {send.error && <p className={s.tryError} role="alert">{send.error.message}</p>}
    </form>
  );
}
