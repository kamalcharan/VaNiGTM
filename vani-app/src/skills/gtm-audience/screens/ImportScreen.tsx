'use client';
/**
 * /agents/gtm/import — the import, as its own door.
 *
 * The whole wizard the retired /import page had: what the data is to you,
 * upload, what VaNi found, the delivery's date and tags, the mapping with a
 * preview, landing, and the results. Below it, every past load with its held
 * rows (a per-field decision, never a silent overwrite) and its failed rows,
 * each with the reason. Row-by-row review of a load — every state, edit and
 * retry, clear staging — is the Imports dashboard.
 */
import Link from 'next/link';
import u from '@/platform/shell/ui.module.css';
import { ImportWizard } from './ImportWizard';
import { ImportsPanel } from './ImportsPanel';

export default function ImportScreen() {
  return (
    <div>
      <div className={u.eyebrow}>// GTM · IMPORT A LIST</div>
      <h1 className={u.h1}>Bring what you already have</h1>
      <p className={u.lede}>A spreadsheet of companies — with the people at them, if the file has them. Say what the data is to you, VaNi reads the columns and says what it found, you confirm the mapping, and it lands. A row that would change something you already hold is held for your decision. Landed companies are under <Link href="/agents/gtm/companies">Companies</Link>, people under <Link href="/agents/gtm/people">People</Link>, and every load row by row under <Link href="/agents/gtm/imports">Imports</Link>.</p>
      <ImportWizard />
      <div style={{ marginTop: 22 }}><ImportsPanel /></div>
    </div>
  );
}
