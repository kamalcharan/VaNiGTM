'use client';
/** The failure mission's last two chapters — reference failure.js `verificationView` and `failureReportView`. */
import type { FormEvent } from 'react';
import { useMission } from '../mission/MissionProvider';
import { Intro, Input, Area, Btn } from '../ui';
import { DispatchCard, useReport } from './StrategyView';

export function VerificationView() {
  const { m, update, go } = useMission();
  const f = m.failure, v = f.verification;
  const submit = (ev: FormEvent<HTMLFormElement>) => { ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.currentTarget)) as Record<string, string>; update((x) => { Object.assign(x.failure.verification, d); }); go(11); };
  return (
    <>
      <Intro step="VERIFICATION" title="What would demonstrate that the correction works?" sub="Agree tests and operational approval before calling the incident resolved." />
      <div className="card"><p>{f.actions.filter((a) => a.status === 'Effective').length} of {f.actions.length} actions marked effective by a named reviewer. This does not automatically close the incident.</p></div>
      <form id="failure-verification" className="card" onSubmit={submit}>
        <Area label="Conditions for resuming or expanding the process" name="restart" defaultValue={v.restart || ''} />
        <Input label="Authorised operational decision-maker" name="approver" defaultValue={v.approver || ''} />
        <Area label="Residual risks and unresolved questions" name="risk" defaultValue={v.risk || ''} />
        <Area label="Monitoring period and recurrence triggers" name="monitoring" defaultValue={v.monitoring || ''} />
        <Area label="Estimated correction effort / cost and basis" name="cost" defaultValue={v.cost || ''} />
        <button type="submit" className="btn primary">Save &amp; prepare Failure Review →</button>
      </form>
      <Btn kind="text" onClick={() => go(9)}>← Back</Btn>
    </>
  );
}

export function FailureReportView() {
  const { m, go, openModal, download } = useMission();
  const { downloadReport, printReport } = useReport();
  const f = m.failure;
  return (
    <>
      <Intro step="FAILURE REVIEW & CORRECTIVE ACTION PLAN" title="A clear account. A plan you can verify." sub="Use this review with your team or an implementation partner of your choice." />
      <div className="card">
        <span className="tag">Preliminary · user-recorded investigation</span>
        <h2>{f.incident.title || 'Process failure review'}</h2>
        <p>{f.hypotheses.length} hypotheses · {f.actions.length} corrective actions · {f.actions.filter((a) => a.status !== 'Effective').length} actions not verified effective.</p>
        <p>Customer log analysis and independent cause validation are not connected. Recorded support reflects the named reviewer’s assessment.</p>
        <Btn onClick={() => downloadReport(null)}>Download Failure Review &amp; Corrective Action Plan</Btn>
        <Btn kind="secondary" onClick={() => printReport(null)}>Print / save as PDF</Btn>
        <Btn kind="secondary" onClick={() => download('corrective-action-register.json', JSON.stringify(f.actions, null, 2), 'application/json')}>Export action register</Btn>
      </div>
      <DispatchCard noun="review" />
      <div className="step-actions"><Btn kind="secondary" onClick={() => go(9)}>Return to corrective actions</Btn><Btn kind="secondary" onClick={() => openModal('engage')}>Discuss execution support</Btn><Btn kind="text" onClick={() => go(-1)}>Home</Btn></div>
    </>
  );
}
