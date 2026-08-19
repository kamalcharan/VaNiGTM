'use client';

/**
 * JD Studio — Import mode.
 *
 * UX PREVIEW ONLY. Deterministic mock extraction; no real parse, no LLM.
 * The tenant drops a file (any file — the preview doesn't inspect it), sees
 * the same emerging-JD panel populate with FROM-YOUR-FILE annotations per
 * field. Confidence marks are drawn per field. Publishing takes Vara live
 * (session-flag) exactly the same way compose does.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MockExtractedJd } from '../mock-data';
import { mockExtractionFor, UX_DONE_KEY, UX_PUBLISHED_JDS_KEY } from '../mock-data';
import s from '../vara-onboarding.module.css';

interface Props {
  family: string;
  title: string;
}

export function JdImport({ family, title }: Props) {
  const router = useRouter();
  const [file, setFile] = useState<string | null>(null);
  const [phase, setPhase] = useState<'drop' | 'extracting' | 'review'>('drop');
  const [extracted, setExtracted] = useState<MockExtractedJd | null>(null);
  const [published, setPublished] = useState(false);
  const [familyPrompt, setFamilyPrompt] = useState(false);

  function onFile(f: File) {
    setFile(f.name);
    setPhase('extracting');
    setTimeout(() => {
      setExtracted(mockExtractionFor(f.name, family, title));
      setPhase('review');
    }, 1600);
  }

  function publish() {
    // Count JDs published in this family for the derivation prompt.
    let list: { family: string; title: string }[] = [];
    try {
      list = JSON.parse(sessionStorage.getItem(UX_PUBLISHED_JDS_KEY) || '[]');
    } catch { /* ignore */ }
    list.push({ family, title });
    try {
      sessionStorage.setItem(UX_PUBLISHED_JDS_KEY, JSON.stringify(list));
      sessionStorage.setItem(UX_DONE_KEY, '1');
    } catch { /* private mode */ }
    setPublished(true);
    const secondInFamily = list.filter((j) => j.family === family).length >= 2;
    if (secondInFamily) {
      setFamilyPrompt(true);
    } else {
      setTimeout(() => router.replace('/agents/vara'), 1600);
    }
  }

  function acceptDerivation() {
    // In real: PATCH vara_family_profile with derived defaults.
    router.replace('/agents/vara');
  }

  const canPublish = extracted !== null;

  return (
    <>
      <div className={s.studio}>
        {/* Left: upload / extraction status ─────────────────────── */}
        <div className={s.chatCol}>
          <div className={s.chatCard}>
            <div className={s.chatHead}>
              <span className={s.chatAvatar}>V</span>
              <div>
                <div className={s.chatName}>Vara · Import</div>
                <div className={s.chatSub}>drag a JD, Vara reads it</div>
              </div>
            </div>
            <div className={s.chatBody}>
              {phase === 'drop' && (
                <DropZone onFile={onFile} />
              )}
              {phase === 'extracting' && (
                <div className={s.msg + ' ' + s.msgV}>
                  Reading <b>{file}</b> — extracting facts with evidence…
                </div>
              )}
              {phase === 'review' && extracted && (
                <>
                  <div className={s.msg + ' ' + s.msgV}>
                    Read <b>{file}</b> — {extracted.musthaves.length} must-haves,{' '}
                    {extracted.knockouts.length} knockouts, band and threshold
                    inferred. Everything on the right cites the line it came from.
                    Fix anything the confidence looks low on, then publish.
                  </div>
                  <div className={s.msg + ' ' + s.msgV} style={{ opacity: 0.75 }}>
                    Add more JDs in {family} to sharpen the family defaults — the
                    second one triggers a derivation prompt.
                  </div>
                </>
              )}
            </div>
            {phase === 'review' && (
              <div className={s.chatFoot}>
                <div className={s.chipRow}>
                  <button type="button" className={s.chip} onClick={() => { setPhase('drop'); setExtracted(null); setFile(null); }}>
                    ↺ Import another
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: emerging JD panel — same shape as compose ─────── */}
        <div className={s.jdCol}>
          <div className={s.jdCard}>
            <h2 className={s.jdTitle}>{title}</h2>
            <p className={s.jdSub}>{family} · draft · will be v1 on publish</p>

            <div className={s.jdSection}>
              <div className={s.jdSectionH}>Role summary</div>
              {extracted?.role_summary
                ? <ProvLine value={extracted.role_summary.value} prov={extracted.role_summary.from} />
                : <div className={s.jdEmpty}>drops in when the file is read</div>}
            </div>

            <div className={s.jdSection}>
              <div className={s.jdSectionH}>Must-haves · weighted, from your file</div>
              {!extracted
                ? <div className={s.jdEmpty}>drops in when the file is read</div>
                : extracted.musthaves.map((m, i) => (
                  <div key={i} className={s.weightRow}>
                    <div>
                      <div className={s.weightName}>
                        {m.value.name}
                        <ConfMark c={m.from.confidence} />
                      </div>
                      <div className={s.weightBar}>
                        <div className={s.weightFill} style={{ width: `${m.value.weight}%` }} />
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 3 }}>
                        {m.from.source} · {m.from.span}
                      </div>
                    </div>
                    <div className={s.weightVal}>{m.value.weight} wt</div>
                  </div>
                ))}
            </div>

            <div className={s.jdSection}>
              <div className={s.jdSectionH}>Knockouts · deterministic, from your file</div>
              {!extracted
                ? <div className={s.jdEmpty}>drops in when the file is read</div>
                : extracted.knockouts.map((k, i) => (
                  <div key={i} className={s.knockRow}>
                    <span className={s.knockLabel}>
                      {k.value.label}
                      <ConfMark c={k.from.confidence} />
                    </span>
                    <span className={s.knockRule}>{k.value.rule}</span>
                    <span style={{ fontSize: 10, color: 'var(--color-muted)', marginLeft: 'auto' }}>
                      {k.from.source}
                    </span>
                  </div>
                ))}
            </div>

            <div className={s.jdSection}>
              <div className={s.jdSectionH}>Threshold & band</div>
              <div className={s.jdLine}>
                Handover threshold: {extracted?.threshold_suggested !== undefined
                  ? `${extracted.threshold_suggested}%`
                  : <span className={s.jdEmpty}>—</span>}
                {' '}<span style={{ fontSize: 11, color: 'var(--color-muted)' }}>(you set this — not in the file)</span>
              </div>
              <div className={s.jdLine}>
                Comp band: {extracted?.band ? extracted.band.value : <span className={s.jdEmpty}>—</span>}
              </div>
            </div>

            <div className={s.publishRow}>
              <button type="button" className={s.primary} onClick={publish} disabled={!canPublish}>
                Publish this JD → take Vara live
              </button>
            </div>
          </div>
        </div>
      </div>

      {published && familyPrompt && (
        <div className={s.card} style={{ marginTop: 18, borderColor: 'var(--gold)' }}>
          <div className={s.cardHead}>
            <h2 className={s.cardTitle}>Ready to seed defaults for {family}</h2>
            <span className={s.cardMeta}>from 2 of 2 JDs</span>
          </div>
          <p className={s.cardWhat}>
            The must-haves that appeared in both JDs become family defaults; the
            knockouts that appeared in both become always-applied. The next JD
            you add in {family} will inherit these — you can still tune per-JD.
          </p>
          <div className={s.actions}>
            <button type="button" className={s.primary} onClick={acceptDerivation}>
              Apply as {family} defaults
            </button>
            <button type="button" className={s.ghost} onClick={() => router.replace('/agents/vara')}>
              Skip — keep JDs independent
            </button>
          </div>
        </div>
      )}

      {published && !familyPrompt && (
        <div className={s.doneCard} style={{ marginTop: 18 }}>
          <h2 className={s.doneTitle}>Vara is live for your workspace</h2>
          <p className={s.doneSub}>Redirecting…</p>
        </div>
      )}
    </>
  );
}

