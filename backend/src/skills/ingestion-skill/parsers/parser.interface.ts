/**
 * Parser contract — every concrete parser (pdf, docx, pptx, txt) implements this.
 *
 * Input is in-memory: Buffer + filename. Files downloaded from Google Drive
 * never touch local disk, and direct uploads pass through multer's memory
 * storage. No filesystem paths anywhere.
 */
export interface Parser {
  /**
   * Return true when this parser can handle the given content type.
   * Either mimeType or extension may be the empty string — implementations
   * should accept a match on either.
   */
  canHandle(mimeType: string, extension: string): boolean;

  /**
   * Extract plain text from the binary buffer. Throws on parse failure.
   */
  extract(buffer: Buffer, filename: string): Promise<string>;
}
