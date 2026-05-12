import type { Parser } from './parser.interface';

/**
 * PPTX parser — will use officeparser (to be installed in a later stage).
 * Stage 2: stub only.
 */
export class PptxParser implements Parser {
  canHandle(mimeType: string, extension: string): boolean {
    return (
      mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      || extension === 'pptx'
    );
  }

  async extract(_buffer: Buffer, _filename: string): Promise<string> {
    throw new Error('NOT_IMPLEMENTED');
  }
}
