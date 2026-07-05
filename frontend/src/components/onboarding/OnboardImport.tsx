'use client';

import { BRAND } from '@/constants/brand';
import s from './OnboardImport.module.css';

interface Props {
  onComplete: () => void;
  onSkip?: () => void;
  onBack?: () => void;
}

const IMPORT_OPTIONS = [
  {
    id: 'cams',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="28" height="28">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
      </svg>
    ),
    title: 'Import from CAMS / KFintech',
    desc: 'Upload CAS PDF or KFintech statements',
    formats: ['CAMS CAS (PDF)', 'KFintech CAS'],
    disabled: true,
    tag: 'Coming soon',
  },
  {
    id: 'investwell',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="28" height="28">
        <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
        <path d="M13 2v7h7" />
      </svg>
    ),
    title: 'Import from InvestWell',
    desc: 'Upload InvestWell CSV or Excel export',
    formats: ['InvestWell CSV', 'Excel (.xlsx)'],
    disabled: true,
    tag: 'Coming soon',
  },
  {
    id: 'fresh',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="28" height="28">
        <path d="M12 5v14M5 12h14" />
      </svg>
    ),
    title: 'Start Fresh',
    desc: 'Add clients manually using the client management tool',
    formats: [],
    disabled: false,
    tag: null,
  },
];

export default function OnboardImport({ onComplete, onSkip, onBack }: Props) {
  return (
    <div className={s.page}>
      {/* Header */}
      <div className={s.pageHeader}>
        <div className={s.headerIcon}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="28" height="28">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <h1 className={s.pageTitle}>Import Client Data</h1>
        <p className={s.pageSubtitle}>
          Bring your existing clients into {BRAND.name}, or start fresh and add them manually.
        </p>
      </div>

      {/* Import Options */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span className={s.cardTitle}>Choose Import Method</span>
        </div>

        <div className={s.optionGrid}>
          {IMPORT_OPTIONS.map((opt) => (
            <div
              key={opt.id}
              className={`${s.optionCard} ${opt.disabled ? s.optionDisabled : ''}`}
              onClick={() => !opt.disabled && onComplete()}
            >
              <div className={s.optionIcon}>{opt.icon}</div>
              <div className={s.optionTitle}>{opt.title}</div>
              <div className={s.optionDesc}>{opt.desc}</div>

              {opt.formats.length > 0 && (
                <div className={s.formatChips}>
                  {opt.formats.map((f) => (
                    <span key={f} className={s.chip}>{f}</span>
                  ))}
                </div>
              )}

              {opt.tag && <span className={s.tagBadge}>{opt.tag}</span>}
              {!opt.disabled && <span className={s.selectBadge}>Select &rarr;</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Note */}
      <div className={s.note}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
        <span>You can import data anytime later from the Import Center in your dashboard. No data is lost by skipping this step.</span>
      </div>

      {/* Footer */}
      <div className={s.footerNav}>
        {onBack ? (
          <button className={s.backBtn} onClick={onBack} type="button">&larr; Back</button>
        ) : <div />}
        <div className={s.navRight}>
          <button className={s.skipBtn} onClick={onSkip}>Skip &mdash; I&apos;ll import later</button>
          <button className={s.saveBtn} onClick={onComplete}>FINISH SETUP &rarr;</button>
        </div>
      </div>
    </div>
  );
}
