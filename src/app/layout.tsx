import { ThemeProvider } from '@/config/theme';
import { AuthProvider } from '@/context/auth-provider';
import { ShellConfigProvider } from '@/lib/shell-config';
import { ToastProvider } from '@/../components/toast';

export const metadata = {
  title: 'ProessionalKey',
  description: 'Financial Advisory Platform for MFDs',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&family=DM+Sans:wght@300;400;500;700&family=JetBrains+Mono:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, padding: 0, fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
        <ThemeProvider defaultThemeId="vikuna-black">
          <ShellConfigProvider>
            <AuthProvider>
              <ToastProvider>
                {children}
              </ToastProvider>
            </AuthProvider>
          </ShellConfigProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
