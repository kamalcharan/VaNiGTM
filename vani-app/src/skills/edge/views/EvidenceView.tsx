'use client';
/**
 * Chapter 7 — Evidence workspace. Reference `evidenceView()` /
 * `mappingView()` in views-evidence.js and `evidenceInstructions()` in
 * failure.js — with the engine behind it (Charan, 2026-09-29: "all the data
 * from here should be based on the xls").
 *
 * Attaching a register parses it in the browser and reports which of the
 * expected columns it carries; nothing is uploaded. Confirming the evidence
 * boundary runs the rulebook over the attached registers (own mode) or the
 * four samples (sample mode) and keeps the result on the mission. A missing
 * required register or column stops the confirmation and says why.
 */
import { useRef, useState, type ChangeEvent } from 'react';
import { InlineLoader } from '@/platform/feedback';
import { useMission } from '../mission/MissionProvider';
import { packs } from '../mission/domain';
import { parseTable } from '../engine/csv';
import { SCHEMA, reportColumns, readiness, type FileKind } from '../engine/schema';
import { setTable, dropTable, ownTables, sampleTables, columnReports, runAnalysis } from '../engine/files';
import { Intro, Btn, Status, Help } from '../ui';
import { useFlow } from './flow';

const isKind = (id: string): id is FileKind => id === 'ap' || id === 'po' || id === 'grn' || id === 'vendor';

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
      if (/\.csv$/i.test(file.name)) {
        const table = parseTable(await file.text());
        summary = { headers: table.headers, rows: table.rows.length, inconsistent: table.inconsistent };
        if (m.process === 'p2p' && isKind(kind)) {
          setTable(kind, table);
          const rep = reportColumns(kind, table);
          summary.columns = { found: rep.found, missing: rep.missing, missingRequired: rep.missingRequired };
        }
      } else summary = { document: true };
    } catch (err) { summary = { error: (err as Error).message }; }
    update((x) => { x.files = x.files.filter((f) => f.kind !== kind); x.files.push({ kind, name: file.name, ...summary }); x.evidenceConfirmed = false; x.analysis = null; x.analysisSource = undefined; });
    toast('File received. Review its preparation status.');
  };

  const remove = (kind: string) => {
    if (isKind(kind)) dropTable(kind);
    update((x) => { x.files = x.files.filter((y) => y.kind !== kind); x.evidenceConfirmed = false; x.analysis = null; x.analysisSource = undefined; });
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
        <div className="source-banner"><Status>{m.process === 'p2p' ? 'Meridian sample · original mission data' : 'O2C demonstration · invented data'}</Status><span>{m.process === 'p2p' ? 'The four sample registers are analysed by the same engine as your own files.' : 'No customer records are represented in these observations.'}</span></div>
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
                  <p>{f.error ? f.error : f.rows ? `${f.rows.toLocaleString('en-IN')} rows · ${f.headers?.length} columns · ${f.inconsistent} uneven rows` : 'Document received for preparation; extraction is not connected.'}</p>
                  {f.columns && (f.columns.missingRequired.length
                    ? <p className="micro">Missing required columns: {f.columns.missingRequired.join(', ')}. Use the template’s headings.</p>
                    : <p className="micro">{f.columns.found.length} of {f.columns.found.length + f.columns.missing.length} expected columns found{f.columns.missing.length ? ` · not carried: ${f.columns.missing.join(', ')}` : ''}.</p>)}
                  {f.needsReattach && <small>Reattach to read contents again. Only the summary was saved.</small>}
                  <Btn kind="text" onClick={() => remove(id)}>Remove</Btn>
                </div>
              )}
            </section>
          );
        })}
      </div>
      <div className="card">
        <h3>Understand what the evidence can support.</h3>
        <p>Use a consistent period, such as the last three months. Keep stable identifiers so records can be linked. Invoice documents describe transactions; activity timestamps are needed to reconstruct sequence and waiting time.</p>
        <p className="micro">CSV registers are parsed and analysed in this browser; nothing is uploaded. Spreadsheet (.xlsx) and document extraction are not connected — export to CSV with the template’s headings. Raw files are not saved: after a reload, reattach them to analyse again.</p>
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
      <p>{m.process === 'p2p' ? 'Use the original mission’s Meridian reference registers — four CSV files, analysed by the same engine as your own — to explore the complete process investigation.' : 'Use an explicitly invented O2C scenario to explore the interaction.'}</p>
      <p>Your own attachments remain listed. The explorer and readiness will be marked as sample observations and will not claim to analyse those attachments.</p>
      <Btn onClick={() => { update((x) => { x.mode = 'sample'; x.evidenceConfirmed = false; x.analysis = null; x.analysisSource = undefined; }); closeModal(); }}>Use labelled sample evidence</Btn>
    </>
  );
}

