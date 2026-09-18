'use client';

/**
 * A job posting with formatting, stored as MARKDOWN.
 *
 * Charan, 2026-09-18: "can this be rich text with controls like bold italic?"
 * — yes, and a posting without a bullet list is barely a posting.
 *
 * WHY MARKDOWN RATHER THAN A RICH-TEXT EDITOR. This text ends up inside the
 * tenant's OWN PAGE, through the candidate widget. Storing HTML means storing
 * something that will be injected into somebody else's site, and every sanitiser
 * is a thing that can be got past. Markdown is inert until something chooses to
 * render it, and the renderer decides which tags exist at all — so the worst a
 * malicious paste can do is show angle brackets.
 *
 * It also survives: the same string reads correctly in a plain textarea, in an
 * email, and in a log. A JSON blob of editor nodes does not, and it would put a
 * dependency between us and one editor library's file format forever.
 *
 * The widget that renders it does not exist yet — `public/embed/vara.js` is
 * referenced by the embed snippet and is not in either repo. That is the reason
 * to choose the format NOW, while nothing has been written against it, rather
 * than to wait and store HTML because the first renderer happened to be a
 * `dangerouslySetInnerHTML`.
 *
 * The preview below is the honest half: formatting you cannot see is worse than
 * no formatting, because a `**` that did not take reads as a typo to the
 * candidate and as working software to the person who typed it.
 */

import { useRef, useState } from 'react';
import s from '../vara-onboarding.module.css';
import { renderPosting } from '../posting-markdown';

type Wrap = { before: string; after: string } | { line: string };

const CONTROLS: { label: string; title: string; apply: Wrap }[] = [
  { label: 'B', title: 'Bold', apply: { before: '**', after: '**' } },
  { label: 'I', title: 'Italic', apply: { before: '*', after: '*' } },
  { label: '• List', title: 'Bullet list', apply: { line: '- ' } },
  { label: 'H', title: 'Heading', apply: { line: '## ' } },
];

export default function RichText({
  value, onChange, placeholder, ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  /**
   * Apply a control to the SELECTION, and put the cursor back where the typing
   * was. A toolbar that clears the selection or jumps the caret to the end is
   * the thing people stop using after the second click.
   */
  const apply = (w: Wrap) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;

    if ('line' in w) {
      // Line controls act on whole lines, including every line of a selection,
      // so "make these four lines bullets" is one click rather than four.
      const from = value.lastIndexOf('\n', start - 1) + 1;
      const toIdx = value.indexOf('\n', end);
      const to = toIdx === -1 ? value.length : toIdx;
      const block = value.slice(from, to);
      const already = block.split('\n').every((l) => l.startsWith(w.line));
      const next = block
        .split('\n')
        .map((l) => (already ? l.slice(w.line.length) : `${w.line}${l}`))
        .join('\n');
      onChange(value.slice(0, from) + next + value.slice(to));
      const delta = next.length - block.length;
      queueMicrotask(() => { el.focus(); el.setSelectionRange(start, end + delta); });
      return;
    }

    const selected = value.slice(start, end);
    // Pressing Bold on text that is already bold takes it off — otherwise the
    // only way to undo a click is to hunt for the asterisks.
    const wrapped = value.slice(start - w.before.length, start) === w.before
      && value.slice(end, end + w.after.length) === w.after;

    if (wrapped) {
      onChange(
        value.slice(0, start - w.before.length) + selected + value.slice(end + w.after.length),
      );
      queueMicrotask(() => {
        el.focus();
        el.setSelectionRange(start - w.before.length, end - w.before.length);
      });
      return;
    }

    onChange(value.slice(0, start) + w.before + selected + w.after + value.slice(end));
    queueMicrotask(() => {
      el.focus();
      el.setSelectionRange(start + w.before.length, end + w.before.length);
    });
  };

  return (
    <div>
      <div className={s.chipRow} role="toolbar" aria-label="Formatting">
        {CONTROLS.map((c) => (
          <button
            key={c.label}
            type="button"
            className={s.suggChip}
            title={c.title}
            aria-label={c.title}
            onClick={() => apply(c.apply)}
            style={c.label === 'B' ? { fontWeight: 700 } : c.label === 'I' ? { fontStyle: 'italic' } : undefined}
          >
            {c.label}
          </button>
        ))}
        <button
          type="button"
          className={preview ? s.suggChipOn : s.suggChip}
          aria-pressed={preview}
          onClick={() => setPreview((p) => !p)}
        >
          {preview ? 'Edit' : 'Preview'}
        </button>
      </div>

      {preview ? (
        <div
          className={s.descBox}
          style={{ minHeight: 140, overflowY: 'auto', whiteSpace: 'normal' }}
          // Safe by construction: renderPosting escapes every angle bracket
          // before it emits any tag, and emits only strong/em/ul/li/h3/p.
          dangerouslySetInnerHTML={{
            __html: value.trim()
              ? renderPosting(value)
              : '<p style="opacity:.6">Nothing written yet.</p>',
          }}
        />
      ) : (
        <textarea
          ref={ref}
          className={s.descBox}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={8}
          aria-label={ariaLabel}
          onKeyDown={(e) => {
            // The two shortcuts people try without being told.
            if (!(e.metaKey || e.ctrlKey)) return;
            const k = e.key.toLowerCase();
            if (k === 'b') { e.preventDefault(); apply({ before: '**', after: '**' }); }
            if (k === 'i') { e.preventDefault(); apply({ before: '*', after: '*' }); }
          }}
        />
      )}
    </div>
  );
}
