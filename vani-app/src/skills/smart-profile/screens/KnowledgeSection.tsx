'use client';
/**
 * "What VaNi has read" — section 7 of the Smart Profile.
 *
 * Sources, not a graph. Each row is one thing VaNi read, with an honest
 * status: queued, reading, read with how many entries it yielded, or failed
 * with the real reason (rule 12 — the degraded thing is labelled, not
 * hidden). "Teach VaNi" opens the door to add more: a URL, or pasted text.
 *
 * The empty state is the first impression for most tenants and carries the
 * action, not a shrug.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { DataBoundary, SkeletonRows, useToast } from '@/platform/feedback';
import { formatDate } from '@/lib/format';
import s from '../smart-profile.module.css';
import { DOC_ACCEPT, DOC_MAX_MB, isReading, useSourcesRead, useTeach, useUploadDocument, type KbSource } from '../useKnowledge';
import { useProfileRead } from '../useSmartProfile';
import { ReadingProgress } from './ReadingProgress';

const KIND: Record<string, string> = {
  url: 'site', txt: 'pasted', gdrive: 'drive', pdf: 'document', docx: 'document', md: 'document',
};

const MIN_TEXT = 40; // the server's own floor (TEXT_TOO_SHORT)

/**
 * A finished read is reported as what it DID — the Smart Profile is built or
 * updated, and how complete it now is — not as a count of graph entries.
 * Charan, 2026-09-26: "instead of 'read · 103 entries' say the Smart Profile
 * is completed, maybe the percentage, and the user can click and check."
 * The entry count stays, smaller, because it is the honest yield of the page.
 * `score` is the profile's completion score when the profile read has it;
 * without it the line still says the profile was updated, never a number.
 */
function statusOf(src: KbSource, score: number | undefined): { text: string; tone: 'reading' | 'ok' | 'bad' } {
  if (src.status === 'error') {
    const parked = /LLM_FAILOVER_NEEDS_APPROVAL/.test(src.error_msg ?? '');
    return { text: `failed — ${src.error_msg || 'no reason recorded'}${parked ? ' · waiting on your decision below' : ''}`, tone: 'bad' };
  }
  if (src.status === 'pending') return { text: 'queued', tone: 'reading' };
  if (src.status === 'processing') return { text: 'reading…', tone: 'reading' };
  const n = src.node_count ?? 0;
  if (!n) return { text: 'read · nothing usable found', tone: 'bad' };
  const pct = typeof score === 'number' ? ` · ${Math.round(score)}% complete` : '';
  return { text: `Smart Profile updated${pct} · ${n} ${n === 1 ? 'entry' : 'entries'}`, tone: 'ok' };
}

