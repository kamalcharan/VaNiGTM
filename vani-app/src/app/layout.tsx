import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/context/auth-provider';
import { ToastProvider } from '@/platform/feedback';
import { BrandFonts } from './fonts';
import { ThemeScript } from '@/config/theme/ThemeScript';
import { ThemeProvider } from '@/context/theme-provider';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'VaNi',
  description: 'VaNi — the Vikuna AI platform.',
  // Internal platform: keep it out of search results.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // ThemeScript sets data-theme and data-mode on <html> BEFORE hydration —
    // that is the point, it is what stops the flash. The server render cannot
    // know which theme the person chose, so those two attributes legitimately
    // differ and React must be told not to warn. Scoped to <html> alone: it
    // suppresses nothing inside the app.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Same three faces, same source as vikuna.io — one brand across both.
            The stylesheet itself is injected AFTER mount (see fonts.tsx): a
            parser-blocking link to a third-party CDN froze the embedded Vara
            widget wherever that CDN hangs. Preconnects are free and stay. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Every theme × mode as a rule, plus the two-attribute boot that
            picks one BEFORE the first paint. Without it the console paints the
            default and swaps, which is the flash that makes a themed app feel
            broken. */}
        <ThemeScript />
      </head>
      <body>
        <BrandFonts />
        {/* Toasts wrap auth too: a failed sign-in is exactly the kind of
            outcome that must never be silent. */}
        <ToastProvider>
          {/* Theme sits INSIDE auth — it reads the person's stored preference
              from /auth/me — and inside toasts, because a save that fails has
              to say so rather than look like it worked. */}
          <AuthProvider>
            <ThemeProvider>{children}</ThemeProvider>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
