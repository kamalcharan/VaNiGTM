import { ThemeProvider } from '@/config/theme';

export const metadata = {
  title: 'ProessionalKey',
  description: 'Financial Advisory Platform for MFDs',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>
        <ThemeProvider defaultThemeId="vikuna-black">
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