export function KnowledgeSection({ n, compact }: { n?: number; compact?: boolean }) {
  const q = useSourcesRead();
  const profile = useProfileRead();
  const score = profile.data?.data?.completion_score;
  const { submitUrl, submitText, remove, isBusy: teaching } = useTeach();
  const { upload, isUploading } = useUploadDocument();
  const isBusy = teaching || isUploading;
  // When the last read finishes, the profile is re-scored by a SEPARATE run
  // (KNOWLEDGE_UPDATED → profile recalc), so the score is asked for again at
  // once and once more after it has had time to land. Without this the row
  // would say "updated" beside a number from before the read.
  const qc = useQueryClient();
  const reading = !!q.data?.data?.some(isReading);
  const wasReading = useRef(false);
  useEffect(() => {
    const finished = wasReading.current && !reading;
    wasReading.current = reading;
    if (!finished) return;
    void qc.invalidateQueries({ queryKey: ['smart-profile'] });
    const t = setTimeout(() => { void qc.invalidateQueries({ queryKey: ['smart-profile'] }); }, 12_000);
    return () => clearTimeout(t);
  }, [reading, qc]);
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'url' | 'file' | 'text'>('url');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');

  async function send() {
    if (kind === 'file') {
      if (!file) { showToast({ message: 'Choose a file first', type: 'error' }); return; }
      if (await upload(file)) { setFile(null); setOpen(false); }
      return;
    }
    if (kind === 'url') {
      const v = url.trim();
      if (!v) { showToast({ message: 'Enter a URL first', type: 'error' }); return; }
      const r = await submitUrl(v);
      if (r) { setUrl(''); setOpen(false); }
      return;
    }
    const v = text.trim();
    if (v.length < MIN_TEXT) {
      showToast({ message: `Paste at least ${MIN_TEXT} characters — a line or two is not enough to learn from`, type: 'error' });
      return;
    }
    const r = await submitText(v, title.trim());
    if (r) { setText(''); setTitle(''); setOpen(false); }
  }

  return (
    <section className={s.section}>
      <header className={s.sectionHead}>
        {n != null && <span className={s.sectionNum}>{n}</span>}
        <div className={s.sectionTitles}>
          <h2 className={s.sectionTitle}>What VaNi has read</h2>
          <p className={s.sectionWhat}>{compact ? 'Every source, with what it yielded. Add to it any time.' : <>Every source behind the sections above. What VaNi learned from them is under <Link href="/smart-profile/knowledge">Knowledge</Link>; add to it any time.</>}</p>
        </div>
        <button type="button" className={s.sectionEdit} onClick={() => setOpen((v) => !v)}>
          {open ? 'Cancel' : 'Teach VaNi'}
        </button>
      </header>

      <div className={s.sectionBody}>
        {open && (
          <div className={s.teach}>
            <div className={s.teachSeg} role="group" aria-label="What to teach">
              <button type="button" aria-pressed={kind === 'url'} onClick={() => setKind('url')}>A web page</button>
              <button type="button" aria-pressed={kind === 'file'} onClick={() => setKind('file')}>A document</button>
              <button type="button" aria-pressed={kind === 'text'} onClick={() => setKind('text')}>Pasted text</button>
            </div>
            {kind === 'file' ? (
              <div className={s.inviteRow}>
                <input
                  className={s.inviteInput}
                  type="file"
                  accept={DOC_ACCEPT}
                  aria-label={`A document: PDF, Word, PowerPoint, text or markdown, up to ${DOC_MAX_MB} MB`}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  disabled={isBusy}
                />
                <button type="button" className={s.inviteSend} onClick={() => void send()} disabled={isBusy || !file}>
                  {isUploading ? 'Uploading…' : 'Read it'}
                </button>
              </div>
            ) : kind === 'url' ? (
              <div className={s.inviteRow}>
                <input
                  className={s.inviteInput}
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !isBusy) void send(); }}
                  placeholder="https://yourcompany.com/pricing"
                  disabled={isBusy}
                  autoFocus
                />
                <button type="button" className={s.inviteSend} onClick={() => void send()} disabled={isBusy}>
                  {isBusy ? 'Sending…' : 'Read it'}
                </button>
              </div>
            ) : (
              <div className={s.teachText}>
                <input
                  className={s.inviteInput}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What is this? (optional — e.g. Sales deck, March 2026)"
                  disabled={isBusy}
                />
                <textarea
                  className={s.teachArea}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste a brochure, a proposal, an FAQ — anything that says what you do and for whom."
                  rows={6}
                  disabled={isBusy}
                  autoFocus
                />
                <div className={s.teachFoot}>
                  <span className={s.teachCount}>{text.trim().length < MIN_TEXT ? `${MIN_TEXT - text.trim().length} more characters` : `${text.trim().length.toLocaleString()} characters`}</span>
                  <button type="button" className={s.inviteSend} onClick={() => void send()} disabled={isBusy}>
                    {isBusy ? 'Sending…' : 'Read it'}
                  </button>
                </div>
              </div>
            )}
            <p className={s.teachNote}>
              VaNi reads it, writes what it learns into your profile, and re-scores the sections above.
              A page you already submitted is read again, not added twice.
            </p>
          </div>
        )}

        <DataBoundary
          query={q}
          label="sources"
          skeleton={<SkeletonRows rows={3} />}
          isEmpty={(d: KbSource[] | undefined) => !d?.length}
          empty="VaNi has read nothing yet. Point it at your website, or paste what you have — every section above is built from what lands here."
        >
          {(d: KbSource[]) => (
            <ul className={s.rows}>
              {d.map((src) => {
                const st = statusOf(src, score);
                return (
                  <li key={src.id} className={s.srcRow}>
                    <div className={s.row}>
                      <span className={s.rowName}>
                        {src.display_name}
                        <span className={s.rowTagMuted}>{KIND[src.source_type] ?? src.source_type}</span>
                      </span>
                      <span className={`${s.rowDetail} ${st.tone === 'bad' ? s.srcBad : st.tone === 'reading' ? s.srcReading : ''}`}>
                        {st.text} · {formatDate(src.updated_at ?? src.created_at)}
                        {st.tone === 'ok' && (compact
                          ? <> · <Link href="/smart-profile" className={s.rowLink}>Open the Smart Profile →</Link></>
                          : <> · <a href="#smart-profile-top" className={s.rowLink}>check the sections above ↑</a></>)}
                      </span>
                    </div>
                    {src.status === 'error' && src.source_type === 'url' && src.url && (
                      <button
                        type="button"
                        className={s.srcRemove}
                        onClick={() => void submitUrl(src.url!)}
                        disabled={isBusy}
                        title="Read the page again. Same row, not a second one."
                      >
                        Read again
                      </button>
                    )}
                    {isReading(src) && <div style={{ gridColumn: '1 / -1' }}><ReadingProgress source={src} /></div>}
                    {!isReading(src) && (
                      <button
                        type="button"
                        className={s.srcRemove}
                        onClick={() => void remove(src.id)}
                        disabled={isBusy}
                        title="Remove the source. What VaNi learned from it stays."
                      >
                        Remove
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </DataBoundary>
      </div>
    </section>
  );
}
