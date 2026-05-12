import type { Parser } from './parser.interface';

/**
 * PDF parser — uses pdf-parse (already a backend dependency).
 * Stage 2: stub only.
 */
export class PdfParser implements Parser {
  canHandle(mimeType: string, extension: string): boolean {
    return mimeType === 'application/pdf' || extension === 'pdf';
  }

  async extract(_buffer: Buffer, _filename: string): Promise<string> {
    throw new Error('NOT_IMPLEMENTED');
  }
}
