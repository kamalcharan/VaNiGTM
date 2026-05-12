/**
 * Plain-text / markdown parser. Also the fallback parser — canHandle
 * returns true for anything, so this must be registered LAST in the
 * parser array (after pdf/docx/pptx). Any source the specialised
 * parsers reject ends up here.
 *
 * toString never throws; no error handling needed.
 */

import type { Parser } from './parser.interface';

export class TextParser implements Parser {
  canHandle(_mimeType: string, _extension: string): boolean {
    return true;
  }

  async extract(buffer: Buffer, _filename: string): Promise<string> {
    return buffer.toString('utf-8');
  }
}
