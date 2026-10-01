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

/**
 * Preview of the server's origin normalisation. Preview ONLY — the server
 * re-does it and is the authority, and it refuses things this does not
 * (plain http on a real host, credentials in the URL).
 */
function previewOrigin(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`);
    return `${u.protocol.replace(':', '')}://${u.host.toLowerCase()}`;
  } catch {
    return '';
  }
}

export default function DomainStep({ initial, save, isSaving }: StepScreenProps) {
  const [domain, setDomain] = useState((initial.domain as string) ?? '');
  const [purpose, setPurpose] = useState<string>((initial.purpose as string) ?? 'workspace');
  const [origins, setOrigins] = useState(
    Array.isArray(initial.embed_origins) ? (initial.embed_origins as string[]).join(', ') : '');
  // Once the tenant edits the origin themselves, stop following the domain.
  const [originsTouched, setOriginsTouched] = useState(Boolean(initial.embed_origins));
  const [error, setError] = useState('');

  const host = normalise(domain);
  const candidate = purpose === 'candidate';

  // The suggestion tracks the domain until the tenant takes it over. It is a
  // SUGGESTION IN AN EDITABLE FIELD, not a default applied behind their back:
  // an embed origin is an allowlist entry, and the tenant reads this one and
  // can change it before it is saved.
  const suggested = host.includes('.') ? `https://${host}` : '';
  const originValue = originsTouched ? origins : suggested;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSaving) return;

    if (!host || !host.includes('.')) {
      setError('Enter the domain your workspace runs on, like app.example.com');
      return;
    }
    const list = originValue.split(',').map((x) => x.trim()).filter(Boolean);
    if (candidate && list.length === 0) {
      // Vara's readiness checklist gates activation on this, so an empty one
      // is not a smaller version of done — it is a workspace that can never
      // go live, with nothing on this screen saying so.
      setError('Vara needs at least one origin allowlisted before she can go live');
      return;
    }
    setError('');
    await save({ domain: host, purpose, embed_origins: list });
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

      {candidate && (
        <div className={s.field}>
          <label className={s.label} htmlFor="ob-origins">Where the widget is embedded</label>
          <input id="ob-origins" className={s.input} value={originValue}
            onChange={(e) => { setOriginsTouched(true); setOrigins(e.target.value); }}
            placeholder="https://careers.example.com" spellCheck={false} disabled={isSaving} />
          <div className={s.note} style={{ marginTop: 6 }}>
            The allowlist for Vara&rsquo;s chat widget — only these sites may load it
            under your name. Usually the careers site itself. Separate several with
            commas; each must be <strong>https</strong>.
            {previewOrigin(originValue) && previewOrigin(originValue) !== originValue.trim() && (
              <> Will be saved as <strong>{previewOrigin(originValue)}</strong>.</>
            )}
          </div>
        </div>
      )}

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
          ...(Array.isArray(values.embed_origins) && (values.embed_origins as string[]).length
            ? [{ label: 'Widget allowed on', value: (values.embed_origins as string[]).join(', ') }]
            : []),
        ]}
      />
    </ArtefactSection>
  );
}
