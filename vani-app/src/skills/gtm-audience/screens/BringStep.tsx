'use client';
/**
 * Station 2 — the hot list, and where it comes from.
 *
 * GTM proposes before the tenant brings anything: the hot list comes from
 * global data (the pool, or a source the platform connects). The tenant's own
 * list adds to it; a row already in the pool becomes one row with both
 * sources, not two. When the pool has never been fed, this screen says so and
 * offers the road that works — it never shows an empty hot list with a
 * spinner over it (rule 12).
 */
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { useAudienceWrites, useHotList } from '../useAudience';
import type { HotList, HotRow } from '../mock-data';
import s from '../audience.module.css';

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
        <div className={s.name}>{r.name}<small>{r.ref} · {r.city} · {r.size} {r.size_unit}</small></div>
        <div className={s.why}>{r.why}</div>
        <div className={s.meta}>
          <span className={`${s.chip} ${r.source === 'pool' ? s.chipPool : s.chipMine}`}>{r.source_label}</span>
          {r.also_mine && <span className={`${s.chip} ${s.chipMine}`}>also on your list</span>}
          <span>fresh · {r.fresh_days === 0 ? 'today' : `${r.fresh_days} days`}</span>
          {!r.has_domain && <span className={`${s.chip} ${s.chipWarn}`}>no domain</span>}
        </div>
      </div>
      {children ?? <span />}
    </div>
  );
}

export function BringStep() {
  const q = useHotList();
  const w = useAudienceWrites();

  return (
    <DataBoundary query={q} label="hot list" skeleton={<SkeletonRows rows={5} lines={2} />}>
      {(d: HotList) => {
        const fed = d.pool_state === 'fed';
        const upload = (
          <div className={s.up}>
            <div className={s.upHead}><b>Add your own list</b><span className={s.hint}>.xlsx / .csv — mapped before anything lands</span></div>
            {d.upload ? (
              <>
                <div className={s.map}>
                  {d.upload.mapping.map((m) => (
                    <div key={m.from} style={{ display: 'contents' }}>
                      <span className={s.mapA}>{m.from}</span><span className={s.mapArr}>→</span>
                      <span className={s.mapB}>{m.to}{m.note ? ` (${m.note})` : ''}</span>
                    </div>
                  ))}
                </div>
                <p className={s.hint} style={{ marginTop: 10 }}>{d.upload.rows} rows · {d.upload.merged} already in the hot list (merged, source kept) · {d.upload.added} new · {d.upload.invalid} invalid</p>
              </>
            ) : (
              <div className={s.actions} style={{ marginTop: 10 }}>
                {/* In the product this is a file input onto the ETL upload route; the mock
                    reads a fixed spreadsheet so the merge can be seen. */}
                <button type="button" className={s.quiet} onClick={() => void w.upload()} disabled={w.busy}>Drop a spreadsheet</button>
                <button type="button" className={s.quiet} disabled title="Not built — Settings → Data">Connect my Apollo / Clay</button>
                <span className={`${s.chip}`}>own provider · not built</span>
              </div>
            )}
          </div>
        );

        if (!fed && !d.rows.length) {
          return (
            <div className={s.card}>
              <div className={s.eyebrow}>// BUILD THE AUDIENCE · 1 OF 4</div>
              <h1 className={s.h}>I have no companies for you yet</h1>
              <p className={s.sub}>The hot list opens from our global data — and for your market it has never been fed. That is the truth today, so it is the screen today: bring a list, or connect a source.</p>
              <div className={s.chips}>{d.sources.map((src) => <SourceChip key={src.id} src={src} />)}</div>
              {upload}
            </div>
          );
        }
        return (
          <div className={s.card}>
            <div className={s.eyebrow}>// BUILD THE AUDIENCE · 1 OF 4</div>
            <h1 className={s.h}>{fed ? `${d.rows.length} hospitals look like your buyer` : `${d.rows.length} hospitals from your list`}</h1>
            <p className={s.sub}>
              {fed ? 'From our global data, matched on your vocabulary and your buyer. Each row says where it came from and how fresh it is.' : 'From your spreadsheet. Nothing from the pool — it has not been fed for your market.'}
              {d.upload && fed ? ' Your list is merged in — where a hospital was already here, it is one row with both sources.' : ''}
            </p>
            <div className={s.chips}>{d.sources.map((src) => <SourceChip key={src.id} src={src} />)}</div>
            <div className={s.list}>{d.rows.map((r) => <RowCard key={r.id} r={r} />)}</div>
            {upload}
            <div className={s.actions}>
              <button type="button" className={s.primary} onClick={() => void w.advance('find')} disabled={w.busy}>Pick who to research →</button>
            </div>
          </div>
        );
      }}
    </DataBoundary>
  );
}
