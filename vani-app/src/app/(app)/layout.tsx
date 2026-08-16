'use client';

/**
 * Authenticated shell. Waits for the bootstrap refresh to settle before
 * deciding anything — redirecting while `isLoading` is true would throw a
 * signed-in user back to /login on every reload.
 *
 * This is a client-side guard for UX, not a security boundary. The API rejects
 * unauthenticated calls on its own; nothing here is trusted by the backend.
 */

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-provider';
import styles from './shell.module.css';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, user, tenant, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/login');
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className={styles.booting}>
        <span>Restoring session…</span>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <div className={styles.left}>
          <span className={styles.brand}>VaNi</span>
          {tenant && <span className={styles.tenant}>{tenant.name}</span>}
        </div>
        <div className={styles.right}>
          {user && <span className={styles.who}>{user.email}</span>}
          <button type="button" className={styles.logout} onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
