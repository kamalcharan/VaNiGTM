'use client';
/**
 * The one Settings page: eyebrow, title, tab strip, then whichever tab's
 * screen the route resolved. Tabs are real routes (Links, not state) so a
 * tab is bookmarkable and the old /appearance and /model-provider URLs can
 * redirect straight into one.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import u from '@/platform/shell/ui.module.css';
import s from './settings.module.css';
import { SETTINGS_TABS } from '../tabs';

export function SettingsFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  return (
    <div>
      <div className={u.eyebrow}>// SYSTEM</div>
      <h1 className={u.h1}>Settings</h1>
      <nav className={s.tabs} aria-label="Settings sections">
        {SETTINGS_TABS.map((t) => {
          const on = pathname === t.href || pathname.startsWith(t.href + '/');
          return (
            <Link
              key={t.id}
              href={t.href}
              className={t.status === 'planned' ? `${s.tab} ${s.tabSoon}` : s.tab}
              aria-current={on ? 'page' : undefined}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
