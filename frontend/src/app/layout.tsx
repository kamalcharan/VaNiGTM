import { ThemeProvider, ThemeScript } from '@/config/theme';
import { AuthProvider } from '@/context/auth-provider';
import { ShellConfigProvider } from '@/lib/shell-config';
import { ToastProvider } from '@/components/toast';

const DEFAULT_THEME = process.env.NEXT_PUBLIC_DEFAULT_THEME || 'vikuna-black';
const DEFAULT_MODE = (process.env.NEXT_PUBLIC_DEFAULT_COLOR_MODE || 'dark') as 'light' | 'dark';

export const metadata = {
  title: 'ProessionalKey',
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
        {/* Blocking theme injection — applies CSS variables BEFORE first paint */}
        <ThemeScript defaultThemeId={DEFAULT_THEME} defaultColorMode={DEFAULT_MODE} />
      </head>
      <body style={{ margin: 0, padding: 0, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <ThemeProvider defaultThemeId={DEFAULT_THEME}>
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
