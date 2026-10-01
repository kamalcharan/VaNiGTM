/**
 * A Settings tab that is declared but not built. It says what it will be and
 * what does not exist behind it — the same honesty the console's NotYet
 * screen keeps, inside the tab frame instead of replacing it.
 */
import { notFound } from 'next/navigation';
import u from '@/platform/shell/ui.module.css';
import s from './settings.module.css';
import { SETTINGS_TABS } from '../tabs';

export function PlannedTab({ id }: { id: string }) {
  const tab = SETTINGS_TABS.find((t) => t.id === id);
  if (!tab) notFound();
  return (
    <div className={u.notYet}>
      <span className={u.notYetBadge}>Not built yet</span>
      <h2 className={s.h2}>{tab.label}</h2>
      {tab.summary && <p className={u.lede}>{tab.summary}</p>}
    </div>
  );
}
