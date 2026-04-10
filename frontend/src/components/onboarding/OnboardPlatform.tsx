'use client';

import { useState, useEffect } from 'react';
import { useToast } from '../toast';
import { InlineLoader } from '../loader';
import { apiFetch } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import s from './OnboardPlatform.module.css';

interface Props {
  onComplete: () => void;
  onSkip?: () => void;
  onBack?: () => void;
}

interface ExtRefType {
  code: string;
  label: string;
  description: string;
  sort_order: number;
}

/* ── Platform icons (inline SVG) ─────────────────────────────────────────── */

function PlatformIcon({ code }: { code: string }) {
  switch (code) {
    case 'CAMS':
      return (
        <svg viewBox="0 0 40 40" fill="none" width="32" height="32">
          <rect width="40" height="40" rx="10" fill="color-mix(in srgb, var(--color-primary) 15%, transparent)" />
          <text x="20" y="26" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--color-primary)" fontFamily="var(--font-mono, monospace)">C</text>
        </svg>
      );
    case 'KFINTECH':
      return (
        <svg viewBox="0 0 40 40" fill="none" width="32" height="32">
          <rect width="40" height="40" rx="10" fill="color-mix(in srgb, var(--color-accent) 15%, transparent)" />
          <text x="20" y="26" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--color-accent)" fontFamily="var(--font-mono, monospace)">K</text>
        </svg>
      );
    case 'IWELL':
      return (
        <svg viewBox="0 0 40 40" fill="none" width="32" height="32">
          <rect width="40" height="40" rx="10" fill="color-mix(in srgb, var(--color-info) 15%, transparent)" />
          <text x="20" y="26" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--color-info)" fontFamily="var(--font-mono, monospace)">IW</text>
        </svg>
      );
    case 'BSE_STAR':
      return (
        <svg viewBox="0 0 40 40" fill="none" width="32" height="32">
          <rect width="40" height="40" rx="10" fill="color-mix(in srgb, var(--color-warning) 15%, transparent)" />
          <text x="20" y="26" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--color-warning)" fontFamily="var(--font-mono, monospace)">BSE</text>
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 40 40" fill="none" width="32" height="32">
          <rect width="40" height="40" rx="10" fill="color-mix(in srgb, var(--color-muted) 15%, transparent)" />
          <text x="20" y="26" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--color-muted)" fontFamily="var(--font-mono, monospace)">ID</text>
        </svg>
      );
  }
}

/* ── Component ───────────────────────────────────────────────────────────── */

export default function OnboardPlatform({ onComplete, onBack }: Props) {
  const { showToast } = useToast();

  const [types, setTypes]       = useState<ExtRefType[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);

  // Load platform types from backend
  useEffect(() => {
    apiFetch<{ ext_ref_types: ExtRefType[] }>(API.masterData.extRefTypes)
      .then((res) => setTypes(res.ext_ref_types))
      .catch(() => showToast({ message: 'Failed to load platform types', type: 'error' }))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!selected) {
      showToast({ message: 'Please select your platform', type: 'error' });
      return;
    }
    setSaving(true);
    try {
      await apiFetch(API.tenant.setExtRefType, { body: { ext_ref_type_code: selected } });
      showToast({ message: 'Platform saved', type: 'success' });
      onComplete();
    } catch (err: any) {
      if (err?.code === 'ALREADY_SET') {
        // Already set is fine during onboarding — treat as success
        onComplete();
        return;
      }
      showToast({ message: err?.message || 'Failed to save platform', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={s.step}>
      <div className={s.stepHead}>
        <p className={s.eyebrow}>Step Setup</p>
        <h2 className={s.title}>Your Client Platform</h2>
        <p className={s.subtitle}>
          Which platform do you use to track client reference IDs?
          This determines the label used when converting prospects to clients.
        </p>
        <div className={s.lockNote}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          Once selected, this cannot be changed without admin support.
        </div>
      </div>

      {loading ? (
        <div className={s.loadingWrap}>
          <InlineLoader message="Loading platforms…" />
        </div>
      ) : (
        <div className={s.grid}>
          {types.map((type) => (
            <button
              key={type.code}
              className={`${s.card} ${selected === type.code ? s.cardSelected : ''}`}
              onClick={() => setSelected(type.code)}
              type="button"
            >
              <div className={s.cardInner}>
                <div className={s.cardIcon}>
                  <PlatformIcon code={type.code} />
                </div>
                <div className={s.cardBody}>
                  <div className={s.cardLabel}>{type.label}</div>
                  <div className={s.cardDesc}>{type.description}</div>
                </div>
                <div className={s.cardCheck}>
                  {selected === type.code && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className={s.footer}>
        {onBack && (
          <button className={s.backBtn} onClick={onBack} type="button" disabled={saving}>
            ← Back
          </button>
        )}
        <button
          className={s.saveBtn}
          onClick={handleSave}
          disabled={!selected || saving || loading}
          type="button"
        >
          {saving ? 'Saving…' : 'Save & Continue →'}
        </button>
      </div>
    </div>
  );
}
