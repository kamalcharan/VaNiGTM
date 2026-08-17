/**
 * VaNi API client.
 *
 * Ported from VaNiGTM's frontend/src/lib/api-client.ts. The security shape is
 * kept exactly:
 *
 *   - The access token lives in memory ONLY. Never localStorage, never a
 *     readable cookie — an XSS that can read storage should not walk away with
 *     a session.
 *   - The refresh token is an httpOnly cookie the browser holds and we never
 *     see. Calls go DIRECTLY to api.vikuna.io with credentials:'include' —
 *     vani.vikuna.io and api.vikuna.io share the registrable domain, so they
 *     are same-site and SameSite=Strict still sends the cookie. Proxying
 *     through Vercel was rejected deliberately: it would replace the browser
 *     origin with Vercel's, defeating the nginx origin allowlist.
 *   - A 401 triggers exactly one silent refresh and one retry. Never a loop.
 */

import { API, type ServiceEndpoint } from './serviceURLs';

/**
 * Origin of the VaNi API on the VPS, e.g. https://api.vikuna.io. Public because
 * the browser calls it directly. Unset, requests fail closed rather than
 * resolving against this app and 404-ing confusingly.
 */
export const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? '';

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function clearTokens(): void {
  accessToken = null;
}

export class ApiError extends Error {
  readonly status: number;
  /**
   * Structured payload from `{ error: { code, message, details } }`. Ported
   * screens read it — the mission wizard's ICP approval surfaces
   * `details.missing` as "Still needed: …" instead of a generic failure.
   */
  readonly details?: Record<string, unknown>;
  /**
   * The server's machine-readable code from `{ error: { code, … } }`. Ported
   * screens branch on it — icp-builder treats `PROFILE_NOT_FOUND` as "nothing
   * built yet" rather than a failure, which is a different screen entirely.
   */
  readonly code?: string;
  constructor(
    message: string,
    status: number,
    details?: Record<string, unknown>,
    code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

/**
 * Best-effort message extraction; never leaks a raw body to the UI.
 *
 * VaNiGTM's shape is `{ error: { code, message } }` on every failure path —
 * verified against backend/src/auth/auth.routes.ts, not assumed. The bare
 * `{ error: string }` and `{ message }` forms are tolerated in case an older
 * handler is still deployed.
 */
async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    const msg =
      (typeof data?.error === 'object' ? data.error?.message : data?.error) ??
      data?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  } catch {
    /* non-JSON error body — fall through */
  }
  if (res.status === 401) return 'Email and password do not match.';
  // A 404 on an /api path means the request was served by this app rather than
  // proxied — i.e. VANI_API_ORIGIN is unset or the rewrite is not in effect.
  // Say so plainly; the generic message sends people hunting in the wrong place.
  if (res.status === 404) return 'The VaNi service is not configured for this deployment.';
  if (res.status >= 500) return 'The VaNi service is unavailable. Please try again shortly.';
  return 'Something went wrong. Please try again.';
}

/**
 * `readError` reads the body, and a body can only be read once — so the details
 * have to come out of the same pass. Kept beside it rather than folded in, so
 * the existing single-string callers are untouched.
 */
async function readErrorPayload(
  res: Response,
): Promise<{ message: string; details?: Record<string, unknown>; code?: string }> {
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    return { message: fallbackErrorMessage(res.status) };
  }
  const data = parsed as Record<string, any>;
  const errObj = typeof data?.error === 'object' && data.error !== null ? data.error : null;
  const msg = (errObj ? errObj.message : data?.error) ?? data?.message;
  const details =
    errObj && typeof errObj.details === 'object' && errObj.details !== null
      ? (errObj.details as Record<string, unknown>)
      : undefined;
  const code = typeof errObj?.code === 'string' ? errObj.code : undefined;
  if (typeof msg === 'string' && msg.trim()) return { message: msg, details, code };
  return { message: fallbackErrorMessage(res.status), details, code };
}

function fallbackErrorMessage(status: number): string {
  if (status === 401) return 'Email and password do not match.';
  // A 404 on an /api path means the request was served by this app rather than
  // proxied — i.e. the API origin is unset.
  if (status === 404) return 'The VaNi service is not configured for this deployment.';
  if (status >= 500) return 'The VaNi service is unavailable. Please try again shortly.';
  return 'Something went wrong. Please try again.';
}

/**
 * Pull the access token out of an auth response.
 *
 * /login, /register and /refresh all answer `{ tokens: { access_token, ... } }`
 * — the token is nested, not top-level. Reading `data.access_token` directly
 * yields undefined and the session silently never starts, which is exactly the
 * bug this function exists to prevent recurring.
 */
export function readAccessToken(data: unknown): string | null {
  const token = (data as { tokens?: { access_token?: unknown } })?.tokens?.access_token;
  return typeof token === 'string' && token ? token : null;
}

