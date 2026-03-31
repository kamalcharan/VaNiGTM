import { ThemeProvider } from '@/config/theme';

export const metadata = {
  title: 'ProessionalKey',
  description: 'Financial Advisory Platform for MFDs',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Fonts loaded via CSS — Google Fonts fetched by browser at runtime */}
        {/* eslint-disable-next-line @next/next/no-css-tags */}
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
      </head>
      <body style={{ margin: 0, padding: 0 }}>
        <ThemeProvider defaultThemeId={process.env.NEXT_PUBLIC_DEFAULT_THEME || 'vikuna-black'}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
