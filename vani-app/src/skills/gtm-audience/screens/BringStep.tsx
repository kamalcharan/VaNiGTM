'use client';
/**
 * Station 2 — the hot list, and where it comes from.
 *
 * GTM proposes before the tenant brings anything: the hot list comes from
 * global data (the pool, or a source the platform connects). The tenant's own
 * list adds to it through the real ETL — upload, a mapping the human
 * confirms, land — and lands in gt_prospects, which is what the rows here
 * are read from. When nothing has been fed the screen says so and offers the
 * road that works; it never shows an empty hot list with a spinner (rule 12).
 */
import Link from 'next/link';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { useAudienceWrites, useHotList } from '../useAudience';
import type { HotList, HotRow } from '../mock-data';
import s from '../audience.module.css';
import { ImportsPanel } from './ImportsPanel';
import { ImportWizard } from './ImportWizard';

function SourceChip({ src }: { src: HotList['sources'][number] }) {
  const cls = src.state === 'connected' ? (src.id === 'mine' ? s.chipMine : s.chipPool) : src.state === 'not_connected' && src.id === 'pool' ? s.chipBad : '';
  const text = src.state === 'connected' ? `${src.label} · ${src.rows} rows` : src.state === 'not_built' ? `${src.label} · not built` : `${src.label} · not yet fed`;
  return <span className={`${s.chip} ${cls}`}>{text}</span>;
}

export function RowCard({ r, children, onTick, on, off }: { r: HotRow; children?: React.ReactNode; onTick?: () => void; on?: boolean; off?: boolean }) {
  return (
    <div className={`${s.row} ${onTick ? '' : s.rowNoTick} ${on ? s.rowOn : ''} ${off ? s.rowOff : ''}`}>
      {onTick && <button type="button" className={s.tick} aria-pressed={!!on} onClick={onTick} disabled={!r.has_domain} title={r.has_domain ? undefined : 'No domain — cannot be researched'}>✓</button>}
      <div>
        <div className={s.name}>{r.name}<small>{r.ref}{r.city ? ` · ${r.city}` : ''}{r.size_label ? ` · ${r.size_label}` : ''}</small></div>
        <div className={s.why}>{r.why}</div>
        <div className={s.meta}>
          <span className={`${s.chip} ${r.source === 'pool' ? s.chipPool : s.chipMine}`}>{r.source_label}</span>
          {r.also_mine && <span className={`${s.chip} ${s.chipMine}`}>also on your list</span>}
          {r.fresh_label && <span>fresh · {r.fresh_label}</span>}
          {r.duplicate && <span className={`${s.chip} ${s.chipWarn}`}>possible duplicate</span>}
          {!r.has_domain && <span className={`${s.chip} ${s.chipWarn}`}>no domain</span>}
          {r.research_status && <span className={`${s.chip} ${s.chipPool}`}>research · {r.research_status}</span>}
        </div>
      </div>
      {children ?? <span />}
    </div>
  );
}

export function BringStep() {
  const q = useHotList();
  const w = useAudienceWrites();
  // The import is NOT inside the hot-list boundary: a hot list that cannot be
  // read must not hide the one road that adds to it. The boundary reports its
  // own failure above; the import box stays usable below it.
  const importBox = <><div className={s.up}><div className={s.upHead}><b>Add your own list</b><span className={s.hint}>the same import as <Link href="/agents/gtm/import">Import a list</Link>, in place</span></div><div style={{ marginTop: 12 }}><ImportWizard onLanded={() => void q.refetch()} /></div></div><ImportsPanel /><p className={s.hint} style={{ marginTop: 10 }}>Every load row by row — what landed, what was held, what failed — is under <Link href="/agents/gtm/imports">Imports</Link>.</p></>;
  return (
    <div className={s.card}>
      <div className={s.eyebrow}>// BUILD THE AUDIENCE · 1 OF 4</div>
      <DataBoundary query={q} label="hot list" skeleton={<SkeletonRows rows={5} lines={2} />}>
        {(d: HotList) => {
          const fed = d.pool_state === 'fed';
          const mine = d.rows.filter((r) => r.source === 'mine').length;
          if (!d.rows.length) {
            return (
              <>
                <h1 className={s.h}>I have no companies for you yet</h1>
                <p className={s.sub}>The hot list opens from our global data — and for your market it has never been fed. That is the truth today, so it is the screen today: bring a list, or connect a source.</p>
                <div className={s.chips}>{d.sources.map((src) => <SourceChip key={src.id} src={src} />)}</div>
              </>
            );
          }
          return (
            <>
              <h1 className={s.h}>{fed ? `${d.rows.length} companies look like your buyer` : `${d.rows.length} companies from your list`}</h1>
              <p className={s.sub}>
                {fed ? 'From our global data, matched on your vocabulary and your buyer, with your own list merged in. Each row says where it came from and how fresh it is.' : 'From what you brought. Nothing from the pool — it has not been fed for your market.'}
                {mine && fed ? ' Where a company was already here, it is one row with both sources.' : ''}
                {' '}Every row is also under <Link href="/agents/gtm/companies">Companies</Link>.
              </p>
              <div className={s.chips}>{d.sources.map((src) => <SourceChip key={src.id} src={src} />)}</div>
              <div className={s.list}>{d.rows.map((r) => <RowCard key={r.id} r={r}><Link href={`/agents/gtm/companies/${encodeURIComponent(r.ref)}`} className={s.side}>open →</Link></RowCard>)}</div>
              <div className={s.actions}>
                <button type="button" className={s.primary} onClick={() => void w.advance('find')} disabled={w.busy}>Pick who to research →</button>
              </div>
            </>
          );
        }}
      </DataBoundary>
      {importBox}
    </div>
  );
}
