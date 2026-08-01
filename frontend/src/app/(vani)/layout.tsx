/**
 * VaNi AI — route group layout.
 *
 * Deliberately minimal. Three things only:
 *   1. Loads Inter (the blueprint's body font). Outfit is already loaded by
 *      the app's root layout, so it isn't requested twice — only Inter is
 *      added, and only here, never in the shared root <head>.
 *   2. Nothing else — the blueprint's design tokens live in
 *      vani-tokens.module.css and are applied by each page via the
 *      .vaniRoot wrapper class, so they stay scoped to VaNi's subtree
 *      rather than becoming global CSS.
 *   3. Wraps children. No VDF components, no VdfAtmosphere/Particles/Noise
 *      (those belong to the GTM app's (public) group, not the blueprint),
 *      no theme opt-out needed — the app's --color-* variables and the
 *      blueprint's tokens have no name in common.
 *
 * The app's root layout still wraps this (QueryProvider / ThemeProvider /
 * AuthProvider / ToastProvider). That's harmless here: none of the public
 * assessment pages call useAuth or useTheme, and the providers cost nothing
 * unused. The console (later phase) will actually want AuthProvider.
 */

export const metadata = {
  title: 'VaNi AI',
  description: 'AI business assessments by Vikuna Technologies',
};

export default function VaniLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap"
      />
      {children}
    </>
  );
}
