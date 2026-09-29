/**
 * The posting's stored format, and the only thing that turns it into HTML.
 *
 * Its own file, with no React and no CSS import, for two reasons: it is a pure
 * function worth testing directly, and the candidate widget
 * (`public/embed/vara.js`, not written yet) has to render the same markdown the
 * console wrote. One renderer, or the preview is a lie.
 */

/** Escape first, always. Everything after this operates on inert text. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The smallest markdown that a job posting needs, rendered for preview only.
 *
 * Deliberately NOT a markdown library: this runs on already-escaped text and
 * emits a fixed set of tags — strong, em, ul/li, h3, br. No images, no raw
 * HTML, no link syntax yet (a link needs a href policy, and "yet" is honest
 * where a half-checked `javascript:` filter would not be).
 */
export function renderPosting(md: string): string {
  const lines = escapeHtml(md).split('\n');
  const out: string[] = [];
  let inList = false;

  const inline = (t: string) => t
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }
    if (inList) { out.push('</ul>'); inList = false; }

    const head = /^\s*#{1,3}\s+(.*)$/.exec(line);
    if (head) { out.push(`<h3>${inline(head[1])}</h3>`); continue; }
    if (!line.trim()) { out.push(''); continue; }
    out.push(`<p>${inline(line)}</p>`);
  }
  if (inList) out.push('</ul>');
  return out.join('\n');
}
