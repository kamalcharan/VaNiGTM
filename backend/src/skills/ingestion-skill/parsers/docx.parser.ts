/**
 * DOCX parser — uses mammoth.extractRawText with Buffer input.
 * mammoth ships its own type definitions, so no @types/mammoth is needed.
 */

import mammoth from 'mammoth';
import type { Parser } from './parser.interface';

export class DocxParser implements Parser {
  canHandle(mimeType: string, extension: string): boolean {
    return mimeType.includes('wordprocessingml') || extension === 'docx';
  }

  async extract(buffer: Buffer, filename: string): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`DOCX_PARSE_ERROR: ${filename} — ${message}`);
    }
  }
}
