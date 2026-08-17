import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/context/auth-provider';
import { ToastProvider } from '@/platform/feedback';
import { BrandFonts } from './fonts';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'VaNi',
  description: 'VaNi — the Vikuna AI platform.',
  // Internal platform: keep it out of search results.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Same three faces, same source as vikuna.io — one brand across both.
            The stylesheet itself is injected AFTER mount (see fonts.tsx): a
            parser-blocking link to a third-party CDN froze the embedded Vara
            widget wherever that CDN hangs. Preconnects are free and stay. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <BrandFonts />
        {/* Toasts wrap auth too: a failed sign-in is exactly the kind of
            outcome that must never be silent. */}
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
