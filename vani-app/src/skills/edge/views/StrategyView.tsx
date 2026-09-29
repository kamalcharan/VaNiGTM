'use client';
/**
 * Chapter 12 — Your Automation Strategy. Reference `strategyView()` and
 * `dispatchCard()` in strategy.js, the download/print handlers in main.js.
 * Print opens the report in a hidden iframe and calls print on it, as the
 * prototype does; download is the same self-contained HTML.
 */
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { useMission } from '../mission/MissionProvider';
import { coverage } from '../mission/pathways';
import { processSVG } from '../mission/svg';
import { renderStrategy } from '../mission/report';
import { failureHTML } from '../mission/failure-report';
import { Intro, Btn } from '../ui';
import { useAnalysis, type AnalysisBundle } from './useAnalysis';

export function useReport() {
  const { m, download } = useMission();
  const html = (b: AnalysisBundle | null) => m.missionType === 'failure'
    ? failureHTML(m)
    : renderStrategy(m, b?.graph ?? null, b?.graph ? processSVG(b.graph, { ...m, variant: '', selectedNode: '' }) : '', b?.analysis ?? null);
  return {
    html,
    downloadReport: (b: AnalysisBundle | null) => download(m.missionType === 'failure' ? 'vani-edge-failure-review.html' : 'vani-edge-automation-strategy.html', html(b), 'text/html'),
    printReport: (b: AnalysisBundle | null) => {
      document.querySelector('#strategy-print')?.remove();
      const frame = document.createElement('iframe');
      frame.title = 'Automation Strategy print preview';
      frame.style.cssText = 'position:fixed;width:1px;height:1px;bottom:0;border:0';
      frame.id = 'strategy-print';
      frame.srcdoc = html(b);
      frame.onload = () => { frame.contentWindow?.focus(); frame.contentWindow?.print(); };
      document.body.append(frame);
    },
  };
}

/** The delivery card — `dispatchCard()`. `noun` is "strategy" or "review". */
export function DispatchCard({ noun = 'strategy' }: { noun?: 'strategy' | 'review' }) {
  const { m, go } = useMission();
  const email = m.respondent.email || m.delivery?.email || '', phone = m.respondent.whatsapp || m.delivery?.whatsapp || '';
  const Noun = noun[0].toUpperCase() + noun.slice(1);
  return (
    <section className="strategy-dispatch" aria-label={`${Noun} delivery`}>
      <div className="dispatch-symbol" aria-hidden="true">✉</div>
      <div>
        <div className="eyebrow">YOUR {noun.toUpperCase()} / AUTOMATIC DISPATCH</div>
        <h2>{email ? `Your ${noun}, ready for your inbox.` : `Add a delivery address for your ${noun}.`}</h2>
        <p>{email ? 'Your delivery details are already recorded. No extra request is needed.' : 'Your download remains available. Add your email in Your perspective to complete the delivery details.'}</p>
        <div className="dispatch-channels">
          <div><strong>Email</strong><span>{email || 'Not provided'}</span><small>{email ? 'Automatic dispatch · preview' : 'Address needed'}</small></div>
          {phone ? <div><strong>WhatsApp</strong><span>{phone}</span><small>Automatic dispatch · preview</small></div> : <div><strong>WhatsApp</strong><span>Not added</span><small>Optional · add in Your perspective</small></div>}
        </div>
        <p className="dispatch-status">UX preview · no email or WhatsApp message has been sent. Live delivery will update this card after dispatch is confirmed.</p>
        <Btn kind="secondary" onClick={() => go(1)}>{email ? 'Edit delivery details' : 'Add delivery details'}</Btn>
      </div>
    </section>
  );
}

export function StrategyView() {
  const { m, go, openModal } = useMission();
  const q = useAnalysis();
  const { downloadReport, printReport } = useReport();
  return (
    <DataBoundary query={q} label="analysis" skeleton={<SkeletonRows rows={4} />}>
      {(b) => {
        const c = coverage(m, b.graph?.variants || []);
        const sample = m.mode === 'sample', analysed = !!b.graph;
        return (
          <>
            <Intro step="YOUR AUTOMATION STRATEGY" title="Your strategy. Your next move." sub="Take the report with you. Use it to align your team, resolve the evidence gaps and define execution." />
            <div className="report-layout">
              <section className="card">
                <span className="tag">{sample ? 'Illustrative strategy · sample evidence' : analysed ? 'Strategy from your registers' : 'Preliminary strategy · evidence validation required'}</span>
                <h2>{m.company} · {m.process.toUpperCase()}</h2>
                <p><strong>Your goal:</strong> {m.goal || m.gains.join(' · ') || 'Agree a measurable outcome with the process owner.'}</p>
                <p>{analysed ? `${c.automate + c.conditional}% of ${sample ? 'sample ' : ''}cases have complete proposed automation handling. ${c.unresolved}% remain unresolved.` : 'Customer pathway coverage is not yet established.'}</p>
                <h3>Your report includes</h3>
                <p>Executive decision · failure history &amp; hypotheses · corrective actions · process maps · pathway handling · {analysed ? 'the findings from the registers · ' : ''}readiness gaps · value assumptions · pilot roadmap · success measures · complete assessment record.</p>
                <div className="strategy-actions"><Btn onClick={() => downloadReport(b)}>Download Automation Strategy</Btn><Btn kind="secondary" onClick={() => printReport(b)}>Print / save as PDF</Btn></div>
                <p className="micro">Download is a self-contained HTML report. Print opens your browser’s PDF option. Your report remains available when agent allowance is exhausted.</p>
              </section>
              <aside className="card">
                <div className="eyebrow">FROM STRATEGY TO EXECUTION</div>
                <h2>Put the agreed scope into practice.</h2>
                <p>Review the strategy with AutomationEdge, resolve the open conditions and agree implementation scope, ownership and investment.</p>
                <Btn onClick={() => openModal('engage')}>Plan execution with AutomationEdge</Btn>
                <p className="micro">Execution is a separate engagement. Agent allowance top-ups fund continued analysis.</p>
              </aside>
            </div>
            <DispatchCard />
            <div className="step-actions"><Btn kind="secondary" onClick={() => go(9)}>Revisit my assessment</Btn><Btn kind="text" onClick={() => go(-1)}>Back to home</Btn></div>
          </>
        );
      }}
    </DataBoundary>
  );
}