/**
 * In-flight refresh, shared by every concurrent caller. Null when idle.
 *
 * This is not an optimisation — it is required for correctness. VaNiGTM's
 * `refreshSession` (`backend/src/auth/token.service.ts`) ROTATES the refresh
 * token on every use: it marks the presented one
 * `is_active = false, revoked_reason = 'rotated'` and issues a replacement,
 * with no reuse grace window. So a second concurrent refresh presents a token
 * that the first one already killed, gets a hard 401, and — because a failed
 * refresh is the "logged out" path — calls `clearTokens()` and ends a session
 * that was perfectly valid.
 *
 * There are two callers, and both can fire at once:
 *   - `AuthProvider`'s bootstrap effect, which React StrictMode deliberately
 *     double-invokes in development.
 *   - the 401 handler in `apiRequest`, once per concurrent request.
 *
 * Symptom this fixes: reloading `/onboarding` logged the tenant out.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function performRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_ORIGIN}${API.auth.refresh.path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    });
    if (!res.ok) return false;
    const data = await res.json();
    const token = readAccessToken(data);
    if (!token) return false;
    setAccessToken(token);
    return true;
  } catch {
    return false;
  }
}

/**
 * Restore a session from the httpOnly refresh cookie. Runs on every app mount,
 * which is what makes reloads and new tabs survive. Resolves false rather than
 * throwing — a failed refresh is the normal "logged out" path.
 *
 * Concurrent callers share ONE request and all receive its result. Never issue
 * a bare `performRefresh()` — see `refreshInFlight` above for why a second
 * simultaneous rotation destroys the session.
 */
export function silentRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  // Cleared in a `finally` so the next genuine expiry starts a fresh request,
  // and so a rejection cannot wedge the slot shut. Assigned before the await
  // resolves, which is what makes a caller arriving mid-flight join this one.
  refreshInFlight = performRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

interface FetchOptions {
  body?: unknown;
  signal?: AbortSignal;
  /**
   * `:id`-style placeholders in the endpoint's path. Kept name-for-name with
   * VaNiGTM's apiFetch so ported screens need no edits — the mission wizard
   * calls `API.ingest.getSource` with `{ pathParams: { id } }`.
   */
  pathParams?: Record<string, string>;
  /** Appended as a query string. Same reason as pathParams. */
  queryParams?: Record<string, string>;
  /** Sent as `Idempotency-Key`. Minted per logical attempt by useSkillMutation. */
  idempotencyKey?: string;
  /** Internal: prevents a refresh/retry loop. */
  _retried?: boolean;
}

/**
 * Substitute `:name` placeholders. Ported from VaNiGTM's api-client so a screen
 * moved between the repos resolves paths identically.
 */
function resolvePath(path: string, pathParams?: Record<string, string>): string {
  if (!pathParams) return path;
  let resolved = path;
  for (const [key, value] of Object.entries(pathParams)) {
    resolved = resolved.replace(`:${key}`, encodeURIComponent(value));
  }
  return resolved;
}

/**
 * The one request path. Everything — declared endpoints and the dynamic skill
 * transport alike — goes through here, so the token handling, the single 401
 * retry and the error shaping exist in exactly one place.
 */
export async function apiRequest<T>(
  method: ServiceEndpoint['method'],
  path: string,
  options: FetchOptions & { authenticated?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  // Where the client half of the idempotency contract goes on the wire. The
  // server half — store the key with its result and replay it — is per handler.
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  // The token this request actually went out with. Compared after the response
  // so a 401 that raced a refresh is retried rather than triggering another one.
  const tokenAtSend = accessToken;

  let res: Response;
  try {
    let url = `${API_ORIGIN}${resolvePath(path, options.pathParams)}`;
    if (options.queryParams) {
      const qs = new URLSearchParams(options.queryParams).toString();
      if (qs) url += `?${qs}`;
    }
    res = await fetch(url, {
      method,
      headers,
      credentials: 'include',
      signal: options.signal,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    // Network-level failure — most often the API origin is unset or unreachable.
    throw new ApiError('Cannot reach the VaNi service. Check your connection.', 0);
  }

  if (res.status === 401 && options.authenticated !== false && !options._retried) {
    // A refresh already landed while we were in flight, so this 401 is stale —
    // it was answered against the previous token. Retry on the new one instead
    // of refreshing again; every extra refresh is another rotation.
    if (accessToken && accessToken !== tokenAtSend) {
      return apiRequest<T>(method, path, { ...options, _retried: true });
    }
    const refreshed = await silentRefresh();
    if (refreshed) return apiRequest<T>(method, path, { ...options, _retried: true });
    clearTokens();
  }

  if (!res.ok) {
    const { message, details, code } = await readErrorPayload(res);
    throw new ApiError(message, res.status, details, code);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function apiFetch<T>(
  endpoint: ServiceEndpoint,
  options: FetchOptions = {},
): Promise<T> {
  return apiRequest<T>(endpoint.method, endpoint.path, {
    ...options,
    authenticated: endpoint.auth,
  });
}
