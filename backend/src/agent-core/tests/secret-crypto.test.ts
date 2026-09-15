/**
 * secret.crypto — what it protects, and what it refuses.
 *
 * The failure this guards against is not "encryption is wrong" — AES-GCM is
 * not going to be wrong. It is a wrong secret coming back looking right: a
 * padded key producing a working cipher at a fraction of the strength, a
 * rotation that half-finished, a decrypt that quietly returns garbage which
 * then gets sent to a tenant's paid API as a bearer token. Every test here is
 * about a failure being LOUD and correctly named (rule 12).
 */

import {
  encryptSecret,
  decryptSecret,
  needsRotation,
  rotateSecret,
  keyIdOf,
  maskSecret,
  isConfigured,
  currentKey,
  resetKeyCache,
} from '../secret.crypto';

const KEY_A = 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=';           // 32 bytes b64
const KEY_B = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // 32 bytes hex

function withKeys(current?: string, previous?: string) {
  if (current) process.env.TENANT_SECRET_KEY = current;
  else delete process.env.TENANT_SECRET_KEY;

  if (previous) process.env.TENANT_SECRET_KEY_PREVIOUS = previous;
  else delete process.env.TENANT_SECRET_KEY_PREVIOUS;

  resetKeyCache();
}

afterEach(() => withKeys(KEY_A));
beforeEach(() => withKeys(KEY_A));

describe('round trip', () => {
  it('returns exactly what went in', () => {
    const secret = 'sk-ant-api03-ZZZZ-not-a-real-key';
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it('survives unicode and length', () => {
    const secret = '🔑 ключ—key '.repeat(50);
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it('never produces the same ciphertext twice', () => {
    // A fresh IV per call. Identical output would leak that two tenants
    // configured the same key.
    const a = encryptSecret('same-secret');
    const b = encryptSecret('same-secret');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(decryptSecret(b));
  });

  it('accepts a hex key as readily as base64', () => {
    withKeys(KEY_B);
    expect(decryptSecret(encryptSecret('hex-keyed'))).toBe('hex-keyed');
  });
});

describe('stored format', () => {
  it('is self-describing: scheme, key id, iv, tag, ciphertext', () => {
    const parts = encryptSecret('x').split('.');
    expect(parts).toHaveLength(5);
    expect(parts[0]).toBe('v1');
    expect(parts[1]).toBe(currentKey().id);
    expect(parts[1]).toHaveLength(8);
  });

  it('does not leak the key through the key id', () => {
    const id = currentKey().id;
    expect(KEY_A).not.toContain(id);
    expect(Buffer.from(KEY_A, 'base64').toString('hex')).not.toContain(id);
  });

  it('does not contain the plaintext', () => {
    expect(encryptSecret('hunter2-in-the-clear')).not.toContain('hunter2');
  });
});

describe('refusals — each failure names its own cause', () => {
  it('refuses to run without a key rather than defaulting to one', () => {
    withKeys(undefined);
    expect(isConfigured()).toBe(false);
    expect(() => encryptSecret('x')).toThrow(/SECRET_KEY_NOT_CONFIGURED/);
  });

  it('rejects a short key instead of padding it', () => {
    withKeys(Buffer.from('too-short').toString('base64'));
    expect(() => encryptSecret('x')).toThrow(/SECRET_KEY_WRONG_LENGTH.*need 32/s);
  });

  it('refuses an empty secret', () => {
    expect(() => encryptSecret('')).toThrow(/SECRET_EMPTY/);
  });

  it('rejects a value that was never sealed by us', () => {
    expect(() => decryptSecret('just-a-string')).toThrow(/SECRET_MALFORMED/);
  });

  it('rejects an unknown scheme distinctly from corruption', () => {
    const v2 = encryptSecret('x').replace(/^v1\./, 'v2.');
    expect(() => decryptSecret(v2)).toThrow(/SECRET_SCHEME_UNKNOWN/);
  });

  it('says which key sealed it when the wrong key is loaded', () => {
    const sealed = encryptSecret('x');
    withKeys(KEY_B);
    // Not "unable to authenticate data" — it names both key ids.
    expect(() => decryptSecret(sealed)).toThrow(/SECRET_KEY_MISMATCH/);
  });

  it('detects tampering separately from a wrong key', () => {
    const parts = encryptSecret('x').split('.');
    parts[4] = Buffer.from('tampered-ciphertext').toString('base64');
    expect(() => decryptSecret(parts.join('.'))).toThrow(/SECRET_TAMPERED/);
  });

  it('detects a truncated payload', () => {
    const parts = encryptSecret('x').split('.');
    parts[3] = Buffer.from('short').toString('base64'); // tag no longer 16 bytes
    expect(() => decryptSecret(parts.join('.'))).toThrow(/SECRET_MALFORMED/);
  });
});

describe('rotation', () => {
  it('opens both generations while the previous key is set', () => {
    const sealedWithA = encryptSecret('carried-over');
    withKeys(KEY_B, KEY_A);
    expect(decryptSecret(sealedWithA)).toBe('carried-over');
    expect(decryptSecret(encryptSecret('freshly-sealed'))).toBe('freshly-sealed');
  });

  it('reports which values are stale, so a rotation can be finished', () => {
    const sealedWithA = encryptSecret('old');
    expect(needsRotation(sealedWithA)).toBe(false);

    withKeys(KEY_B, KEY_A);
    expect(needsRotation(sealedWithA)).toBe(true);

    const rotated = rotateSecret(sealedWithA);
    expect(needsRotation(rotated)).toBe(false);
    expect(decryptSecret(rotated)).toBe('old');
    expect(keyIdOf(rotated)).toBe(currentKey().id);
  });

  it('stops opening the old generation once the previous key is dropped', () => {
    const sealedWithA = encryptSecret('orphaned');
    withKeys(KEY_B);
    expect(() => decryptSecret(sealedWithA)).toThrow(/SECRET_KEY_MISMATCH/);
  });
});

describe('maskSecret', () => {
  it('shows enough to identify, never enough to use', () => {
    const key = 'sk-ant-api03-abcdefghijklmnop-7f3c';
    const masked = maskSecret(key);
    expect(masked).toBe('sk-a…7f3c');
    expect(masked).not.toContain('abcdefghijklmnop');
  });

  it('fully masks a short secret, where half would be most of it', () => {
    expect(maskSecret('short-key')).toBe('••••••••');
  });

  it('has nothing to say about an empty one', () => {
    expect(maskSecret('')).toBe('');
  });
});
