'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { NAV_ITEMS, getActiveNavId, type NavItem } from '@/config/nav';
import { useMe, useLogout } from '@/hooks';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '@/components/toast';
import { VdfLoader } from '../loader/VdfLoader';
import { VdfModal } from '../modal/VdfModal';
import { VdfButton } from '../button/VdfButton';
import s from './VdfSidebar.module.css';

export interface VdfSidebarProps {
  /** Override which nav item is active (auto-detected from URL if omitted) */
  activeId?: string;
  /** Whether the sidebar is open on mobile (controlled externally) */
  mobileOpen?: boolean;
  /** Called when the mobile sidebar should be closed (tap backdrop or navigate) */
  onMobileClose?: () => void;
}

export function VdfSidebar({ activeId, mobileOpen = false, onMobileClose }: VdfSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: me } = useMe();
  const logoutMutation = useLogout();
  const { showToast } = useToast();
  const { isLive, isAdmin, switchEnv } = useAuth();

  const [expanded, setExpanded] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  /* ── Env switch state ── */
  const [switchTarget, setSwitchTarget] = useState<boolean | null>(null);
  const [switching, setSwitching] = useState(false);

  /* ── Detect mobile viewport ── */
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  /* ── Close sidebar on route change (mobile only) ── */
  useEffect(() => {
    if (isMobile) {
      onMobileClose?.();
      setUserMenuOpen(false);
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Close user menu when mobile sidebar closes ── */
  useEffect(() => {
    if (isMobile && !mobileOpen) setUserMenuOpen(false);
  }, [isMobile, mobileOpen]);

  /* ── Computed expansion state ──
     Desktop: driven by hover. Mobile: driven by mobileOpen prop.
  ── */
  const showExpanded = isMobile ? mobileOpen : expanded;

  const currentId = activeId || getActiveNavId(pathname);
  const visible = (item: NavItem) => !item.adminOnly || isAdmin;
  const mainItems   = NAV_ITEMS.filter((item) => item.section === 'main'   && visible(item));
  const dataItems   = NAV_ITEMS.filter((item) => item.section === 'data'   && visible(item));
  const systemItems = NAV_ITEMS.filter((item) => item.section === 'system' && visible(item));

  const user = me?.user;
  const initials = user?.name
    ? user.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  function navigate(item: NavItem) {
    router.push(item.href);
    setUserMenuOpen(false);
    // On mobile, close immediately for snappier feel (effect also handles this on route change)
    if (isMobile) onMobileClose?.();
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

  async function confirmSwitch() {
    if (switchTarget === null || switching) return;
    setSwitching(true);
    try {
      await switchEnv(switchTarget);
      setSwitchTarget(null);
      router.push('/dashboard');
    } catch {
      showToast({ message: 'Failed to switch environment', type: 'error' });
    } finally {
      setSwitching(false);
    }
  }

  if (logoutMutation.isPending) {
    return <VdfLoader overlay message="Signing out" hint="Ending session securely" />;
  }

  const toTest = switchTarget === false;
  const toLive = switchTarget === true;

  return (
    <>
      {/* ── Mobile backdrop — tap to close ── */}
      {isMobile && mobileOpen && (
        <div className={s.backdrop} onClick={onMobileClose} aria-hidden="true" />
      )}

      <aside
        className={`${s.sidebar} ${showExpanded ? s.expanded : s.collapsed}`}
        onMouseEnter={!isMobile ? () => setExpanded(true)  : undefined}
        onMouseLeave={!isMobile ? () => { setExpanded(false); setUserMenuOpen(false); } : undefined}
      >
        {/* Logo + Env toggle */}
        <div className={s.logoArea} onClick={() => router.push('/dashboard')}>
          <div className={s.logoIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="20" height="20">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          {showExpanded && <span className={s.logoText}>ProKey</span>}
          {showExpanded && (
            <button
              className={`${s.envPill} ${isLive ? s.envPillLive : s.envPillTest}`}
              onClick={e => { e.stopPropagation(); setSwitchTarget(!isLive); }}
              title={`Switch to ${isLive ? 'Test' : 'Live'} mode`}
            >
              <span className={s.envPillDot} />
              {isLive ? 'LIVE' : 'TEST'}
            </button>
          )}
        </div>

        {/* Scrollable nav area */}
        <div className={s.navScroll}>
          {/* Main nav items */}
          <nav className={s.nav}>
            {mainItems.map((item) => {
              const active = currentId === item.id;
              return (
                <button
                  key={item.id}
                  className={`${s.navItem} ${active ? s.navItemActive : ''}`}
                  onClick={() => navigate(item)}
                  title={showExpanded ? undefined : item.label}
                  aria-label={item.label}
                >
                  {active && <div className={s.activeBar} />}
                  <span className={s.navIcon}>{item.icon}</span>
                  {showExpanded && <span className={s.navLabel}>{item.label}</span>}
                </button>
              );
            })}
          </nav>

          {/* Data & Operations */}
          <div className={s.separator} />
          {showExpanded && <div className={s.sectionLabel}>Data</div>}
          <div className={s.sectionNav}>
            {dataItems.map((item) => {
              const active = currentId === item.id;
              return (
                <button
                  key={item.id}
                  className={`${s.navItem} ${active ? s.navItemActive : ''}`}
                  onClick={() => navigate(item)}
                  title={showExpanded ? undefined : item.label}
                  aria-label={item.label}
                >
                  {active && <div className={s.activeBar} />}
                  <span className={s.navIcon}>{item.icon}</span>
                  {showExpanded && <span className={s.navLabel}>{item.label}</span>}
                </button>
              );
            })}
          </div>

          {/* System */}
          <div className={s.separator} />
          {showExpanded && <div className={s.sectionLabel}>System</div>}
          <div className={s.sectionNav}>
            {systemItems.map((item) => {
              const active = currentId === item.id;
              return (
                <button
                  key={item.id}
                  className={`${s.navItem} ${active ? s.navItemActive : ''}`}
                  onClick={() => navigate(item)}
                  title={showExpanded ? undefined : item.label}
                  aria-label={item.label}
                >
                  {active && <div className={s.activeBar} />}
                  <span className={s.navIcon}>{item.icon}</span>
                  {showExpanded && <span className={s.navLabel}>{item.label}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Environment badge */}
        <button
          className={`${s.envBadge} ${isLive ? s.envBadgeLive : s.envBadgeTest}`}
          title={isLive ? 'Live mode — click to switch to Test' : 'Test mode — click to switch to Live'}
          onClick={() => setSwitchTarget(!isLive)}
        >
          <span className={s.envDot} />
          {showExpanded && <span className={s.envText}>{isLive ? 'Live' : 'Test'}</span>}
          {showExpanded && (
            <span className={s.envSwitchHint}>
              → {isLive ? 'Test' : 'Live'}
            </span>
          )}
        </button>

        {/* User card */}
        <div className={s.userArea}>
          <button
            className={s.userBtn}
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            title={showExpanded ? undefined : user?.name || 'Account'}
          >
            <div className={s.userAvatar}>{initials}</div>
            {showExpanded && (
              <div className={s.userInfo}>
                <div className={s.userName}>{user?.name || 'User'}</div>
                <div className={s.userEmail}>{user?.email || ''}</div>
              </div>
            )}
            {showExpanded && (
              <svg className={`${s.chevron} ${userMenuOpen ? s.chevronOpen : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            )}
          </button>

          {/* Dropdown */}
          {userMenuOpen && showExpanded && (
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

      {/* ── Env Switch Confirmation Modal ── */}
      <VdfModal
        isOpen={switchTarget !== null}
        onClose={() => { if (!switching) setSwitchTarget(null); }}
        title={toTest ? 'Switch to Test Mode' : 'Switch to Live Mode'}
        subtitle={toTest
          ? 'Your workspace will switch to the sandbox environment'
          : 'Your workspace will switch to the live environment'}
        width="sm"
        footer={
          <>
            <VdfButton variant="ghost" size="sm" onClick={() => setSwitchTarget(null)} disabled={switching}>
              Cancel
            </VdfButton>
            <VdfButton variant="primary" size="sm" onClick={confirmSwitch} disabled={switching}>
              {switching ? 'Switching…' : `Switch to ${toTest ? 'Test' : 'Live'}`}
            </VdfButton>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {toTest ? (
            <>
              <div style={{ display: 'flex', gap: 12, padding: '12px 14px', background: 'color-mix(in srgb, var(--color-warning) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-warning) 20%, transparent)', borderRadius: 8 }}>
                <span style={{ fontSize: '1.2rem' }}>🧪</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-warning)', marginBottom: 4 }}>Sandbox / Test Mode</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-muted)', lineHeight: 1.5 }}>
                    All data operations — imports, portfolios, transactions — are isolated from your live client records.
                    Use this mode to test imports, verify mappings, and trial workflows without affecting real data.
                  </div>
                </div>
              </div>
              <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: '0.8rem', color: 'var(--color-muted)', lineHeight: 1.7 }}>
                <li>Live client data stays untouched</li>
                <li>Import sessions are sandboxed</li>
                <li>Global scheme data (NAV, schemes) is shared</li>
                <li>Switch back to Live any time</li>
              </ul>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 12, padding: '12px 14px', background: 'color-mix(in srgb, var(--color-success) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-success) 20%, transparent)', borderRadius: 8 }}>
                <span style={{ fontSize: '1.2rem' }}>✅</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-success)', marginBottom: 4 }}>Live Mode</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-muted)', lineHeight: 1.5 }}>
                    You are switching back to your live workspace. All data operations will affect real client records.
                    Ensure your workflows and data are production-ready.
                  </div>
                </div>
              </div>
              <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: '0.8rem', color: 'var(--color-muted)', lineHeight: 1.7 }}>
                <li>Real client data is now active</li>
                <li>Imports affect live portfolios</li>
                <li>All changes are permanent</li>
              </ul>
            </>
          )}
        </div>
      </VdfModal>
    </>
  );
}
