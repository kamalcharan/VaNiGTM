/**
 * PDF parser — uses pdf-parse (Buffer input).
 */

import pdfParse from 'pdf-parse';
import type { Parser } from './parser.interface';

export class PdfParser implements Parser {
  canHandle(mimeType: string, extension: string): boolean {
    return mimeType === 'application/pdf' || extension === 'pdf';
  }

  async extract(buffer: Buffer, filename: string): Promise<string> {
    try {
      const data = await pdfParse(buffer);
      return data.text;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`PDF_PARSE_ERROR: ${filename} — ${message}`);
    }
  }
}
