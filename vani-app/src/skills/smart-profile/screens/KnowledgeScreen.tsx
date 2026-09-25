'use client';
/**
 * /smart-profile/knowledge — the BRAIN's memory, checkable.
 *
 * Two halves. What VaNi has READ: the sources, with status and yield, and the
 * door to add more (the same section the Smart Profile shows). What VaNi
 * KNOWS: every node in the graph, grouped by kind, each with the source it
 * was read from — so "what did it learn from my site, and is it right" has
 * an answer a person can scan.
 *
 * A list, not a graph explorer. Nothing here is editable on purpose: the
 * profile sections are the typed, human-confirmed projection of this, and
 * that is where a wrong fact gets corrected. What is wrong here gets fixed by
 * teaching VaNi the right thing, which re-extracts and re-scores.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { formatDate } from '@/lib/format';
import u from '@/platform/shell/ui.module.css';
import s from '../smart-profile.module.css';
import k from '../knowledge.module.css';
import { KnowledgeSection } from './KnowledgeSection';
import { FailoverQueue } from './FailoverQueue';
import { KIND_LABELS, isReading, useKnowledgeGraph, useSourcesRead, type Knowledge, type KgNode } from '../useKnowledge';

const kind = (l: string) => KIND_LABELS[l] ?? l;

export default function KnowledgeScreen() {
  const [label, setLabel] = useState<string | null>(null);
  const sources = useSourcesRead();
  const reading = !!sources.data?.data?.some(isReading);
  const q = useKnowledgeGraph(label, reading);
  // The moment the last source finishes, read the graph once more — the
  // entries it yielded are the whole point of having waited.
  const wasReading = useRef(false);
  const refetch = q.refetch;
  useEffect(() => { if (wasReading.current && !reading) void refetch(); wasReading.current = reading; }, [reading, refetch]);
  const labels = q.data?.data?.labels ?? [];
  const total = q.data?.data?.total ?? 0;

  return (
    <div className={s.page}>
      <header className={s.head}>
        <div>
          <div className={s.eyebrow}>// SMART PROFILE · KNOWLEDGE</div>
          <h1 className={s.title}>What VaNi knows</h1>
          <p className={s.lede}>Every source it has read, and everything it learned from them — by kind, with where it was read. The <Link href="/smart-profile">Smart Profile</Link> is the confirmed version of this; correct a wrong fact there, or teach VaNi the right thing here and it re-reads.</p>
        </div>
      </header>

      <KnowledgeSection compact />

      <FailoverQueue signal={(sources.data?.data ?? []).map((x) => `${x.id}:${x.status}`).join(',')} />

      <section className={s.section}>
        <header className={s.sectionHead}>
          <div className={s.sectionTitles}>
            <h2 className={s.sectionTitle}>What it learned</h2>
            <p className={s.sectionWhat}>{total ? `${total} ${total === 1 ? 'entry' : 'entries'} across ${labels.length} ${labels.length === 1 ? 'kind' : 'kinds'}.` : 'Nothing yet.'} Each entry names the source it came from; one with no source came from the conversation.</p>
          </div>
        </header>
        <div className={s.sectionBody}>
          {labels.length > 0 && (
            <div className={k.kinds} role="group" aria-label="Kind">
              <button type="button" className={`${u.tag} ${label === null ? u.tagOk : u.tagDim}`} aria-pressed={label === null} onClick={() => setLabel(null)}>All · {total}</button>
              {labels.map((l) => (
                <button key={l.label} type="button" className={`${u.tag} ${label === l.label ? u.tagOk : u.tagDim}`} aria-pressed={label === l.label} onClick={() => setLabel(l.label)}>{kind(l.label)} · {l.count}</button>
              ))}
            </div>
          )}
          <DataBoundary query={q} label="entries" skeleton={<SkeletonRows rows={5} lines={2} />}
            isEmpty={(d: Knowledge | undefined) => !d?.nodes?.length}
            empty={label ? 'Nothing of that kind yet.' : 'VaNi has learned nothing yet. Teach it above — point it at your website, or paste what you have — and what it reads lands here, by kind.'}>
            {(d: Knowledge) => {
              const groups = [...new Set(d.nodes.map((n) => n.label))];
              return (
                <div className={k.groups}>
                  {groups.map((g) => (
                    <div key={g} className={k.group}>
                      <div className={k.groupHead}>{kind(g)}<span className={k.groupMeta}>{g} · {d.nodes.filter((n) => n.label === g).length}</span></div>
                      <ul className={k.nodes}>
                        {d.nodes.filter((n) => n.label === g).map((n: KgNode) => (
                          <li key={n.id} className={k.node}>
                            <div className={k.nodeName}>{n.name}</div>
                            {n.description && <div className={k.nodeDesc}>{n.description}</div>}
                            <div className={k.nodeMeta}>
                              {n.source_name ? <span title={n.source_type ?? ''}>read from {n.source_name}</span> : <span>from the conversation</span>}
                              <span>· {formatDate(n.updated_at)}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              );
            }}
          </DataBoundary>
        </div>
      </section>
    </div>
  );
}
