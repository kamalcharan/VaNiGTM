/**
 * Addresses → the keyed fingerprints stored in vani_suppression (D9-b).
 *
 * The suppression list never holds an address, only HMAC-SHA256 of the
 * normalised address under SUPPRESSION_HASH_KEY. That lets the gate check an
 * address it is about to use without the list being a list of personal data,
 * and lets a block survive an erasure (the address is gone; the fingerprint
 * still matches if the address ever comes back).
 *
 * The kind is part of the hashed text, so the same string as an email and as
 * a domain never collide.
 *
 * The key: from .env, no default (a shared default is no key at all), read at
 * CALL time. It is NOT checked at API startup on purpose — nothing sends yet,
 * and a missing key must not take the API down. A call without it refuses
 * loudly (SUPPRESSION_NOT_CONFIGURED). Losing or changing the key makes every
 * stored fingerprint unmatchable, so it is backed up with the other secrets
 * and never rotated casually (design-notes-consent.md §6a).
 */
import { createHmac } from 'crypto';

export type IdentifierKind = 'email' | 'phone' | 'profile_url' | 'domain';

export interface Identifier { kind: IdentifierKind; value: string }

export class CommsError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'CommsError';
  }
}

const MIN_KEY_LENGTH = 32;

function hashKey(): string {
  const key = process.env.SUPPRESSION_HASH_KEY ?? '';
  if (key.trim().length < MIN_KEY_LENGTH) {
    throw new CommsError('SUPPRESSION_NOT_CONFIGURED',
      `SUPPRESSION_HASH_KEY is ${key ? 'shorter than 32 characters' : 'not set'} — `
      + 'the do-not-contact list cannot be checked, so nothing may be contacted. See backend/.env.example.');
  }
  return key;
}

const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

function normaliseDomain(raw: string): string {
  const d = raw.trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  if (!DOMAIN_RE.test(d)) throw new CommsError('INVALID_IDENTIFIER', `"${raw}" is not a domain`);
  return d;
}

/**
 * The one canonical form per kind. Deliberately strict: an address that
 * cannot be normalised is refused, never guessed at — a guess that differs
 * from the stored form is a block that silently fails to match.
 */
export function normalise(id: Identifier): string {
  const raw = id.value ?? '';
  switch (id.kind) {
    case 'email': {
      const v = raw.trim().toLowerCase();
      const at = v.lastIndexOf('@');
      if (at <= 0 || at !== v.indexOf('@')) throw new CommsError('INVALID_IDENTIFIER', `"${raw}" is not an email address`);
      return `${v.slice(0, at)}@${normaliseDomain(v.slice(at + 1))}`;
    }
    case 'phone': {
      // E.164 only: the caller composes it from separate country code and
      // number (CLAUDE.md lesson 11 — never concatenate-and-parse here).
      const v = raw.trim();
      if (!/^\+[1-9]\d{7,14}$/.test(v.replace(/[\s-]/g, ''))) {
        throw new CommsError('INVALID_IDENTIFIER', `"${raw}" is not an E.164 phone number (+<country><number>)`);
      }
      return v.replace(/[\s-]/g, '');
    }
    case 'profile_url': {
      let u: URL;
      try { u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`); }
      catch { throw new CommsError('INVALID_IDENTIFIER', `"${raw}" is not a URL`); }
      const host = normaliseDomain(u.hostname);
      const path = u.pathname.replace(/\/+$/, '').toLowerCase();
      if (!path) throw new CommsError('INVALID_IDENTIFIER', `"${raw}" has no profile path`);
      return `${host}${path}`;
    }
    case 'domain':
      return normaliseDomain(raw);
    default:
      throw new CommsError('INVALID_IDENTIFIER', `unknown identifier kind "${(id as Identifier).kind}"`);
  }
}

/** HMAC-SHA256 hex of `<kind>:<normalised>` — the form stored in vani_suppression. */
export function fingerprint(id: Identifier): string {
  return createHmac('sha256', hashKey()).update(`${id.kind}:${normalise(id)}`).digest('hex');
}

/** The domain of an email, for the "nobody at this company" block (§6c). */
export function emailDomain(email: string): string {
  const n = normalise({ kind: 'email', value: email });
  return n.slice(n.indexOf('@') + 1);
}
