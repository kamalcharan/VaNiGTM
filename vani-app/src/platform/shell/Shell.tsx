'use client';

/**
 * The app shell. Renders navigation entirely from the skill registry — there is
 * no hardcoded destination list here, which is what makes the zero-platform-
 * change test meaningful: adding a skill must not touch this file.
 *
 * Responsive behaviour is taken from VaNiGTM's app shell (sidebar rail, mobile
 * header, bottom tab bar), which the Org OS prototype lacks — the prototype is
 * desktop-only and the product is not.
 */

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { buildNav, type SkillModule } from '@/platform/registry';
import s from './shell.module.css';

/** Destinations on the mobile tab bar, in order. Falls back to the first four. */
const MOBILE_TABS = ['/dashboard', '/agents', '/runs', '/settings'];

export function Shell({
  skills,
  org,
  slug,
  onSignOut,
  children,
}: {
  skills: SkillModule[];
  org: string;
  slug: string;
  onSignOut?: () => void;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? '';
  const [open, setOpen] = useState(false);
  const groups = buildNav(skills);
  const all = groups.flatMap((g) => g.routes);

  const current = all.find((r) => pathname === r.href || pathname.startsWith(r.href + '/'));
  const tabs = MOBILE_TABS.map((h) => all.find((r) => r.href === h)).filter(
    (r): r is NonNullable<typeof r> => !!r,
  );

  return (
    <div className={s.shell}>
      <header className={s.mobHeader}>
        <button
          type="button"
          className={s.burger}
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
        >
          ☰
        </button>
        <span className={s.mobTitle}>{current?.label ?? 'VaNi'}</span>
        <span className={s.mobEnv}>ap-south-1</span>
      </header>

      {open && (
        <button
          type="button"
          className={s.scrim}
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}

      <nav className={`${s.side} ${open ? s.sideOpen : ''}`} aria-label="Main">
        <div className={s.logo}>
          <span className={s.logomark}>V</span>
          VaNi <span className={s.logoDim}>Org OS</span>
        </div>

        <div className={s.orgpick}>
          <span className={s.av}>{org.slice(0, 1).toUpperCase()}</span>
          <div style={{ minWidth: 0 }}>
            <div className={s.orgName}>{org}</div>
            <div className={s.orgSlug}>org://{slug}</div>
          </div>
        </div>

        {groups.map((g) => (
          <div key={g.id}>
            <div className={s.grpLabel}>{g.label}</div>
            {g.routes.map((r) => {
              const on = pathname === r.href || pathname.startsWith(r.href + '/');
              return (
                <Link
                  key={r.id}
                  href={r.href}
                  className={`${s.nv} ${on ? s.nvOn : ''}`}
                  onClick={() => setOpen(false)}
                  aria-current={on ? 'page' : undefined}
                >
                  <span className={s.ic} aria-hidden="true">
                    {r.icon}
                  </span>
                  {r.label}
                  {r.badge ? (
                    <span className={s.bdg}>{r.badge}</span>
                  ) : r.status === 'planned' ? (
                    <span className={s.soonDot} title="Not built yet" />
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}

        <div className={s.sideFoot}>
          <div className={s.envCard}>
            <span className={s.pill}>
              <i className={s.dot} />
              VPC
            </span>
            <div className={s.envMeta}>ap-south-1 · BYO model key</div>
          </div>
          {onSignOut && (
            <button type="button" className={s.signout} onClick={onSignOut}>
              <span className={s.ic} aria-hidden="true">
                ⏻
              </span>
              Sign out
            </button>
          )}
        </div>
      </nav>

      <main className={s.main}>{children}</main>

      <nav className={s.bottomNav} aria-label="Primary">
        {tabs.map((r) => {
          const on = pathname === r.href || pathname.startsWith(r.href + '/');
          return (
            <Link key={r.id} href={r.href} className={`${s.tab} ${on ? s.tabOn : ''}`}>
              <span className={s.tabIc} aria-hidden="true">
                {r.icon}
              </span>
              {r.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
