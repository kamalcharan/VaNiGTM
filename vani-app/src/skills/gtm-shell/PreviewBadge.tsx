'use client';
/**
 * Says, on screen, that what is shown came from fixtures. Rendered wherever a
 * previewed function feeds the screen and the transport is live — the honest
 * half of lib/preview.ts. In mock mode everything is fixtures, so it says
 * nothing there.
 */
import { IS_LIVE } from '@/lib/live-transport';
import s from './gtm-shell.module.css';

export function PreviewBadge({ what = 'GTM' }: { what?: string }) {
  if (!IS_LIVE) return null;
  return (
    <span className={s.preview} title="These screens run on fixtures until their backend functions are integrated. lib/preview.ts lists them.">
      Preview data · {what} is not wired to the API yet
    </span>
  );
}
