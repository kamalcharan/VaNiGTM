'use client';

/**
 * VN-10, the organisation. Declared once here and delegated to every agent —
 * "one declaration, N projections". An agent activating later must not ask any
 * of this again.
 *
 * Two fields only (Charan, 2026-10-01): the name, shown because signup leaves
 * it defaulting to the person ("kamal's Workspace") and it may need fixing,
 * and the industry, which nothing else captures and which starts the industry
 * research. The website is already known from the Smart Profile and the
 * Domain step, and what the organisation does IS the Smart Profile — asking
 * either again here was repetition.
 */

import { useEffect, useState, type FormEvent } from 'react';
import type { StepArtefactProps, StepScreenProps } from '../lane';
import { apiFetch } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { ArtefactCard, ArtefactSection } from '@/platform/pathway';
import { InlineLoader } from '@/platform/feedback';
import s from '../onboarding.module.css';

/** Kept short on purpose. A list nobody's business is on teaches nothing. */
const INDUSTRIES = [
  'Financial services', 'Manufacturing', 'Healthcare', 'Retail & e-commerce',
  'Technology & SaaS', 'Logistics', 'Education', 'Professional services',
  'Real estate', 'Other',
];

export default function BusinessProfileStep({ initial, save, isSaving }: StepScreenProps) {
  const [name, setName] = useState((initial.display_name as string) ?? (initial.name as string) ?? '');
  const [industry, setIndustry] = useState((initial.industry as string) ?? '');
  const [error, setError] = useState('');

  // Reopened after onboarding, the step has no values from this session —
  // start from what is saved rather than blank fields. Only fields still empty
  // are filled, so nothing typed is overwritten; a failed read leaves the form
  // as it is (the person can still type everything).
  useEffect(() => {
    if (initial.industry || initial.name || initial.display_name) return;
    let cancelled = false;
    apiFetch<{ profile?: { name?: string; display_name?: string; industry?: string } }>(API.tenant.profile)
      .then((r) => {
        const p = r?.profile;
        if (cancelled || !p) return;
        setName((v) => v || p.display_name || p.name || '');
        setIndustry((v) => v || (p.industry && INDUSTRIES.includes(p.industry) ? p.industry : ''));
      })
      .catch(() => { /* prefill only */ });
    return () => { cancelled = true; };
  }, [initial.industry, initial.name, initial.display_name]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSaving) return;

    if (name.trim().length < 2) {
      setError('Enter the organisation name.');
      return;
    }
    if (!industry) {
      setError('Pick the closest industry. It binds the domain pack every agent inherits.');
      return;
    }
    setError('');

    await save({
      name: name.trim(),
      display_name: name.trim(),
      industry,
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className={s.field}>
        <label className={s.label} htmlFor="ob-org">Organisation name</label>
        <input id="ob-org" className={s.input} value={name}
          onChange={(e) => setName(e.target.value)} placeholder="Bharatha Varsha Labs"
          autoComplete="organization" autoFocus disabled={isSaving} />
      </div>

      <div className={s.field}>
        <label className={s.label} htmlFor="ob-industry">Industry</label>
        <select id="ob-industry" className={s.select} value={industry}
          onChange={(e) => setIndustry(e.target.value)} disabled={isSaving}>
          <option value="">Select an industry…</option>
          {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <div className={s.note} style={{ marginTop: 6 }}>
          Declared once. Every agent inherits it and never asks again. Saving it
          starts VaNi researching how your industry hires, in the background.
        </div>
      </div>

      {error && <div className={s.err} role="alert"><span aria-hidden="true">⚠</span><span>{error}</span></div>}

      <div className={s.actions}>
        <button type="submit" className={s.primary} disabled={isSaving}>
          {isSaving ? <InlineLoader message="Saving…" /> : 'Save and continue →'}
        </button>
        <span className={s.note}>Changeable later, but agents read it from the moment it is set.</span>
      </div>
    </form>
  );
}

/**
 * What survives: the organisation as every agent will inherit it. Industry is
 * kept even though it is one word, because it binds the domain pack — it is the
 * highest-consequence value on this card.
 */
export function BusinessProfileArtefact({ values, onReopen }: StepArtefactProps) {
  return (
    <ArtefactSection label="Your organisation" onReopen={onReopen}>
      <ArtefactCard
        fields={[
          { label: 'Name', value: values.display_name as string },
          { label: 'Industry', value: values.industry as string },
        ]}
      />
    </ArtefactSection>
  );
}
