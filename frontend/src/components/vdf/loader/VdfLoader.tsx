'use client';

import s from './VdfLoader.module.css';

export interface VdfLoaderProps {
  /** Primary status message */
  message?: string;
  /** Secondary hint text */
  hint?: string;
  /** Full-page overlay (true) or inline (false) */
  overlay?: boolean;
  className?: string;
}

/**
 * VdfLoader — Premium animated loading experience.
 *
 * Features:
 * - SVG key mark with draw animation
 * - "ProKey" text with shimmer effect
 * - Configurable status text with dots animation
 * - Subtle data stream particles
 * - Works as full-page overlay or inline content
 */
export function VdfLoader({ message = 'Loading', hint, overlay = false, className }: VdfLoaderProps) {
  return (
    <div className={`${overlay ? s.overlay : s.inline} ${className || ''}`}>
      {/* Data stream particles */}
      <div className={s.dataStream}>
        <div className={`${s.packet} ${s.p1}`} />
        <div className={`${s.packet} ${s.p2}`} />
        <div className={`${s.packet} ${s.p3}`} />
        <div className={`${s.packet} ${s.p4}`} />
      </div>

      <div className={s.container}>
        {/* Logo frame */}
        <div className={s.logoFrame}>
          <svg className={s.mark} viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
            <path className={s.markPath} d="M25 5 L10 12 V25 C10 35, 25 45, 25 45 C25 45, 40 35, 40 25 V12 L25 5 Z M25 18 A4 4 0 1 1 25 26 A4 4 0 1 1 25 18 M25 26 V34" />
          </svg>
          <div className={s.text}>ProKey</div>
        </div>

        {/* Status */}
        <div className={s.status}>
          <span>{message}<span className={s.dots} /></span>
          {hint && <span className={s.hint}>{hint}</span>}
        </div>
      </div>
    </div>
  );
}
