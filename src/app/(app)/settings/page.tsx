'use client';

import { useRouter } from 'next/navigation';
import { NavRail } from '@/../components/vdf';
import SettingsPage from '@/../frontend/src/components/settings-page';
import s from './settings-route.module.css';

const NAV_ITEMS = [
  { id: 'dashboard', icon: <span>&#x25C8;</span>, label: 'Dashboard' },
  { id: 'clients', icon: <span>&#x2B21;</span>, label: 'Clients' },
  { id: 'portfolio', icon: <span>&#x25CB;</span>, label: 'Portfolio' },
  { id: 'market', icon: <span>&#x2606;</span>, label: 'Market' },
  { id: 'settings', icon: <span>&#x2699;</span>, label: 'Settings' },
];

export default function SettingsRoute() {
  const router = useRouter();

  function handleNavigate(id: string) {
    if (id === 'dashboard') {
      router.push('/dashboard');
    }
  }

  return (
    <div className={s.shell}>
      <NavRail
        items={NAV_ITEMS}
        activeId="settings"
        onNavigate={handleNavigate}
        logo={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        }
      />
      <main className={s.main}>
        <SettingsPage />
      </main>
    </div>
  );
}
