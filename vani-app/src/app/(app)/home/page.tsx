'use client';

/**
 * Placeholder home. Exists so the shell and sign-out have somewhere to live in
 * P0. Real surfaces arrive one skill at a time, each with its own endpoints
 * added to the service registry.
 */

import { useAuth } from '@/context/auth-provider';
import styles from './home.module.css';

export default function HomePage() {
  const { user, tenant } = useAuth();

  return (
    <div>
      <div className={styles.eyebrow}>// SESSION</div>
      <h1 className={styles.h1}>
        Welcome back{user?.name ? `, ${user.name}` : ''}.
      </h1>
      <p className={styles.lede}>
        The shell is live and your session survives a reload. Functionality
        transitions from VaNiGTM one skill at a time — nothing moves without its
        API contract moving with it.
      </p>

      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.k}>Signed in as</div>
          <div className={styles.v}>{user?.email ?? '—'}</div>
        </div>
        <div className={styles.card}>
          <div className={styles.k}>Tenant</div>
          <div className={styles.v}>{tenant?.name ?? 'Not bound'}</div>
        </div>
        <div className={styles.card}>
          <div className={styles.k}>Phase</div>
          <div className={styles.v}>P0 · shell &amp; auth</div>
        </div>
      </div>
    </div>
  );
}
