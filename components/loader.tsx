'use client';

import s from './loader.module.css';

/* ── Types ───────────────────────────────────────────── */

type LoaderSize = 'sm' | 'md' | 'lg';

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

function Spinner({ size = 'md' }: { size?: LoaderSize }) {
  return (
    <div className={`${s.spinner} ${s[size]}`} role="status" aria-label="Loading">
      <div className={s.ring} />
    </div>
  );
}

/* ── Full Page Loader ────────────────────────────────── */

export function FullPageLoader({
  size = 'lg',
  message,
  overlay = true,
}: FullPageLoaderProps) {
  return (
    <div className={`${s.fullPage} ${overlay ? s.overlay : ''}`}>
      <div className={s.fullPageContent}>
        <Spinner size={size} />
        {message && <p className={s.message}>{message}</p>}
      </div>
    </div>
  );
}

/* ── Inline Loader ───────────────────────────────────── */

export function InlineLoader({ size = 'sm', message }: InlineLoaderProps) {
  return (
    <span className={s.inline}>
      <Spinner size={size} />
      {message && <span className={s.inlineMessage}>{message}</span>}
    </span>
  );
}
