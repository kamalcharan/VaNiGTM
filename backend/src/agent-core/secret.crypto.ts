/**
 * Vikuna Agent Core — Tenant Secret Encryption
 *
 * Encrypts secrets a TENANT owns and we merely hold: today the BYOK LLM API
 * key in vani_llm_provider.credentials_enc. Not for our own secrets (those
 * live in env and never touch the database) and not for passwords (those are
 * hashed, not encrypted — a password we can decrypt is a password we should
 * not have).
 *
 * ── AES-256-GCM, KEYED FROM ENV, ENCRYPTED IN NODE ────────────────────
 *
 * GCM because it authenticates as well as encrypts: a tampered or truncated
 * ciphertext fails to open rather than decrypting to garbage that then gets
 * sent to somebody's API endpoint as a bearer token.
 *
 * In Node rather than pgcrypto so the key never reaches the database. The
 * database is the thing most likely to be dumped, replicated, or handed to a
 * read-only MCP connector; pgp_sym_encrypt would put ciphertext and the key
 * to open it in the same place, which is not encryption at rest so much as a
 * locked box with the key taped to the lid.
 *
 * ── STORED FORMAT ─────────────────────────────────────────────────────
 *
 *   v1.<key_id>.<iv_b64>.<tag_b64>.<ciphertext_b64>
 *
 * Self-describing on purpose. `v1` is the scheme, so a future AES upgrade can
 * be told apart from a corrupt value instead of guessed at. `key_id` is the
 * first 8 hex of SHA-256 of the key that sealed it — NOT the key, and not
 * reversible to it — so rotation can re-encrypt only what is stale and a
 * wrong-key failure says "sealed with key a3f9c210, you are holding 7b41e0dd"
 * instead of "unable to authenticate data".
 *
 * ── ROTATION ──────────────────────────────────────────────────────────
 *
 * Set TENANT_SECRET_KEY_PREVIOUS to the old key. decrypt() then tries the
 * current key first and falls back to the previous one, so both generations
 * open during the changeover. needsRotation() reports which rows are still
 * on an older key; re-encrypt them, then drop the env var. There is no
 * automatic re-encrypt-on-read: that hides how far a rotation has actually
 * got, and a rotation you cannot measure is one you cannot finish.
 *
 * ── RULE 12 ───────────────────────────────────────────────────────────
 *
 * No fallbacks here. A missing key, a short key, a malformed payload and a
 * failed tag check each throw with their own code. The one thing this module
 * must never do is return a plausible-looking wrong answer — for a bearer
 * token that means authenticating as the wrong tenant, or firing a
 * tenant's paid API quota on garbage.
 */

import crypto from 'crypto';

/* ── Constants ───────────────────────────────────────────────────────────── */

const SCHEME    = 'v1';
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32; // AES-256
const IV_BYTES  = 12; // GCM standard; 96-bit nonces are what the mode is built for
const TAG_BYTES = 16;

/* ── Key material ────────────────────────────────────────────────────────── */

export interface SecretKey {
  key: Buffer;
  /** First 8 hex of SHA-256(key). Identifies which key sealed a value. */
  id: string;
}

/**
 * Read a key from env.
 *
 * Accepts base64 or hex, because whoever generates this will use whichever
 * their shell produced and should not have to find out which we wanted from a
 * decryption failure three weeks later. Must decode to exactly 32 bytes —
 * a short key is rejected rather than padded, since padding it would produce
 * a working cipher with a fraction of the intended strength and nothing would
 * ever say so.
 */
function readKey(varName: string, raw: string): SecretKey {
  let key: Buffer;

  const isHex = /^[0-9a-fA-F]+$/.test(raw) && raw.length === KEY_BYTES * 2;
  try {
    key = isHex ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  } catch {
    throw new Error(
      `SECRET_KEY_MALFORMED: ${varName} is neither valid base64 nor 64 hex characters.`,
    );
  }

  if (key.length !== KEY_BYTES) {
    throw new Error(
      `SECRET_KEY_WRONG_LENGTH: ${varName} decoded to ${key.length} bytes, need ${KEY_BYTES}. `
      + `Generate one with: openssl rand -base64 32`,
    );
  }

  const id = crypto.createHash('sha256').update(key).digest('hex').slice(0, 8);
  return { key, id };
}

let cachedCurrent:  SecretKey | null = null;
let cachedPrevious: SecretKey | null | undefined; // undefined = not yet looked at

/**
 * The key in force. Throws if unset — this is deliberately not optional.
 *
 * A default key would mean every deployment that forgot to set one shares it,
 * which is the same as no encryption while looking exactly like encryption.
 */
export function currentKey(): SecretKey {
  if (cachedCurrent) return cachedCurrent;

  const raw = process.env.TENANT_SECRET_KEY;
  if (!raw) {
    throw new Error(
      'SECRET_KEY_NOT_CONFIGURED: TENANT_SECRET_KEY is not set, so tenant secrets '
      + 'cannot be encrypted or read. Generate one with `openssl rand -base64 32` '
      + 'and set it in the environment. Do not commit it.',
    );
  }

  cachedCurrent = readKey('TENANT_SECRET_KEY', raw);
  return cachedCurrent;
}

