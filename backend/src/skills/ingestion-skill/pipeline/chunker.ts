/**
 * Chunker — splits extracted plain text into LLM-sized pieces.
 *
 * Strategy: paragraph-boundary semantic split, NOT fixed character count.
 *   - Paragraphs are separated by one or more blank lines (\n\n+).
 *   - Paragraphs shorter than 20 characters (trimmed) are dropped as noise.
 *   - Paragraphs are accumulated into chunks up to `maxChars`.
 *   - When the next paragraph would push the chunk past `maxChars`, the
 *     current chunk is finalised and a new chunk starts with the last
 *     `overlap` chars of the previous chunk — overlap captures entities
 *     whose mentions span a paragraph boundary.
 *
 * charStart / charEnd reference positions in the ORIGINAL text:
 *   - charStart = byte offset of the first kept paragraph in this chunk
 *   - charEnd   = byte offset where the last kept paragraph ends
 *   - charEnd - charStart is NOT equal to chunk.text.length, because
 *     dropped paragraphs and overlap text from a prior chunk both change
 *     the chunk-text length without affecting original-text positions.
 *
 * Edge cases:
 *   - Empty input → []
 *   - Input under maxChars → single chunk
 *   - All paragraphs filtered out (e.g. very short doc) → single chunk
 *     containing the whole trimmed text. Better to extract weakly than
 *     to drop the document entirely.
 */

export interface Chunk {
  index: number;
  text: string;
  charStart: number;
  charEnd: number;
}

interface Paragraph {
  text: string;
  start: number;
  end: number;
}

const MIN_PARAGRAPH_CHARS = 20;

export function chunkText(
  text: string,
  maxChars = 4000,
  overlap = 200,
): Chunk[] {
  if (!text || text.length === 0) return [];

  const paragraphs = splitParagraphs(text);
  const keptParagraphs = paragraphs.filter(p => p.text.trim().length > MIN_PARAGRAPH_CHARS);

  // No paragraphs survived the noise filter, but the document has content.
  // Return the whole thing as a single chunk rather than dropping it.
  if (keptParagraphs.length === 0) {
    const trimmed = text.trim();
    if (trimmed.length === 0) return [];
    return [{ index: 0, text: trimmed, charStart: 0, charEnd: text.length }];
  }

  const chunks: Chunk[] = [];
  let current = '';
  let chunkStart = keptParagraphs[0].start;
  let chunkEnd = keptParagraphs[0].start;

  for (const para of keptParagraphs) {
    const sep = current.length === 0 ? '' : '\n\n';
    const candidate = current + sep + para.text;

    if (candidate.length > maxChars && current.length > 0) {
      // Finalise the current chunk and start a new one with overlap.
      chunks.push({
        index: chunks.length,
        text: current.trim(),
        charStart: chunkStart,
        charEnd: chunkEnd,
      });

      const tail = overlap > 0 && overlap < current.length
        ? current.slice(-overlap)
        : '';
      current   = tail.length > 0 ? tail + '\n\n' + para.text : para.text;
      chunkStart = para.start;
      chunkEnd   = para.end;
    } else {
      // Append to the current chunk.
      if (current.length === 0) chunkStart = para.start;
      current = candidate;
      chunkEnd = para.end;
    }
  }

  if (current.trim().length > 0) {
    chunks.push({
      index: chunks.length,
      text: current.trim(),
      charStart: chunkStart,
      charEnd: chunkEnd,
    });
  }

  return chunks;
}

/**
 * Walk the original text once, returning each paragraph with its original
 * char offsets. A paragraph is a run of non-blank-line characters; the
 * boundary is two or more consecutive newlines.
 */
function splitParagraphs(text: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let pos = 0;
  const len = text.length;

  while (pos < len) {
    // Skip newlines that form the boundary between paragraphs.
    while (pos < len && text[pos] === '\n') pos++;
    if (pos >= len) break;

    const start = pos;
    // Find the next blank-line boundary (\n\n) or end of text.
    let end = text.indexOf('\n\n', pos);
    if (end === -1) end = len;

    paragraphs.push({ text: text.slice(start, end), start, end });
    pos = end;
  }

  return paragraphs;
}
