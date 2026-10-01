'use client';
/**
 * Vikuna's own graph, as a static snapshot — the landing never reads a
 * tenant's data at runtime. The file is exported once from connect@vikuna.io's
 * knowledge graph (VaNiGTM documents/design-notes-landing.md F5). Until it
 * has been exported it holds no nodes, and this section is not drawn at all:
 * no stand-in graph.
 *
 * Once the visitor has a graph of their own, this steps back behind a toggle.
 */
import { useState } from 'react';
import snapshot from './vikuna-graph-snapshot.json';
import type { SiteGraph } from './funnel';
import { GraphPreview } from './GraphPreview';
import { useSiteRead } from './SiteState';
import s from './landing.module.css';

const SNAPSHOT = snapshot as SiteGraph & { exported_at: string | null };

export function hasSnapshot(): boolean { return SNAPSHOT.nodes.length > 0; }

export function SampleGraph() {
  const { read } = useSiteRead();
  const [open, setOpen] = useState(false);
  if (!hasSnapshot()) return null;
  const collapsed = read.hasGraph && !open;
  return (
    <section className={s.section} id="sample">
      <div className={s.inner}>
        <div className={s.block}>
          <div className={s.blockEyebrow}>Vikuna’s own graph, built by VaNi</div>
          <h3 className={s.blockTitle}>{read.hasGraph ? 'Compare with Vikuna’s graph' : 'This is what VaNi knows about us'}</h3>
          {!read.hasGraph && <p className={s.blockBody}>You can see yours when you enter your website at the top.</p>}
          {collapsed
            ? <button type="button" className={s.btnGhost} onClick={() => setOpen(true)}>Show Vikuna’s graph</button>
            : <GraphPreview graph={SNAPSHOT} />}
        </div>
      </div>
    </section>
  );
}
