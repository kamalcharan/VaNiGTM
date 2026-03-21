import { AppSidebar } from '../components/app-sidebar';
import { ShellConfigProvider } from '../components/shell-config-provider';
import shellConfig from '../../shell.config';

export const metadata = {
  title: shellConfig.product.name,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <ShellConfigProvider config={shellConfig}>
          <div style={{ display: 'flex', minHeight: '100vh' }}>
            <AppSidebar />
            <main style={{ flex: 1, overflow: 'auto' }}>
              {children}
            </main>
          </div>
        </ShellConfigProvider>
      </body>
    </html>
  );
}
