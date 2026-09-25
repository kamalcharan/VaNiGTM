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
import { useState } from 'react';
import Link from 'next/link';
import { DataBoundary, SkeletonRows, useToast } from '@/platform/feedback';
import { formatDate } from '@/lib/format';
import s from '../smart-profile.module.css';
import { isReading, useSourcesRead, useTeach, type KbSource } from '../useKnowledge';

const KIND: Record<string, string> = {
  url: 'site', txt: 'pasted', gdrive: 'drive', pdf: 'document', docx: 'document', md: 'document',
};

const MIN_TEXT = 40; // the server's own floor (TEXT_TOO_SHORT)

function statusOf(src: KbSource): { text: string; tone: 'reading' | 'ok' | 'bad' } {
  if (src.status === 'error') {
    const parked = /LLM_FAILOVER_NEEDS_APPROVAL/.test(src.error_msg ?? '');
    return { text: `failed — ${src.error_msg || 'no reason recorded'}${parked ? ' · waiting on your decision below' : ''}`, tone: 'bad' };
  }
  if (src.status === 'pending') return { text: 'queued', tone: 'reading' };
  if (src.status === 'processing') return { text: 'reading…', tone: 'reading' };
  const n = src.node_count ?? 0;
  return { text: n ? `read · ${n} ${n === 1 ? 'entry' : 'entries'}` : 'read · nothing usable found', tone: n ? 'ok' : 'bad' };
}

export function KnowledgeSection({ n, compact }: { n?: number; compact?: boolean }) {
  const q = useSourcesRead();
  const { submitUrl, submitText, remove, isBusy } = useTeach();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'url' | 'text'>('url');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');

  async function send() {
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
              <button type="button" aria-pressed={kind === 'text'} onClick={() => setKind('text')}>Pasted text</button>
            </div>
            {kind === 'url' ? (
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
                const st = statusOf(src);
                return (
                  <li key={src.id} className={s.srcRow}>
                    <div className={s.row}>
                      <span className={s.rowName}>
                        {src.display_name}
                        <span className={s.rowTagMuted}>{KIND[src.source_type] ?? src.source_type}</span>
                      </span>
                      <span className={`${s.rowDetail} ${st.tone === 'bad' ? s.srcBad : st.tone === 'reading' ? s.srcReading : ''}`}>
                        {st.text} · {formatDate(src.created_at)}
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
