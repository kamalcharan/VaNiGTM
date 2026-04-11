'use client';

import { useMe } from '@/hooks';
import { VdfStatCard, type StatAccent } from '@/components/vdf';
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
          { label: 'Total AUM', value: '₹ 12.4 Cr', accent: 'default' as StatAccent },
          { label: 'Active Clients', value: '147', accent: 'success' as StatAccent },
          { label: 'Avg XIRR', value: '18.4%', accent: 'info' as StatAccent },
          { label: 'Pending Actions', value: '5', accent: 'warning' as StatAccent },
        ].map((card) => (
          <VdfStatCard key={card.label} value={card.value} label={card.label} accent={card.accent} />
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
