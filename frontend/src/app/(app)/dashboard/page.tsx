'use client';

import { useMe } from '@/hooks';
import s from './dashboard-page.module.css';

export default function DashboardPage() {
  const { data: me } = useMe();
  const user = me?.user;
  const tenant = me?.tenant;

  return (
    <div className={s.content}>
      <div className={s.header}>
        <h1 className={s.title}>Dashboard</h1>
        <p className={s.subtitle}>
          Welcome back{user ? `, ${user.name}` : ''}
          {tenant ? ` \u2014 ${tenant.name}` : ''}
        </p>
      </div>

      <div className={s.grid}>
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
          Dashboard panels will render recipe layouts here.
        </p>
      </div>
    </div>
  );
}
