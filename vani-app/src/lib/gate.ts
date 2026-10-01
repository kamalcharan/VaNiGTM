/**
 * The signup gate.
 *
 * Operator-provisioned does not have to mean operator-typed. Anyone holding
 * the shared phrase can create their own tenant from the UI; anyone without it
 * never sees the form. That keeps provisioning deliberate without putting a
 * person in the middle of every account.
 *
 * WHAT THIS IS NOT: a security boundary. This code ships to the browser, so
 * the check runs on the client and the guard on /signup is client-side too.
 * The phrase is stored as a SHA-256 digest rather than plaintext, which stops
 * a casual read of the bundle from yielding it — but a determined reader can
 * still bypass the screen, and POST /api/v1/auth/register is open on the API
 * regardless of what this file does.
 *
 * It is a front door, not a lock. The real fix is a server-issued invite code
 * checked inside register(), which is backend work in VaNiGTM and is logged in
 * the build plan rather than faked here.
 */

/** SHA-256 of the shared phrase. Rotate by replacing this digest. */
const GATE_DIGEST = 'd5a43c7b5ff34c59d1a59b5d680ea00a6da7d7e10de9398a9a26eba14a6d630d';

/**
 * Session-scoped, deliberately. Closing the tab closes the gate again — a
 * shared or borrowed machine should not leave signup standing open.
 */
const GATE_KEY = 'vani.gate';

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** True if the phrase matches. Trims and lowercases — it is spoken, not typed exactly. */
export async function checkGatePhrase(phrase: string): Promise<boolean> {
  if (!phrase.trim()) return false;
  return (await sha256Hex(phrase.trim().toLowerCase())) === GATE_DIGEST;
}

export function markGatePassed(): void {
  try {
    sessionStorage.setItem(GATE_KEY, '1');
  } catch {
    /* storage disabled — the caller navigates anyway; the guard will re-ask */
  }
}

export function isGatePassed(): boolean {
  try {
    return sessionStorage.getItem(GATE_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearGate(): void {
  try {
    sessionStorage.removeItem(GATE_KEY);
  } catch {
    /* nothing to clear */
  }
}
