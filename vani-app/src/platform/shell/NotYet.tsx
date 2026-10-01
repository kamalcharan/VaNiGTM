import Link from 'next/link';
import type { SkillRoute } from '@/platform/registry';
import u from './ui.module.css';

/**
 * The honest not-yet state. VaNiGTM's /today already ships "coming soon" tiles
 * rather than pretending, and that habit is kept: a planned destination appears
 * in the nav, says what it will be, and does not fake a screen.
 */
export function NotYet({ route }: { route: SkillRoute }) {
  return (
    <div className={u.notYet}>
      <span className={u.notYetBadge}>Not built yet</span>
      <h1 className={u.h1}>{route.label}</h1>
      {route.summary && <p className={u.lede}>{route.summary}</p>}
      <Link href="/dashboard" className={u.cardMeta} style={{ color: 'var(--ac)' }}>
        ← Back to dashboard
      </Link>
    </div>
  );
}
