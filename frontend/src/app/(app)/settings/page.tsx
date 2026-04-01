'use client';

import { useRouter } from 'next/navigation';
import { VdfNavRail } from '@/components/vdf';
import { useLogout } from '@/hooks';
import { useToast } from '@/components/toast';
import SettingsPage from '@/components/settings-page';
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
  const logoutMutation = useLogout();
  const { showToast } = useToast();

  function handleNavigate(id: string) {
    if (id === 'dashboard') router.push('/dashboard');
  }

  function handleLogout() {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        showToast({ message: 'Signed out', type: 'success' });
        window.location.href = '/login';
      },
      onError: () => {
        // Even if backend fails, clear tokens and redirect
        window.location.href = '/login';
      },
    });
  }

  return (
    <div className={s.shell}>
      <VdfNavRail
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
        footer={
          <button
            className={s.logoutBtn}
            onClick={handleLogout}
            title="Sign out"
            aria-label="Sign out"
            disabled={logoutMutation.isPending}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        }
      />
      <main className={s.main}>
        <SettingsPage />
      </main>
    </div>
  );
}
