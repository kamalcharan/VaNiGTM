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
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
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
 * Restore a session from the httpOnly refresh cookie. Runs on every app mount,
 * which is what makes reloads and new tabs survive. Resolves false rather than
 * throwing — a failed refresh is the normal "logged out" path.
 */
export async function silentRefresh(): Promise<boolean> {
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

interface FetchOptions {
  body?: unknown;
  signal?: AbortSignal;
  /** Sent as `Idempotency-Key`. Minted per logical attempt by useSkillMutation. */
  idempotencyKey?: string;
  /** Internal: prevents a refresh/retry loop. */
  _retried?: boolean;
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

  let res: Response;
  try {
    res = await fetch(`${API_ORIGIN}${path}`, {
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
    const refreshed = await silentRefresh();
    if (refreshed) return apiRequest<T>(method, path, { ...options, _retried: true });
    clearTokens();
  }

  if (!res.ok) throw new ApiError(await readError(res), res.status);
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
