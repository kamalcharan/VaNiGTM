/**
 * The public landing keeps the ORIGINAL VaNi theme — the signature orange on
 * ink, dark — whatever theme the product itself is on (Charan, 2026-09-29:
 * "keep vani.vikuna.io landing page with VaNi theme").
 *
 * Pinned by attribute on this subtree, not by writing to <html>: the tokens
 * are custom properties keyed on `[data-theme][data-mode]` (ThemeScript), so
 * they cascade from here down and the console behind /login is untouched.
 * The wrapper paints its own background because `body`'s comes from the
 * document's theme, not this one.
 */
import type { ReactNode } from 'react';
import { SiteProviders } from '@/site/SiteProviders';

const LANDING_THEME = { theme: 'vani', mode: 'dark' } as const;

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div
      data-theme={LANDING_THEME.theme}
      data-mode={LANDING_THEME.mode}
      style={{ background: 'var(--bg)', color: 'var(--tx)', fontFamily: 'var(--sans)', minHeight: '100vh', colorScheme: LANDING_THEME.mode }}
    >
      <SiteProviders>{children}</SiteProviders>
    </div>
  );
}
