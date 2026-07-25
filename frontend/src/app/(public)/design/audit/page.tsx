'use client';

/** /design/audit — digital audit report + AEO visibility (POA 1.2). Synthetic data. */

import { DesignShell, Panel } from '../DesignShell';
import { VdfScoreRing, VdfVisibilityMatrix } from '@/components/vdf';
import s from './audit.module.css';

const ENGINES = ['ChatGPT', 'Perplexity', 'Gemini', 'AI Overviews'];

const MATRIX = [
  { label: '“best revenue attribution for SaaS”', cells: ['partial', 'strong', 'absent', 'partial'] as const },
  { label: '“connect ad spend to CRM revenue”', cells: ['absent', 'partial', 'absent', 'absent'] as const },
  { label: '“marketing attribution without data team”', cells: ['strong', 'strong', 'partial', 'partial'] as const },
  { label: '“Solstice Metrics alternatives”', cells: ['partial', 'absent', 'absent', 'absent'] as const },
];

const FIXES = [
  { title: 'Publish a comparison page vs Northbeam', impact: 'High', why: 'Engines cite comparison content for “alternatives” queries — you are absent on 3 of 4.' },
  { title: 'Add structured FAQ to the attribution guide', impact: 'High', why: 'The guide already ranks; FAQ schema makes it quotable by answer engines.' },
  { title: 'Fix meta descriptions on 12 blog posts', impact: 'Medium', why: 'Current ones are truncated; engines fall back to first-paragraph scraping.' },
  { title: 'Claim the unclaimed review-site listing', impact: 'Medium', why: 'Perplexity cites it today with outdated pricing.' },
];

export default function AuditDesignPage() {
  return (
    <DesignShell
      path="/design/audit"
      eyebrow="Digital Audit"
      title="How the machines see you"
      lede="Auditor agent crawls your presence, scores it, and turns gaps into a fix list — because your next buyer asks an AI before they ask you."
    >
      <Panel label="Presence scores">
        <div className={s.ringRow}>
          <VdfScoreRing value={78} label="Website" size={104} />
          <VdfScoreRing value={64} label="AEO visibility" size={104} />
          <VdfScoreRing value={55} label="Content depth" size={104} />
          <VdfScoreRing value={82} label="Technical SEO" size={104} />
          <VdfScoreRing value={38} label="Review presence" size={104} />
        </div>
      </Panel>

      <Panel label="AEO — where you appear in AI answers">
        <VdfVisibilityMatrix
          columns={[...ENGINES]}
          rows={MATRIX.map((r) => ({ label: r.label, cells: [...r.cells] }))}
        />
      </Panel>

      <Panel label="Fix list — ordered by impact">
        <ol className={s.fixList}>
          {FIXES.map((f) => (
            <li key={f.title} className={s.fixRow}>
              <div className={s.fixMain}>
                <span className={s.fixTitle}>{f.title}</span>
                <span className={s.fixWhy}>{f.why}</span>
              </div>
              <span className={`${s.impact} ${f.impact === 'High' ? s.impactHigh : ''}`}>{f.impact}</span>
            </li>
          ))}
        </ol>
      </Panel>
    </DesignShell>
  );
}
