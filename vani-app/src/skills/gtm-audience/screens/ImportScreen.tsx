'use client';
/**
 * /agents/gtm/import — the import, as its own door.
 *
 * The same three pieces station 2 of Build the audience uses, without the
 * pathway around them: the upload → mapping → land box, then every past load
 * with its held rows (a per-field decision, never a silent overwrite) and its
 * failed rows (each with the reason). Landed companies are under Companies,
 * landed people under People; this page is where the LOAD is looked after.
 *
 * What the old import dashboard had and this deliberately does not: demo
 * data (nothing fabricated, rule 9d) and a second copy of the records list.
 */
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import u from '@/platform/shell/ui.module.css';
import s from '../audience.module.css';
import { ImportBox } from './ImportBox';
import { ImportsPanel } from './ImportsPanel';

export default function ImportScreen() {
  const qc = useQueryClient();
  return (
    <div>
      <div className={u.eyebrow}>// GTM · IMPORT A LIST</div>
      <h1 className={u.h1}>Bring what you already have</h1>
      <p className={u.lede}>A spreadsheet of companies — with the people at them, if the file has them. VaNi guesses a field per column; you confirm the mapping; then it lands. A row that would change something you already hold is held for your decision, and a row it cannot take is listed with the reason. Landed companies are under <Link href="/agents/gtm/companies">Companies</Link>, people under <Link href="/agents/gtm/people">People</Link>.</p>
      <div className={s.card}>
        <ImportBox onLanded={() => void qc.invalidateQueries({ queryKey: ['skill'] })} />
        <ImportsPanel />
        <div className={s.actions}>
          <button type="button" className={s.quiet} disabled title="Not built — Settings → Data">Connect my Apollo / Clay</button>
          <span className={s.hint}>Your own data provider is the third road in, after upload and the pool. Not built; tenant-scoped only when it is, never the pool.</span>
        </div>
      </div>
    </div>
  );
}
