'use client';
/**
 * Pieces the enrichment screens share (prototype p2c-pool-enrich.html): the
 * pool by level as one stacked bar with its legend, a level badge, and the
 * by-part before → after bars.
 */
import sc from '@/skills/scoring/scoring.module.css';
import { LEVEL_LABEL, LEVELS, type Level } from '@/skills/scoring/useScoring';
import e from '../enrich.module.css';
import { fmt, type Levels, type Snapshot } from '../useEnrich';

export function LevelStack({ levels, style }: { levels: Levels | null | undefined; style?: React.CSSProperties }) {
  const total = LEVELS.reduce((n, l) => n + (levels?.[l] ?? 0), 0);
  return (
    <div className={sc.stack} style={style} aria-hidden>
      {total > 0 && LEVELS.map((l) => <i key={l} className={sc[`s_${l}`]} style={{ width: `${((levels?.[l] ?? 0) / total) * 100}%` }} />)}
    </div>
  );
}

export function LevelLegend({ levels }: { levels: Levels | null | undefined }) {
  return (
    <div className={sc.legend} style={{ marginTop: 8 }}>
      {LEVELS.map((l) => <span key={l}><b className={sc[`s_${l}`]} />{LEVEL_LABEL[l]} {fmt(levels?.[l] ?? 0)}</span>)}
    </div>
  );
}

export function LevelBadge({ level }: { level: string | null | undefined }) {
  const l = (LEVELS as string[]).includes(level ?? '') ? (level as Level) : 'raw';
  const deep = LEVELS.indexOf(l) >= 3;
  return <span className={`${e.lvl} ${sc[`s_${l}`]}`} style={{ color: deep ? 'var(--surf)' : 'var(--tx)' }}>{LEVEL_LABEL[l]}</span>;
}

/** "Before" and "Now"/"After" as stacked bars, each with its average. */
export function BeforeAfter({ before, after, afterLabel }: { before: Snapshot | null; after: Snapshot | null; afterLabel: string }) {
  return (
    <>
      <div className={e.part}><span>Before</span><LevelStack levels={before?.levels} style={{ margin: 0 }} /><span>avg {fmt(before?.avg)}</span></div>
      <div className={e.part}><span>{afterLabel}</span><LevelStack levels={after?.levels} style={{ margin: 0 }} /><span>avg {fmt(after?.avg)}</span></div>
      <LevelLegend levels={after?.levels ?? before?.levels} />
    </>
  );
}

const PART_LABEL: Record<string, string> = { identity: 'Identity', firmographics: 'Firmographics', digital: 'Digital presence', contact: 'Contact points' };

export function PartsBeforeAfter({ before, after }: { before: Snapshot | null; after: Snapshot | null }) {
  return (
    <>
      {Object.keys(PART_LABEL).map((p) => {
        const w = Math.max(after?.weights?.[p] ?? 0, before?.weights?.[p] ?? 0) || 1;
        const b = before?.parts?.[p] ?? 0;
        const a = after?.parts?.[p] ?? b;
        return (
          <div key={p} className={e.part}>
            <span>{PART_LABEL[p]}</span>
            <div className={e.pb}><em style={{ width: `${Math.min(100, (b / w) * 100)}%` }} /><span style={{ width: `${Math.min(100, (a / w) * 100)}%` }} /></div>
            <span>{Math.round(b)} → {Math.round(a)}</span>
          </div>
        );
      })}
      <p className={e.muted} style={{ marginTop: 8 }}>People, research and signals are earned in a tenant&apos;s own copy.</p>
    </>
  );
}