function DropZone({ onFile }: { onFile: (f: File) => void }) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
      style={{
        border: `2px dashed ${over ? 'var(--gold)' : 'var(--glass-border)'}`,
        borderRadius: 14,
        padding: 34,
        textAlign: 'center',
        transition: 'border-color .15s',
      }}
    >
      <div style={{ fontSize: 15, marginBottom: 8, fontWeight: 500 }}>
        Drop a JD here — docx or pdf
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 14 }}>
        Vara reads it in one pass, and shows you what it found with evidence.
      </div>
      <label style={{
        cursor: 'pointer',
        display: 'inline-block',
        padding: '8px 16px',
        borderRadius: 8,
        background: 'var(--gold)',
        color: '#141414',
        fontWeight: 600,
        fontSize: 13,
      }}>
        Choose a file
        <input
          type="file"
          hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
        />
      </label>
    </div>
  );
}

function ProvLine({ value, prov }: { value: string; prov: { source: string; span?: string } }) {
  return (
    <div>
      <div className={s.jdLine}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 3 }}>
        {prov.source}{prov.span ? ` · ${prov.span}` : ''}
      </div>
    </div>
  );
}

function ConfMark({ c }: { c: 'high' | 'medium' | 'low' }) {
  const color = c === 'high' ? 'var(--color-success)' : c === 'medium' ? 'var(--gold)' : 'var(--color-warning)';
  const label = c === 'high' ? '✓ high' : c === 'medium' ? '~ medium' : '⚠ low — review';
  return (
    <span style={{
      fontSize: 9, marginLeft: 8, padding: '1px 6px',
      borderRadius: 999, border: `1px solid ${color}`, color,
      fontFamily: 'var(--font-mono)', letterSpacing: '.04em', textTransform: 'uppercase',
    }}>{label}</span>
  );
}
