'use client';
/**
 * Chapter 1 — Your context. Reference `context()` in views-context.js.
 *
 * The one place the mission meets the Smart Profile (Charan, 2026-09-29:
 * "we expect to sync with our smart profile"). On a fresh mission in live
 * mode the business comes from the tenant and the profile source names what
 * the Smart Profile holds; nothing the profile does not know is invented
 * (VaNiGTM rule 9d) — a blank field is a blank field. In mock mode the
 * reference's example company is shown, so the screen matches the prototype.
 */
import { useEffect, useRef, type FormEvent } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/auth-provider';
import { IS_LIVE } from '@/lib/transport';
import { useProfileRead } from '@/skills/smart-profile/useSmartProfile';
import { useMission } from '../mission/MissionProvider';
import { Intro, Input, Btn } from '../ui';

export function ContextView() {
  const { m, update, go, registerCapture, hydrated } = useMission();
  const { tenant } = useAuth();
  const profile = useProfileRead();
  const form = useRef<HTMLFormElement>(null);

  // Seed from the Smart Profile once, on a mission that has not confirmed context yet.
  const seeded = useRef(false);
  useEffect(() => {
    if (!hydrated || seeded.current || m.icpConfirmed || !IS_LIVE) return;
    if (profile.isLoading) return;
    seeded.current = true;
    const p = profile.data?.data;
    update((d) => {
      d.company = tenant?.name || '';
      d.industry = '';
      d.locations = '';
      d.profileSource = p?.product_name ? `Smart Profile · ${p.product_name}` : 'Smart Profile · not yet built';
    });
  }, [hydrated, m.icpConfirmed, profile.isLoading, profile.data, tenant, update]);

  // Leaving by the sidebar keeps what was typed (reference `capture()`).
  useEffect(() => {
    registerCapture(() => {
      if (!form.current) return;
      const d = Object.fromEntries(new FormData(form.current)) as Record<string, string>;
      update((x) => { x.company = d.company ?? x.company; x.industry = d.industry ?? x.industry; x.locations = d.locations ?? x.locations; });
    });
    return () => registerCapture(null);
  }, [registerCapture, update]);

  const onSubmit = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(ev.currentTarget)) as Record<string, string>;
    update((x) => { x.company = d.company; x.industry = d.industry; x.locations = d.locations; x.storage = d.storage === 'on'; x.icpConfirmed = true; });
    go(1);
  };

  const profileHint = IS_LIVE
    ? <>Your Smart Profile is the inherited context. <Link href="/smart-profile">Open it</Link> to change what VaNi knows; correct the fields here for this mission only.</>
    : <>This editable preview profile represents inherited onboarding context. Live company research is not connected.</>;

  return (
    <>
      <Intro step="CONTEXT" title="Let’s start with what we know." sub="Your onboarding context carries forward. Correct anything that has changed, then introduce the people behind the process." />
      <form id="context" ref={form} onSubmit={onSubmit} key={hydrated ? 'h' : 's'}>
        <div className="compact-columns">
          <section className="card">
            <h2>Your business</h2>
            <div className="form-grid">
              <Input label="Company" name="company" defaultValue={m.company} required maxLength={120} />
              <Input label="Industry" name="industry" defaultValue={m.industry} required maxLength={120} />
              <Input label="Operating footprint" name="locations" defaultValue={m.locations} maxLength={200} />
            </div>
            <p className="micro">Confirming this profile does not confirm your process rules.</p>
          </section>
          <aside className="card compact-aside">
            <div className="eyebrow">EDGE / OUR STARTING POINT</div>
            <h2>One continuous mission</h2>
            <p>Your business, people and evidence will stay connected as we investigate.</p>
            <dl>
              <dt>Profile source</dt><dd>{m.profileSource}</dd>
              <dt>Systems to confirm later</dt><dd>Tally and Excel · illustrative inference</dd>
            </dl>
            <details><summary>What does Edge know?</summary><p>{profileHint}</p></details>
            <label className="consent"><input name="storage" type="checkbox" defaultChecked={m.storage} />Save answers on this device so I can resume.</label>
            <p className="micro">Raw attachments are not saved. Leave unchecked on a shared device.</p>
          </aside>
        </div>
        <div className="step-actions compact-actions">
          <Btn kind="text" onClick={() => go(-1)}>← Home</Btn>
          <span className="action-hint">Next: meet the people doing the work</span>
          <button type="submit" className="btn primary">Confirm context &amp; meet the team →</button>
        </div>
      </form>
    </>
  );
}
