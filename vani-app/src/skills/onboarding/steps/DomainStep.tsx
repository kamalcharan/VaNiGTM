'use client';

/**
 * VN-10, the domain — step 6 of the Smart Profile.
 *
 * Writes `vani_tenant_domain` through the onboarding engine; the server
 * bridges the vn_ tenant to the vani_ platform spine by slug, provisioning
 * the `vani_tenant` row on first touch. The server also normalises whatever
 * gets pasted (URL, trailing path, port) down to the bare host — the light
 * cleanup here is only so the tenant sees what will actually be saved.
 */

import { useState, type FormEvent } from 'react';
import type { StepArtefactProps, StepScreenProps } from '../lane';
import { ArtefactCard, ArtefactSection } from '@/platform/pathway';
import { InlineLoader } from '@/platform/feedback';
import s from '../onboarding.module.css';

/** Mirror of the server's normalisation, for preview only — it re-does this. */
function normalise(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');
}

export default function DomainStep({ initial, save, isSaving }: StepScreenProps) {
  const [domain, setDomain] = useState((initial.domain as string) ?? '');
  const [purpose, setPurpose] = useState<string>((initial.purpose as string) ?? 'workspace');
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSaving) return;

    const host = normalise(domain);
    if (!host || !host.includes('.')) {
      setError('Enter the domain your workspace runs on, like app.example.com');
      return;
    }
    setError('');
    await save({ domain: host, purpose });
  }

  const preview = normalise(domain);

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className={s.field}>
        <label className={s.label} htmlFor="ob-domain">Domain</label>
        <input id="ob-domain" className={s.input} value={domain}
          onChange={(e) => setDomain(e.target.value)} placeholder="app.example.com"
          autoComplete="url" spellCheck={false} autoFocus disabled={isSaving} />
        {preview && preview !== domain.trim() && (
          <div className={s.note} style={{ marginTop: 6 }}>Will be saved as <strong>{preview}</strong></div>
        )}
      </div>

      <div className={s.field}>
        <label className={s.label} htmlFor="ob-purpose">What runs on it</label>
        <select id="ob-purpose" className={s.select} value={purpose}
          onChange={(e) => setPurpose(e.target.value)} disabled={isSaving}>
          <option value="workspace">Workspace — where your team works</option>
          <option value="candidate">Candidate-facing — where applicants land</option>
        </select>
        <div className={s.note} style={{ marginTop: 6 }}>
          Agents address your workspace by this domain. More domains — a careers
          site, a second product — can be added when an agent needs them.
        </div>
      </div>

      {error && <div className={s.err} role="alert"><span aria-hidden="true">⚠</span><span>{error}</span></div>}

      <div className={s.actions}>
        <button type="submit" className={s.primary} disabled={isSaving}>
          {isSaving ? <InlineLoader message="Saving…" /> : 'Save and continue →'}
        </button>
        <span className={s.note}>Changeable later. A domain already registered to another workspace is refused.</span>
      </div>
    </form>
  );
}

/** What survives: the address agents will use, and what it serves. */
export function DomainArtefact({ values, onReopen }: StepArtefactProps) {
  return (
    <ArtefactSection label="Your domain" onReopen={onReopen}>
      <ArtefactCard
        fields={[
          { label: 'Domain', value: values.domain as string },
          { label: 'Serves', value: values.purpose === 'candidate' ? 'Candidates' : 'Workspace' },
        ]}
      />
    </ArtefactSection>
  );
}
