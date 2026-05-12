import type { Parser } from './parser.interface';

/**
 * Plain-text / markdown parser — fallback when no other parser matches.
 * Stage 2: stub only.
 */
export class TextParser implements Parser {
  canHandle(mimeType: string, extension: string): boolean {
    return (
      mimeType === 'text/plain'
      || mimeType === 'text/markdown'
      || extension === 'txt'
      || extension === 'md'
    );
  }

  async extract(_buffer: Buffer, _filename: string): Promise<string> {
    throw new Error('NOT_IMPLEMENTED');
  }
}
