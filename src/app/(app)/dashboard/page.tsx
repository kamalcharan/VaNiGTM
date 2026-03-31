'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-provider';
import { NavRail } from '@/../components/vdf';
import s from './dashboard-page.module.css';

const NAV_ITEMS = [
  { id: 'dashboard', icon: <span>&#x25C8;</span>, label: 'Dashboard' },
  { id: 'clients', icon: <span>&#x2B21;</span>, label: 'Clients' },
  { id: 'portfolio', icon: <span>&#x25CB;</span>, label: 'Portfolio' },
  { id: 'market', icon: <span>&#x2606;</span>, label: 'Market' },
  { id: 'settings', icon: <span>&#x2699;</span>, label: 'Settings' },
];

export default function DashboardPage() {
  const { user, tenant, logout } = useAuth();
  const router = useRouter();

  function handleNavigate(id: string) {
    if (id === 'settings') {
      router.push('/settings');
    }
  }

  return (
    <div className={s.shell}>
      <NavRail
        items={NAV_ITEMS}
        activeId="dashboard"
        onNavigate={handleNavigate}
        logo={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        }
        footer={
          <button className={s.logoutBtn} onClick={logout} title="Sign out">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        }
      />

      <main className={s.main}>
        <div className={s.header}>
          <div>
            <h1 className={s.title}>Dashboard</h1>
            <p className={s.subtitle}>
              Welcome back{user ? `, ${user.name}` : ''}
              {tenant ? ` — ${tenant.name}` : ''}
            </p>
          </div>
        </div>

        <div className={s.grid}>
          {/* Placeholder cards */}
          {[
            { label: 'Total AUM', value: '\u20B9 12.4 Cr', accent: 'primary' },
            { label: 'Active Clients', value: '147', accent: 'success' },
            { label: 'Avg XIRR', value: '18.4%', accent: 'info' },
            { label: 'Pending Actions', value: '5', accent: 'warning' },
          ].map((card) => (
            <div key={card.label} className={s.statCard}>
              <span className={s.statLabel}>{card.label}</span>
              <span className={`${s.statValue} ${s[card.accent]}`}>{card.value}</span>
            </div>
          ))}
        </div>

        <div className={s.placeholder}>
          <p className={s.placeholderText}>
            Dashboard panels will be built here. Navigate to Settings via the nav rail to see the full settings page.
          </p>
        </div>
      </main>
    </div>
  );
}