/** The evidence boundary: which activity comes from which column, and the run itself. */
export function MappingDialog() {
  const { m, update, closeModal, go, toast } = useMission();
  const note = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const p2p = m.process === 'p2p';
  const tables = p2p && m.mode === 'own' ? ownTables() : null;
  const reports = tables ? columnReports(tables) : null;
  const ready = reports ? readiness(reports) : { ok: true, reasons: [] as string[] };
  const kinds: FileKind[] = ['po', 'grn', 'ap'];

  const confirm = async () => {
    const v = note.current?.value ?? '';
    if (!p2p) { update((x) => { x.mapping.note = v; x.evidenceConfirmed = true; }); closeModal(); go(7); return; }
    setBusy(true); setProblem(null);
    try {
      const a = runAnalysis(m.mode === 'sample' ? await sampleTables() : ownTables());
      update((x) => { x.mapping.note = v; x.evidenceConfirmed = true; x.analysis = a; x.analysisSource = x.mode; });
      toast(`Analysed ${a.graph.invoices.toLocaleString('en-IN')} invoices · ${a.graph.distinctVariants} pathways.`);
      closeModal(); go(7);
    } catch (err) {
      setProblem((err as Error).message);
      toast('The registers could not be analysed.');
    } finally { setBusy(false); }
  };

  return (
    <>
      <p>Confirm what these fields mean before interpreting a process. {m.mode === 'sample' ? 'The sample registers carry every column below.' : p2p ? 'Each activity is read from the column shown; a missing register leaves its activities out of the pathways.' : 'Mappings below are preparation only; no customer events are generated.'}</p>
      {p2p ? (
        <table className="evidence-table">
          <thead><tr><th>Activity</th><th>Source field</th></tr></thead>
          <tbody>
            {kinds.flatMap((k) => SCHEMA[k].columns.filter((c) => c.event).map((c) => {
              const rep = reports?.[k];
              const state = !reports ? 'ok' : !rep?.provided ? 'absent' : rep.found.includes(c.name) ? 'ok' : 'missing';
              return <tr key={k + c.name}><td>{c.event}</td><td>{SCHEMA[k].name} → {c.name}{state === 'absent' ? ' · register not attached' : state === 'missing' ? ' · column not found' : ''}</td></tr>;
            }))}
          </tbody>
        </table>
      ) : m.files.length ? m.files.map((f) => <div key={f.kind} className="notice"><strong>{f.name}</strong><p>{f.headers?.join(' · ') || 'Document contents not extracted'}</p></div>)
        : <div className="notice">No records attached. Continue with an evidence-gap assessment, or return to attach files.</div>}
      {!ready.ok && <div className="notice"><strong>The analysis cannot run yet.</strong><p>{ready.reasons.join('. ')}. Attach the register with the template’s headings, or switch to the sample evidence.</p></div>}
      {problem && <div className="notice"><strong>The analysis stopped.</strong><p>{problem}</p></div>}
      <label className="field">Anything to clarify about dates, identifiers or meaning?<textarea id="mapping-note" rows={3} ref={note} defaultValue={m.mapping.note || ''} /></label>
      <p className="micro">Missing history limits which pathways can be observed. The absence of an event is not proof that the activity never happened.</p>
      {busy ? <InlineLoader size="sm" /> : <Btn onClick={confirm} disabled={!ready.ok}>{p2p ? 'Confirm the evidence boundary & analyse →' : 'Confirm the evidence boundary →'}</Btn>}
    </>
  );
}
