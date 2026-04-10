'use client';

/**
 * VdfProactiveCard — VaNi message card with two visual modes.
 *
 * variant="default" (gradient) — proactive AI suggestions, bulk-action nudges,
 *   system notices. Gradient built from CSS variables, works across all 12 themes.
 *
 * variant="data" (dark terminal) — inline computed data readout shown after each
 *   snapshot form section. Monospace font. Supports colour-coded <mark> tokens
 *   for ok / warn / bad status highlights inside the message.
 *
 * Usage (data variant):
 *   <VdfProactiveCard
 *     variant="data"
 *     label="VaNi Copilot"
 *     message="Income ₹2,70,000/mo · Savings 52%"
 *     tags={[{ text: 'p95 bracket', status: 'ok' }]}
 *   />
 */

import s from './VdfProactiveCard.module.css';

export type ProactiveTag = {
  text: string;
  status: 'ok' | 'warn' | 'bad';
};

export interface VdfProactiveCardProps {
  /** Visual mode — 'default' = gradient banner, 'data' = dark terminal */
  variant?: 'default' | 'data';
  /** Short header label, e.g. "VaNi" or "VaNi Copilot" */
  label?: string;
  /** Main message text */
  message: string;
  /** Colour-coded inline tags (data variant only) */
  tags?: ProactiveTag[];
  /** CTA button label (default variant only) */
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
  variant = 'default',
  label,
  message,
  tags,
  ctaLabel,
  onCta,
  ctaLoading,
  onDismiss,
  className,
}: VdfProactiveCardProps) {
  const defaultLabel = variant === 'data' ? 'VaNi Copilot' : 'VaNi';

  if (variant === 'data') {
    return (
      <div className={`${s.dataCard} ${className || ''}`}>
        <span className={s.dataMarker} aria-hidden>▸</span>
        <div className={s.dataContent}>
          <span className={s.dataLabel}>{label ?? defaultLabel}</span>
          <p className={s.dataMessage}>{message}</p>
          {tags && tags.length > 0 && (
            <div className={s.dataTags}>
              {tags.map((tag, i) => (
                <span key={i} className={`${s.dataTag} ${s[`tag_${tag.status}`]}`}>
                  {tag.text}
                </span>
              ))}
            </div>
          )}
        </div>
        {onDismiss && (
          <button className={s.dismiss} onClick={onDismiss} title="Dismiss" type="button">✕</button>
        )}
      </div>
    );
  }

  return (
    <div className={`${s.card} ${className || ''}`}>
      {/* Subtle noise overlay for texture */}
      <div className={s.noise} aria-hidden />

      <div className={s.body}>
        <div className={s.textGroup}>
          <span className={s.label}>{label ?? defaultLabel}</span>
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
