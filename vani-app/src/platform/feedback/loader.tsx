'use client';

/**
 * Loaders — the same contract as VaNiGTM's frontend/src/components/loader.tsx,
 * so the two codebases stay interchangeable: `FullPageLoader` and
 * `InlineLoader`, sizes 'sm' | 'md' | 'lg', same prop names, same defaults.
 * Anything ported from there keeps working; anything written here reads the
 * same to someone who knows that repo.
 *
 * `VaniLoader` is this repo's answer to `VdfLoader` — the branded, first-paint
 * loader. Same structure (mark draw, wordmark, animated dots, drifting
 * particles) and the same props, with the VaNi orbit in place of ProKey's key
 * and shield. ProKey's contract has ended; its mark does not follow us here.
 *
 * Colours come from the VaNi token layer rather than VaNiGTM's --color-*
 * variables, which do not exist in this app.
 */

import s from './loader.module.css';

export type LoaderSize = 'sm' | 'md' | 'lg';

interface FullPageLoaderProps {
  size?: LoaderSize;
  message?: string;
  overlay?: boolean;
}

interface InlineLoaderProps {
  size?: LoaderSize;
  message?: string;
}

/* ── Spinner (shared) ────────────────────────────────── */

export function Spinner({ size = 'md' }: { size?: LoaderSize }) {
  return (
    <div className={`${s.spinner} ${s[size]}`} role="status" aria-label="Loading">
      <div className={s.ring} />
    </div>
  );
}

/* ── Full page ───────────────────────────────────────── */

export function FullPageLoader({
  size = 'lg',
  message,
  overlay = true,
}: FullPageLoaderProps) {
  return (
    <div className={`${s.fullPage} ${overlay ? s.overlayBg : ''}`}>
      <div className={s.fullPageContent}>
        <Spinner size={size} />
        {message && <p className={s.message}>{message}</p>}
      </div>
    </div>
  );
}

/* ── Inline ──────────────────────────────────────────── */

export function InlineLoader({ size = 'sm', message }: InlineLoaderProps) {
  return (
    <span className={s.inline}>
      <Spinner size={size} />
      {message && <span className={s.inlineMessage}>{message}</span>}
    </span>
  );
}

/* ── Branded ─────────────────────────────────────────── */

export interface VaniLoaderProps {
  /** Primary status message. */
  message?: string;
  /** Secondary hint — say what is being waited on, not "please wait". */
  hint?: string;
  /** Full-page overlay (true) or inline block (false). */
  overlay?: boolean;
  className?: string;
}

/**
 * VaniLoader — the branded wait.
 *
 * For first paint and for waits long enough that a bare spinner reads as a
 * hang. The mark draws itself in: core first, then the three orbiting nodes,
 * then the ring — VaNi as the head with its agents around it, which is what the
 * console's whole information architecture says anyway.
 */
export function VaniLoader({
  message = 'Loading',
  hint,
  overlay = false,
  className,
}: VaniLoaderProps) {
  return (
    <div
      className={`${overlay ? s.brandOverlay : s.brandInline} ${className || ''}`}
      role="status"
      aria-live="polite"
    >
      <div className={s.dataStream} aria-hidden="true">
        <div className={`${s.packet} ${s.p1}`} />
        <div className={`${s.packet} ${s.p2}`} />
        <div className={`${s.packet} ${s.p3}`} />
        <div className={`${s.packet} ${s.p4}`} />
      </div>

      <div className={s.container}>
        <div className={s.logoFrame}>
          <svg className={s.mark} viewBox="0 0 32 32" aria-hidden="true">
            {/* Core first — it is the head, and it arrives before the agents. */}
            <circle className={s.core} cx="16" cy="16" r="3.2" />
            <circle className={`${s.node} ${s.n1}`} cx="16" cy="5.5" r="2.4" />
            <circle className={`${s.node} ${s.n2}`} cx="25" cy="21.5" r="2.4" />
            <circle className={`${s.node} ${s.n3}`} cx="7" cy="21.5" r="2.4" />
            <line className={`${s.spoke} ${s.s1}`} x1="16" y1="8" x2="16" y2="12.8" />
            <line className={`${s.spoke} ${s.s2}`} x1="23" y1="19.8" x2="18.9" y2="17.6" />
            <line className={`${s.spoke} ${s.s3}`} x1="9" y1="19.8" x2="13.1" y2="17.6" />
            <circle className={s.orbit} cx="16" cy="16" r="12.5" />
          </svg>
          <div className={s.text}>VaNi</div>
        </div>

        <div className={s.status}>
          <span>
            {message}
            <span className={s.dots} />
          </span>
          {hint && <span className={s.hint}>{hint}</span>}
        </div>
      </div>
    </div>
  );
}