function previousKey(): SecretKey | null {
  if (cachedPrevious !== undefined) return cachedPrevious;

  const raw = process.env.TENANT_SECRET_KEY_PREVIOUS;
  cachedPrevious = raw ? readKey('TENANT_SECRET_KEY_PREVIOUS', raw) : null;
  return cachedPrevious;
}

/** Tests and key rotation only — forget what was read from env. */
export function resetKeyCache(): void {
  cachedCurrent  = null;
  cachedPrevious = undefined;
}

/**
 * Is encryption available at all? For a health check or a startup warning, so
 * an operator learns the key is missing then rather than when the first
 * tenant tries to save a key.
 */
export function isConfigured(): boolean {
  try {
    currentKey();
    return true;
  } catch {
    return false;
  }
}

/* ── Encrypt / decrypt ───────────────────────────────────────────────────── */

/**
 * Seal a secret with the current key. Returns the stored format above.
 *
 * Refuses an empty string: storing one means a provider row that looks
 * configured and holds no credential, which fails later at the API call with
 * a 401 that points at the tenant's provider rather than at us.
 */
export function encryptSecret(plaintext: string): string {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('SECRET_EMPTY: refusing to encrypt an empty secret.');
  }

  const { key, id } = currentKey();
  const iv = crypto.randomBytes(IV_BYTES);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    SCHEME,
    id,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join('.');
}

/**
 * Open a sealed secret. Tries the current key, then the previous one if a
 * rotation is in progress.
 *
 * Every failure names its own cause. "Unable to authenticate data" — what
 * GCM throws for a wrong key, a tampered value and a truncated value alike —
 * is useless at 2am, so the wrong-key case is detected from the key_id before
 * the cipher is even built.
 */
export function decryptSecret(stored: string): string {
  if (typeof stored !== 'string' || stored.length === 0) {
    throw new Error('SECRET_EMPTY: nothing to decrypt.');
  }

  const parts = stored.split('.');
  if (parts.length !== 5) {
    throw new Error(
      `SECRET_MALFORMED: expected 5 dot-separated parts, got ${parts.length}. `
      + `This value was not produced by encryptSecret.`,
    );
  }

  const [scheme, keyId, ivB64, tagB64, ctB64] = parts;

  if (scheme !== SCHEME) {
    throw new Error(
      `SECRET_SCHEME_UNKNOWN: value is scheme '${scheme}', this build understands '${SCHEME}'.`,
    );
  }

  const candidates: SecretKey[] = [];
  const current = currentKey();
  if (current.id === keyId) candidates.push(current);

  const previous = previousKey();
  if (previous && previous.id === keyId) candidates.push(previous);

  if (candidates.length === 0) {
    throw new Error(
      `SECRET_KEY_MISMATCH: this value was sealed with key '${keyId}', but the `
      + `current key is '${current.id}'`
      + (previous ? ` and TENANT_SECRET_KEY_PREVIOUS is '${previous.id}'` : '')
      + `. Set TENANT_SECRET_KEY_PREVIOUS to the key that sealed it, or re-enter `
      + `the secret. It cannot be recovered without that key.`,
    );
  }

  const iv  = Buffer.from(ivB64,  'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct  = Buffer.from(ctB64,  'base64');

  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error(
      `SECRET_MALFORMED: iv is ${iv.length} bytes (need ${IV_BYTES}), `
      + `tag is ${tag.length} bytes (need ${TAG_BYTES}).`,
    );
  }

  const { key } = candidates[0];
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    // key_id matched, so this is tampering or corruption, not the wrong key.
    throw new Error(
      `SECRET_TAMPERED: authentication failed for a value sealed with key '${keyId}', `
      + `which is the key in use. The stored ciphertext has been altered or truncated.`,
    );
  }
}

/* ── Rotation support ────────────────────────────────────────────────────── */

/** Which key sealed this value, without opening it. */
export function keyIdOf(stored: string): string | null {
  const parts = stored?.split('.');
  return parts?.length === 5 && parts[0] === SCHEME ? parts[1] : null;
}

/** True when this value is sealed with something other than the current key. */
export function needsRotation(stored: string): boolean {
  const id = keyIdOf(stored);
  return id !== null && id !== currentKey().id;
}

/** Open with whichever key applies, re-seal with the current one. */
export function rotateSecret(stored: string): string {
  return encryptSecret(decryptSecret(stored));
}

/* ── Display ─────────────────────────────────────────────────────────────── */

/**
 * A safe echo of a secret: `sk-a…7f3c`. Never the whole thing.
 *
 * Exists so the settings screen can show the tenant WHICH key is saved
 * without the API ever returning it. Anything under 12 characters is fully
 * masked — a short key is mostly prefix, and half of a short key is most of
 * a short key.
 */
export function maskSecret(plaintext: string): string {
  if (!plaintext) return '';
  if (plaintext.length < 12) return '•'.repeat(8);
  return `${plaintext.slice(0, 4)}…${plaintext.slice(-4)}`;
}
