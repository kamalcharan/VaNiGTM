'use client';

/**
 * VdfProactiveCard — VaNi gradient banner with a single message + one CTA.
 *
 * Use for proactive AI suggestions, bulk-action nudges, or system notices.
 * Gradient is built from CSS variables so it works across all 12 themes.
 */

import s from './VdfProactiveCard.module.css';

export interface VdfProactiveCardProps {
  /** Short header label, e.g. "VaNi Insight" */
  label?: string;
  /** Main message text */
  message: string;
  /** CTA button label */
  ctaLabel?: string;
  /** CTA handler */
  onCta?: () => void;
  /** Whether the CTA is in a loading state */
  ctaLoading?: boolean;
  /** Dismiss handler — renders × if provided */
  onDismiss?: () => void;
  className?: string;
}

export function VdfProactiveCard({
  label = 'VaNi',
  message,
  ctaLabel,
  onCta,
  ctaLoading,
  onDismiss,
  className,
}: VdfProactiveCardProps) {
  return (
    <div className={`${s.card} ${className || ''}`}>
      {/* Subtle noise overlay for texture */}
      <div className={s.noise} aria-hidden />

      <div className={s.body}>
        <div className={s.textGroup}>
          <span className={s.label}>{label}</span>
          <p className={s.message}>{message}</p>
        </div>

        {ctaLabel && onCta && (
          <button
            className={s.cta}
            onClick={onCta}
            disabled={ctaLoading}
            type="button"
          >
            {ctaLoading && <span className={s.spinner} />}
            {ctaLabel}
          </button>
        )}
      </div>

      {onDismiss && (
        <button className={s.dismiss} onClick={onDismiss} title="Dismiss" type="button">
          ✕
        </button>
      )}
    </div>
  );
}
