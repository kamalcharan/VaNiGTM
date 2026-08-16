import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/context/auth-provider';
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
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
