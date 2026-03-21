import { AppSidebar } from '../components/app-sidebar';

export const metadata = {
  title: 'KI-Prime',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          <AppSidebar />
          <main style={{ flex: 1, overflow: 'auto' }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
