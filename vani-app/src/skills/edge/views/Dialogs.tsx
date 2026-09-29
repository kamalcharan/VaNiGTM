'use client';
/**
 * The dialogs the chrome opens — reference `modal()` and the bodies built in
 * `main.js` (`memory`, `usage`, `topup`, save & pause, reset, booking, assist,
 * choose-mission). Chapter-owned dialogs (actors, tasks, board nodes, links,
 * mapping, rulebook, failure forms) arrive with their chapters.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { useMission, type ModalId } from '../mission/MissionProvider';
import { createMission, type MissionType, type ProcessId } from '../mission/types';
import { processes } from '../mission/domain';
import { clearSaved, saveMission } from '../mission/store';
import { missionBrief } from '../mission/brief';
import { Btn } from '../ui';
import { AddActorDialog, AssignDialog, TaskDialog, SwitchProcessDialog } from './PeopleDialogs';
import { NodeDialog, LinkDialog } from './BoardDialogs';
import { RulebookDialog } from './RulesView';
import { SampleEvidenceDialog, MappingDialog } from './EvidenceView';
import { HypothesisDialog, ActionDialog } from './FailureViews';

export const BOOKING_URL = 'https://calendly.com/connect-vikuna/30min';

export function Dialogs() {
  const ctx = useMission();
  const { modal, closeModal } = ctx;
  const closeBtn = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);

  useEffect(() => { if (modal) closeBtn.current?.focus(); }, [modal]);

  if (!modal) return null;
  const { title, body } = renderDialog(modal.id, modal.props ?? {}, ctx);

  // Focus stays inside the dialog while it is open (reference keydown handler).
  const onKeyDown = (ev: React.KeyboardEvent) => {
    if (ev.key !== 'Tab' || !dialog.current) return;
    const els = [...dialog.current.querySelectorAll<HTMLElement>('button,input,textarea,select,a,summary')].filter((x) => !(x as HTMLButtonElement).disabled);
    const first = els[0], last = els[els.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last?.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first?.focus(); }
  };

  return (
    <div id="overlay">
      <div className="overlay">
        <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" ref={dialog} onKeyDown={onKeyDown}>
          <div className="dialog-head">
            <h2 id="dialog-title">{title}</h2>
            <button type="button" className="close" onClick={closeModal} aria-label="Close dialog" ref={closeBtn}>×</button>
          </div>
          {body}
        </section>
      </div>
    </div>
  );
}

export function BookingContent({ hasAssessment }: { hasAssessment: boolean }) {
  const { m, download } = useMission();
  const p = processes[m.process];
  return (
    <>
      <span className="tag">30-MINUTE PROCESS REVIEW</span>
      <p>Choose a time with the Vikuna team to discuss your automation priorities and a practical next step.</p>
      {hasAssessment && <div className="notice"><strong>{p.name}</strong><br />{p.opportunity}<br />Bring your brief so we can review the opportunity, controls and open questions together.</div>}
      <a className="btn primary" href={BOOKING_URL} target="_blank" rel="noopener noreferrer">Choose a time on Calendly ↗</a>
      {hasAssessment && <Btn kind="secondary" onClick={() => download('vani-edge-decision-brief.txt', missionBrief(m))}>Download my review brief ↓</Btn>}
      <p className="micro">Calendly opens in a new tab. Confirm your booking there. Your assessment and files are not sent automatically.</p>
    </>
  );
}

function renderDialog(id: ModalId, props: Record<string, unknown>, ctx: ReturnType<typeof useMission>): { title: ReactNode; body: ReactNode } {
  const { m, stage, update, replace, go, closeModal, toast, download, openModal } = ctx;
  const downloadBrief = () => download('vani-edge-decision-brief.txt', missionBrief(m));

  switch (id) {
    case 'memory':
      return { title: 'Your mission, so far', body: (
        <>
          <div className="summary-list">
            <div><dt>Business</dt><dd>{m.company}</dd></div>
            <div><dt>Respondent</dt><dd>{m.respondent.name || 'To confirm'} · {m.respondent.designation}</dd></div>
            <div><dt>Goal</dt><dd>{m.goal || m.gains.join(' · ') || 'To confirm'}</dd></div>
            <div><dt>Priority pain</dt><dd>{m.priority || m.pains.join(' · ') || 'To confirm'}</dd></div>
            <div><dt>Process</dt><dd>{m.board.length} activities · {m.links.length} connections</dd></div>
            <div><dt>Rules</dt><dd>{Object.values(m.rules).filter(Boolean).length} captured</dd></div>
            <div><dt>Open contributions</dt><dd>{m.tasks.filter((t) => t.status !== 'Resolved').length}</dd></div>
            <div><dt>Evidence</dt><dd>{m.mode === 'sample' ? 'Labelled sample' : m.files.length + ' file summaries'} · {m.evidenceConfirmed ? 'boundary confirmed' : 'mapping pending'}</dd></div>
          </div>
          <Btn onClick={downloadBrief}>Download complete mission brief ↓</Btn>
          <Btn kind="text" onClick={() => openModal('reset-confirm')}>Start a new mission</Btn>
        </>
      ) };

    case 'usage': {
      const u = m.usage;
      return { title: 'Keep the investigation moving', body: (
        <>
          <span className="tag">ACTIVE AGENT / TOP-UP UX PREVIEW</span>
          <p>Activation payment happens before this mission. Here you manage the allowance for continuing the work.</p>
          <div className="segmented">
            {([['available', 'Available'], ['low', 'Running low'], ['exhausted', 'Exhausted']] as const).map(([k, label]) => (
              <Btn key={k} kind={u === k ? 'selected' : ''} onClick={() => update((d) => { d.usage = k; })}>{label}</Btn>
            ))}
          </div>
          <div className="card">
            <h3>{u === 'exhausted' ? 'Your work is safe. Add allowance to continue.' : u === 'low' ? 'A little allowance remains.' : 'Your agent is ready to continue.'}</h3>
            <p>{u === 'exhausted' ? 'New analysis would pause here. Completed findings, the process board and your brief stay accessible.' : u === 'low' ? 'Show an early notice before a substantial new analysis. The user decides whether to top up.' : 'The mission continues from the last confirmed checkpoint.'}</p>
            <details><summary>Token allowance example</summary><p>{u === 'exhausted' ? '200,000' : u === 'low' ? '180,000' : '64,000'} of 200,000 tokens. Illustrative only; no provider usage is measured.</p></details>
          </div>
          <Btn onClick={() => openModal('topup')}>Top up &amp; continue</Btn>
          <p className="micro">Preview states do not consume tokens, collect payment or block access to your work.</p>
        </>
      ) };
    }

    case 'topup':
      return { title: 'Top up & continue', body: (
        <>
          <span className="tag">SIMULATED TOP-UP</span>
          <p>In the live agent, you would see the token quantity and price before purchasing. After confirmation, the agent resumes the same investigation.</p>
          <div className="notice">No price has been set and no payment is collected in this UX.</div>
          <Btn onClick={() => { update((d) => { d.usage = 'available'; d.topup = true; }); closeModal(); toast('Preview top-up complete. Your mission stays at the same point.'); }}>Simulate top-up &amp; resume</Btn>
        </>
      ) };

    case 'save-exit':
      return { title: 'Pause without losing the thread', body: (
        <>
          <p>Save answers, the board and file summaries on this device. Raw files are not stored and may need reattachment. You can also download the complete brief.</p>
          <Btn onClick={() => {
            const next = structuredClone(m); next.storage = true;
            if (saveMission(next)) { replace(next); closeModal(); go(-1); toast('Saved. Resume from your last chapter.'); }
            else toast('This browser could not save. Download your brief before leaving.');
          }}>Save on this device &amp; pause</Btn>
          <Btn kind="secondary" onClick={downloadBrief}>Download my brief</Btn>
          <p className="micro">Local storage is visible to people using this browser profile. Team sync is not connected.</p>
        </>
      ) };

    case 'reset-confirm':
      return { title: 'Start a new mission?', body: (
        <>
          <p>This clears the saved mission on this device. Download your brief before continuing if you want to retain it.</p>
          <Btn kind="secondary" onClick={downloadBrief}>Download brief</Btn>
          <Btn onClick={() => { clearSaved(); replace(createMission()); closeModal(); go(-1); }}>Clear &amp; start again</Btn>
        </>
      ) };

    case 'engage':
      return { title: 'Book your process review', body: <BookingContent hasAssessment={stage >= 0} /> };

    case 'assist':
      return { title: `Work through ${String(props.topic || 'this step')} together`, body: (
        <>
          <p>Bring this specific question to your review. Your full mission brief contains the context, open contributions and evidence gaps.</p>
          <BookingContent hasAssessment />
        </>
      ) };

    case 'choose-mission': {
      const type = props.id as MissionType;
      return { title: 'Start a different mission?', body: (
        <>
          <p>This starts a separate investigation in this preview. Download your current record first if you want to retain it.</p>
          <Btn kind="secondary" onClick={downloadBrief}>Download current record</Btn>
          <Btn onClick={() => {
            const next = createMission();
            Object.assign(next, { company: m.company, industry: m.industry, locations: m.locations, respondent: { ...m.respondent }, missionType: type, storage: m.storage });
            clearSaved(); replace(next); closeModal(); go(0);
          }}>Start new mission</Btn>
        </>
      ) };
    }

    case 'add-actor':
      return { title: 'Who else is involved?', body: <AddActorDialog /> };
    case 'assign':
      return { title: 'Ask the right person', body: <AssignDialog topic={props.topic as string | undefined} person={props.person as string | undefined} /> };
    case 'task': {
      const t = m.tasks.find((x) => x.id === props.id);
      return { title: 'Contribution: ' + (t?.assignee ?? ''), body: <TaskDialog id={String(props.id)} /> };
    }
    case 'switch-process':
      return { title: 'Change the process?', body: <SwitchProcessDialog id={props.id as ProcessId} /> };

    case 'node':
      return { title: props.id ? 'Describe this activity' : 'Add to the process', body: <NodeDialog id={props.id as string | undefined} /> };
    case 'link':
      return { title: 'Connect the work', body: <LinkDialog /> };
    case 'rules-review':
      return { title: 'Review your rulebook', body: <RulebookDialog /> };
    case 'sample-evidence':
      return { title: 'Explore sample evidence separately', body: <SampleEvidenceDialog /> };
    case 'mapping':
      return { title: 'Confirm the evidence boundary', body: <MappingDialog /> };

    case 'failure-hypothesis':
      return { title: props.id ? 'Review hypothesis' : 'Examine a possible cause', body: <HypothesisDialog id={props.id as string | undefined} /> };
    case 'failure-action':
      return { title: props.id ? 'Review corrective action' : 'Plan a corrective action', body: <ActionDialog id={props.id as string | undefined} hypothesis={props.hypothesis as string | undefined} /> };

    default:
      return { title: 'Not built yet', body: <p>This dialog lands with its chapter.</p> };
  }
}
