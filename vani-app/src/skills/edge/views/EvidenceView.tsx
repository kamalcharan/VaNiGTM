'use client';
/**
 * Chapter 7 — Evidence workspace. Reference `evidenceView()` /
 * `mappingView()` in views-evidence.js, the file `change` handler and the
 * template download in main.js, and `evidenceInstructions()` in failure.js.
 *
 * Files are inspected in the browser only (CSV headers, row count, uneven
 * rows) and never uploaded — the same boundary the prototype states. The
 * P2P sample CSVs are served from /edge/data.
 */
import { useRef, type ChangeEvent } from 'react';
import { useMission } from '../mission/MissionProvider';
import { packs } from '../mission/domain';
import { parseCSV } from '../mission/model';
import { Intro, Btn, Status, Help } from '../ui';
import { useFlow } from './flow';

export function EvidenceView() {
  const { m, update, toast, download, openModal } = useMission();
  const { back } = useFlow();
  const p = packs[m.process];

  const attach = async (ev: ChangeEvent<HTMLInputElement>, kind: string) => {
    const file = ev.currentTarget.files?.[0];
    if (!file) return;
    let summary: Record<string, unknown> = {};
    try {
      if (file.size > 10 * 1024 * 1024) throw Error('File exceeds the 10 MB preview limit.');
      if (/\.csv$/i.test(file.name)) summary = parseCSV(await file.text());
      else summary = { document: true };
    } catch (err) { summary = { error: (err as Error).message }; }
    update((x) => { x.files = x.files.filter((f) => f.kind !== kind); x.files.push({ kind, name: file.name, ...summary }); x.evidenceConfirmed = false; });
    toast('File received. Review its preparation status.');
  };

  const template = async (id: string) => {
    const f = p.files.find((x) => x[0] === id)!;
    if (m.process === 'p2p' && ['ap', 'po', 'grn', 'vendor'].includes(id)) {
      const r = await fetch(`/edge/data/p2p-${id}-sample.csv`);
      if (r.ok) download(`p2p-${id}-sample.csv`, await r.text(), 'text/csv');
      else toast('Sample unavailable.');
    } else {
      download(`${m.process}-${id}-guide.txt`, `${f[1]}\nWhere: ${f[3]}\nInclude: ${f[2]}\nPurpose: ${f[4]}\n\nUse consistent dates and stable identifiers. This is a preparation guide, not a sample of your own data.`);
    }
  };

  return (
    <>
      {m.missionType === 'failure' && <EvidenceInstructions />}
      <Intro step="EVIDENCE WORKSPACE" title="The right records for the questions we’re asking." sub="Export and attach files yourself. Each request explains what to provide, where to find it and what we can learn." />
      <div className="notice"><strong>Why these files?</strong> {m.priority || m.pains[0] || 'Understanding the selected process'} is the current focus. {m.goal || 'We’ll connect the records to your process and agree what remains unknown.'}</div>
      <div className="segmented">
        <Btn kind={m.mode === 'own' ? 'selected' : ''} onClick={() => update((x) => { x.mode = 'own'; x.evidenceConfirmed = false; })}>My process evidence</Btn>
        <Btn kind={m.mode === 'sample' ? 'selected' : ''} onClick={() => openModal('sample-evidence')}>Use sample evidence for this preview</Btn>
      </div>
      {m.mode === 'sample' && (
        <div className="source-banner"><Status>{m.process === 'p2p' ? 'Meridian sample · original mission data' : 'O2C demonstration · invented data'}</Status><span>No customer records are represented in these observations.</span></div>
      )}
      <div className="evidence-grid">
        {p.files.map(([id, title, fields, source, why, formats]) => {
          const f = m.files.find((x) => x.kind === id);
          return (
            <section key={id} className="card evidence-request">
              <div className="section-heading"><h3>{title}</h3><Status>{id === 'ap' || id === 'po' ? 'Start here' : 'Adds context'}</Status></div>
              <p>{why}</p>
              <dl><dt>Where to look</dt><dd>{source}</dd><dt>What to include</dt><dd>{fields}</dd><dt>File types</dt><dd>{formats.toUpperCase().replaceAll(',', ' · ')}</dd></dl>
              <div className="evidence-actions">
                <label className="btn secondary file-picker">Attach file<input type="file" accept={formats.split(',').map((v) => '.' + v).join(',')} aria-label={`Attach ${title}`} onChange={(ev) => attach(ev, id)} /></label>
                <Btn kind="text" onClick={() => template(id)}>Example / template ↓</Btn>
              </div>
              {f && (
                <div className="file-summary">
                  <strong>{f.name}</strong>
                  <p>{f.error ? f.error : f.rows ? `${f.rows.toLocaleString()} rows · ${f.headers?.length} columns · ${f.inconsistent} uneven rows` : 'Document received for preparation; extraction is not connected.'}</p>
                  {f.needsReattach && <small>Reattach to read contents again. Only the summary was saved.</small>}
                  <Btn kind="text" onClick={() => update((x) => { x.files = x.files.filter((y) => y.kind !== id); x.evidenceConfirmed = false; })}>Remove</Btn>
                </div>
              )}
            </section>
          );
        })}
      </div>
      <div className="card">
        <h3>Understand what the evidence can support.</h3>
        <p>Use a consistent period, such as the last three months. Keep stable identifiers so records can be linked. Invoice documents describe transactions; activity timestamps are needed to reconstruct sequence and waiting time.</p>
        <p className="micro">Preview: CSV headers and row counts are checked locally. Spreadsheet/document extraction and customer-data mining are not connected. Sample evidence opens the full reference investigation separately.</p>
      </div>
      <Help topic="preparing evidence" onAssist={(t) => openModal('assist', { topic: t })} />
      <div className="step-actions">
        <Btn kind="text" onClick={back}>← Back</Btn>
        <Btn onClick={() => openModal('mapping')}>Review evidence &amp; mapping →</Btn>
      </div>
    </>
  );
}

