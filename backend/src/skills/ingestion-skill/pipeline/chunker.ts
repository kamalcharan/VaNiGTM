/**
 * Chunker — splits extracted plain text into LLM-sized pieces.
 * Stage 2: stub only. Real implementation lands in a later stage
 * (paragraph-boundary semantic split with overlap, per Addendum 02).
 */

export interface Chunk {
  index: number;
  text: string;
  charStart: number;
  charEnd: number;
}

export function chunkText(_text: string, _maxChars = 4000, _overlap = 200): Chunk[] {
  throw new Error('NOT_IMPLEMENTED');
}
