/**
 * PPTX parser — uses officeparser 6.x.
 *
 * officeparser 6.1.1 accepts a Buffer directly:
 *   await OfficeParser.parseOffice(buffer) → OfficeParserAST
 * The AST exposes .toText() for the plain-text representation we feed to
 * the chunker. No temporary files on disk.
 *
 * Note: officeparser is universal — it handles .docx/.xlsx/.pdf/.odp too,
 * but we keep canHandle scoped to pptx so DocxParser/PdfParser retain
 * their preferred libraries (mammoth / pdf-parse).
 */

import { OfficeParser } from 'officeparser';
import type { Parser } from './parser.interface';

export class PptxParser implements Parser {
  canHandle(mimeType: string, extension: string): boolean {
    return mimeType.includes('presentationml') || extension === 'pptx';
  }

  async extract(buffer: Buffer, filename: string): Promise<string> {
    try {
      const ast = await OfficeParser.parseOffice(buffer);
      return ast.toText();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`PPTX_PARSE_ERROR: ${filename} — ${message}`);
    }
  }
}
