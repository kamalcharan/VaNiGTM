'use client';

/**
 * VN-10, the organisation. Declared once here and delegated to every agent —
 * "one declaration, N projections". An agent activating later must not ask any
 * of this again.
 */

import { useState, type FormEvent } from 'react';
import type { StepScreenProps } from '../lane';
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
  const [website, setWebsite] = useState((initial.website as string) ?? '');
  const [description, setDescription] = useState((initial.description as string) ?? '');
  const [error, setError] = useState('');

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
      website: website.trim(),
      description: description.trim(),
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
          Declared once. Every agent inherits it and never asks again.
        </div>
      </div>

      <div className={s.field}>
        <label className={s.label} htmlFor="ob-website">
          Website <span className={s.optional}>— optional</span>
        </label>
        <input id="ob-website" className={s.input} value={website}
          onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com"
          autoComplete="url" spellCheck={false} disabled={isSaving} />
      </div>

      <div className={s.field}>
        <label className={s.label} htmlFor="ob-desc">
          What the organisation does <span className={s.optional}>— optional</span>
        </label>
        <input id="ob-desc" className={s.input} value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="One line an agent could read and act on" disabled={isSaving} />
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
