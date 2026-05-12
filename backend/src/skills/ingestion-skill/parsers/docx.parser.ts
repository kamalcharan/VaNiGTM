import type { Parser } from './parser.interface';

/**
 * DOCX parser — will use mammoth (to be installed in a later stage).
 * Stage 2: stub only.
 */
export class DocxParser implements Parser {
  canHandle(mimeType: string, extension: string): boolean {
    return (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      || extension === 'docx'
    );
  }

  async extract(_buffer: Buffer, _filename: string): Promise<string> {
    throw new Error('NOT_IMPLEMENTED');
  }
}
