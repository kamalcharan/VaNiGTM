'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { NAV_ITEMS, getActiveNavId, type NavItem } from '@/config/nav';
import { useMe, useLogout } from '@/hooks';
import { useToast } from '@/components/toast';
import s from './VdfSidebar.module.css';

export interface VdfSidebarProps {
  /** Override which nav item is active (auto-detected from URL if omitted) */
  activeId?: string;
}

export function VdfSidebar({ activeId }: VdfSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: me } = useMe();
  const logoutMutation = useLogout();
  const { showToast } = useToast();

  const [expanded, setExpanded] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const currentId = activeId || getActiveNavId(pathname);
  const mainItems = NAV_ITEMS.filter((item) => item.section === 'main');
  const dataItems = NAV_ITEMS.filter((item) => item.section === 'data');
  const systemItems = NAV_ITEMS.filter((item) => item.section === 'system');

  const user = me?.user;
  const initials = user?.name
    ? user.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  function navigate(item: NavItem) {
    router.push(item.href);
    setUserMenuOpen(false);
  }

  function handleLogout() {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        showToast({ message: 'Signed out', type: 'success' });
        window.location.href = '/login';
      },
      onError: () => {
        window.location.href = '/login';
      },
    });
  }

  return (
    <aside
      className={`${s.sidebar} ${expanded ? s.expanded : s.collapsed}`}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => { setExpanded(false); setUserMenuOpen(false); }}
    >
      {/* Logo */}
      <div className={s.logoArea} onClick={() => router.push('/dashboard')}>
        <div className={s.logoIcon}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="20" height="20">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        {expanded && <span className={s.logoText}>ProKey</span>}
      </div>

      {/* Main nav items */}
      <nav className={s.nav}>
        {mainItems.map((item) => {
          const active = currentId === item.id;
          return (
            <button
              key={item.id}
              className={`${s.navItem} ${active ? s.navItemActive : ''}`}
              onClick={() => navigate(item)}
              title={expanded ? undefined : item.label}
              aria-label={item.label}
            >
              {active && <div className={s.activeBar} />}
              <span className={s.navIcon}>{item.icon}</span>
              {expanded && <span className={s.navLabel}>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Data & Operations */}
      <div className={s.separator} />
      {expanded && <div className={s.sectionLabel}>Data</div>}
      <div className={s.sectionNav}>
        {dataItems.map((item) => {
          const active = currentId === item.id;
          return (
            <button
              key={item.id}
              className={`${s.navItem} ${active ? s.navItemActive : ''}`}
              onClick={() => navigate(item)}
              title={expanded ? undefined : item.label}
              aria-label={item.label}
            >
              {active && <div className={s.activeBar} />}
              <span className={s.navIcon}>{item.icon}</span>
              {expanded && <span className={s.navLabel}>{item.label}</span>}
            </button>
          );
        })}
      </div>

      {/* System */}
      <div className={s.separator} />
      {expanded && <div className={s.sectionLabel}>System</div>}
      <div className={s.sectionNav}>
        {systemItems.map((item) => {
          const active = currentId === item.id;
          return (
            <button
              key={item.id}
              className={`${s.navItem} ${active ? s.navItemActive : ''}`}
              onClick={() => navigate(item)}
              title={expanded ? undefined : item.label}
              aria-label={item.label}
            >
              {active && <div className={s.activeBar} />}
              <span className={s.navIcon}>{item.icon}</span>
              {expanded && <span className={s.navLabel}>{item.label}</span>}
            </button>
          );
        })}
      </div>

      {/* Spacer */}
      <div className={s.spacer} />

      {/* Environment badge */}
      <div className={s.envBadge} title={expanded ? undefined : 'Development'}>
        <span className={s.envDot} />
        {expanded && <span className={s.envText}>Development</span>}
      </div>

      {/* User card */}
      <div className={s.userArea}>
        <button
          className={s.userBtn}
          onClick={() => setUserMenuOpen(!userMenuOpen)}
          title={expanded ? undefined : user?.name || 'Account'}
        >
          <div className={s.userAvatar}>{initials}</div>
          {expanded && (
            <div className={s.userInfo}>
              <div className={s.userName}>{user?.name || 'User'}</div>
              <div className={s.userEmail}>{user?.email || ''}</div>
            </div>
          )}
          {expanded && (
            <svg className={`${s.chevron} ${userMenuOpen ? s.chevronOpen : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          )}
        </button>

        {/* Dropdown */}
        {userMenuOpen && expanded && (
          <div className={s.userMenu}>
            <button className={s.menuItem} onClick={() => { router.push('/settings'); setUserMenuOpen(false); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4-4v2" /><circle cx="12" cy="7" r="4" /></svg>
              Profile & Settings
            </button>
            <div className={s.menuSep} />
            <button className={s.menuItem} onClick={handleLogout} disabled={logoutMutation.isPending}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
              {logoutMutation.isPending ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