/** Failure mission, chapter 7: what a failure investigation needs. */
function EvidenceInstructions() {
  return (
    <div className="card">
      <h2>Evidence for a failure investigation</h2>
      <div className="summary-columns">
        <div><h3>Affected cases</h3><p>Transaction exports, timestamps, workflow/payment logs, retry records, approvals and affected case IDs.</p></div>
        <div><h3>Comparison and context</h3><p>Successful cases from the same period, configuration versions, change history and participant accounts.</p></div>
      </div>
      <p>Keep original records. Use approval-history uploads for CSV event logs and documents for supporting evidence. File summaries alone do not establish a cause.</p>
    </div>
  );
}

export function SampleEvidenceDialog() {
  const { m, update, closeModal } = useMission();
  return (
    <>
      <p>{m.process === 'p2p' ? 'Use the original mission’s Meridian reference data to explore the complete process investigation.' : 'Use an explicitly invented O2C scenario to explore the interaction.'}</p>
      <p>Your own attachments remain listed. The explorer and readiness will be marked as sample observations and will not claim to analyse those attachments.</p>
      <Btn onClick={() => { update((x) => { x.mode = 'sample'; x.evidenceConfirmed = false; }); closeModal(); }}>Use labelled sample evidence</Btn>
    </>
  );
}

export function MappingDialog() {
  const { m, update, closeModal, go } = useMission();
  const note = useRef<HTMLTextAreaElement>(null);
  const mapping: [string, string][] = m.mode === 'sample' && m.process === 'p2p'
    ? [['Invoice received', 'AP register → Received On'], ['Invoice approved', 'AP register → Approved On'], ['Payment released', 'AP register → Paid On'], ['Goods received', 'GRN register → Goods Received On'], ['Receipt recorded', 'GRN register → GRN Posted On']]
    : [];
  return (
    <>
      <p>Confirm what these fields mean before interpreting a process. Mappings below are {m.mode === 'sample' ? 'part of the labelled demonstration' : 'preparation only; no customer events are generated'}.</p>
      {mapping.length ? (
        <table className="evidence-table"><thead><tr><th>Activity</th><th>Source field</th></tr></thead><tbody>{mapping.map((r) => <tr key={r[0]}><td>{r[0]}</td><td>{r[1]}</td></tr>)}</tbody></table>
      ) : m.files.length ? m.files.map((f) => <div key={f.kind} className="notice"><strong>{f.name}</strong><p>{f.headers?.join(' · ') || 'Document contents not extracted'}</p></div>)
        : <div className="notice">No records attached. Continue with an evidence-gap assessment, or return to attach files.</div>}
      <label className="field">Anything to clarify about dates, identifiers or meaning?<textarea id="mapping-note" rows={3} ref={note} defaultValue={m.mapping.note || ''} /></label>
      <p className="micro">Missing history limits which pathways can be observed. The absence of an event is not proof that the activity never happened.</p>
      <Btn onClick={() => { const v = note.current?.value ?? ''; update((x) => { x.mapping.note = v; x.evidenceConfirmed = true; }); closeModal(); go(7); }}>Confirm the evidence boundary →</Btn>
    </>
  );
}
