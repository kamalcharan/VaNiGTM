'use client';

/**
 * VdfActionCard — VaNi observation card shown in the populated snapshot view.
 *
 * Three visual tones via a 2 px top accent bar and coloured label pill:
 *   'ok'   → success green  (strength identified)
 *   'warn' → warning amber  (gap to address)
 *   'bad'  → danger red     (critical risk)
 *
 * Usage:
 *   <VdfActionCard
 *     tone="ok"
 *     label="Strength"
 *     title="Savings rate is in the top 5% of your income bracket."
 *     ctaLabel="Build SIP plan →"
 *     onCta={() => router.push('/planning')}
 *   />
 *
 *   <VdfActionCard
 *     tone="bad"
 *     label="Risk"
 *     title="Real-estate concentration at 79% of total assets."
 *     ctaLabel="Review allocation"
 *     onCta={() => {}}
 *   />
 */

import s from './VdfActionCard.module.css';

export type ActionTone = 'ok' | 'warn' | 'bad';

export interface VdfActionCardProps {
  /** Visual tone — sets accent bar + label pill colour */
  tone?: ActionTone;
  /** Short uppercase pill text, e.g. "Strength", "Risk", "Gap" */
  label?: string;
  /** Main italic observation text */
  title: string;
  /** CTA link/button label — omit to hide */
  ctaLabel?: string;
  /** Called when CTA is clicked */
  onCta?: () => void;
  className?: string;
}

export function VdfActionCard({
  tone = 'ok',
  label,
  title,
  ctaLabel,
  onCta,
  className,
}: VdfActionCardProps) {
  return (
    <div className={`${s.card} ${s[`tone_${tone}`]} ${className || ''}`}>
      {/* 2 px accent top bar rendered via CSS ::before on .tone_* */}

      {label && (
        <span className={`${s.pill} ${s[`pill_${tone}`]}`}>{label}</span>
      )}

      <p className={s.title}>{title}</p>

      {ctaLabel && onCta && (
        <button className={s.cta} onClick={onCta} type="button">
          {ctaLabel}
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}
