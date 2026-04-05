import { ThemeProvider, ThemeScript, ThemeInitClient, buildThemeMap } from '@/config/theme';
import { AuthProvider } from '@/context/auth-provider';
import { ShellConfigProvider } from '@/lib/shell-config';
import { QueryProvider } from '@/lib/query-provider';
import { ToastProvider } from '@/components/toast';

const DEFAULT_THEME = process.env.NEXT_PUBLIC_DEFAULT_THEME || 'vikuna-black';
const DEFAULT_MODE = (process.env.NEXT_PUBLIC_DEFAULT_COLOR_MODE || 'dark') as 'light' | 'dark';
const THEME_MAP = buildThemeMap();

export const metadata = {
  title: 'ProKey',
  description: 'Financial Advisory Platform for MFDs',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
        />
        <style dangerouslySetInnerHTML={{ __html: `
          :root {
            --font-display: 'Playfair Display', Georgia, serif;
            --font-body: 'DM Sans', system-ui, sans-serif;
            --font-mono: 'JetBrains Mono', monospace;
          }
        `}} />
        {/* SSR fallback — default theme CSS variables, renders immediately */}
        <ThemeScript defaultThemeId={DEFAULT_THEME} defaultColorMode={DEFAULT_MODE} />
      </head>
      <body style={{ margin: 0, padding: 0, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        {/* Applies saved theme from localStorage after hydration */}
        <ThemeInitClient themeMap={THEME_MAP} defaultThemeId={DEFAULT_THEME} defaultColorMode={DEFAULT_MODE} />
        <QueryProvider>
          <ThemeProvider defaultThemeId={DEFAULT_THEME}>
            <ShellConfigProvider>
              <AuthProvider>
                <ToastProvider>
                  {children}
                </ToastProvider>
              </AuthProvider>
            </ShellConfigProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
