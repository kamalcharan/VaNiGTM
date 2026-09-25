/**
 * Shared by the ingestion functions. The REST router (ingestion.routes.ts)
 * predates the skill runner and keeps working for direct API use; these
 * functions expose the same operations through `POST /api/v1/skills/
 * ingestion-skill/<fn>` so the console reaches them on the one surface nginx
 * exposes (same precedent as llm-provider-skill over the BYOK routes).
 */
import fs from 'fs';
import path from 'path';

export const SQL_GET_SOURCES = fs.readFileSync(path.join(__dirname, '..', 'queries', 'get-sources.sql'), 'utf-8');
export const SQL_GET_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'queries', 'get-source.sql'), 'utf-8');

export const MIN_TEXT_CHARS = 40;
export const MAX_TEXT_CHARS = 200_000;

/** Bare domains become https://; only public http(s) URLs pass. */
export function parsePublicUrl(raw: string): URL {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) throw new Error('MISSING_FIELDS: url is required');
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try { parsed = new URL(candidate); } catch { throw new Error(`INVALID_URL: Not a valid URL: ${trimmed}`); }
  if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname.includes('.')) {
    throw new Error('INVALID_URL: Only public http(s) URLs are supported');
  }
  return parsed;
}
