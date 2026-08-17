'use client';

/**
 * Writes. Reads are `useSkillQuery`; anything that changes state comes through
 * here, and gets four guarantees the caller does not have to remember.
 *
 * 1. NO DOUBLE SUBMIT. While a mutation is in flight, further calls are
 *    refused outright rather than queued. Disabling the button is a courtesy;
 *    this is the guarantee, because a button is not the only thing that can
 *    fire a mutation (Enter key, a retry, a second tab).
 *
 * 2. IDEMPOTENCY KEY. One key is minted per logical attempt and reused across
 *    retries of that attempt. A network timeout that actually succeeded must
 *    not become two rows when the user presses the button again.
 *
 *    The key is sent as `Idempotency-Key`. VaNiGTM's backend does not honour it
 *    yet — the header is inert until a write path stores and replays it. This
 *    is deliberate: the client half is the half that has to exist first, and
 *    shipping it now means the backend change is a backend change only. Until
 *    then, treat idempotency as CLIENT-SIDE ONLY and do not describe a write as
 *    safe to retry. Tracked in the build plan.
 *
 * 3. NO STALE WRITES. A response that arrives after a newer attempt started, or
 *    after the component unmounted, is dropped rather than applied. Late
 *    responses landing on a screen the user has moved past is the classic
 *    async race, and it silently resurrects old state.
 *
 * 4. IT ALWAYS SAYS SOMETHING. Success and failure both raise a toast. A silent
 *    outcome is the thing that makes users click twice.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/platform/feedback';
import { getSkillTransport, type SkillResult } from './useSkill';

export interface SkillMutationOptions<T> {
  /** Shown on success. Omit for none — but say why in a comment if you do. */
  successMessage?: string | ((data: T) => string);
  /** Prefix for the failure toast. The server's own message becomes the detail. */
  errorMessage?: string;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

/** Monotonic per session. Not random: reproducible, and no Math.random. */
let attemptSeq = 0;

function mintIdempotencyKey(skill: string, fn: string): string {
  return `${skill}.${fn}.${++attemptSeq}.${Date.now().toString(36)}`;
}

export function useSkillMutation<T = unknown>(
  skill: string,
  fn: string,
  options: SkillMutationOptions<T> = {},
) {
  const toast = useToast();
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Guarded by a ref, not by state: state updates are async, so two calls in
  // the same tick would both read `isPending === false` and both proceed.
  const inFlight = useRef(false);
  const attemptId = useRef(0);
  const mounted = useRef(true);
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const mutate = useCallback(
    async (params: Record<string, unknown> = {}, opts: { retryOf?: string } = {}) => {
      if (inFlight.current) return null;

      const transport = getSkillTransport();
      if (!transport) {
        const e = new Error('No skill transport configured.');
        setError(e);
        toast.error('This action is not wired up yet.', e.message);
        return null;
      }

      // Reuse the key when retrying the same logical attempt; mint a new one
      // when the user is genuinely doing the thing again.
      idempotencyKey.current = opts.retryOf ?? mintIdempotencyKey(skill, fn);

      inFlight.current = true;
      const attempt = ++attemptId.current;
      setPending(true);
      setError(null);

      try {
        const result = (await transport(skill, fn, {
          ...params,
          idempotency_key: idempotencyKey.current,
        })) as SkillResult<T>;

        // Superseded or unmounted — drop it. Applying this would overwrite a
        // newer result with an older one.
        if (attempt !== attemptId.current || !mounted.current) return null;

        // success:false arrives with HTTP 200. Failing to check it is how a
        // refusal gets reported as a success.
        if (!result.success) throw new Error(result.error || 'The action was refused.');

        const msg =
          typeof options.successMessage === 'function'
            ? options.successMessage(result.data)
            : options.successMessage;
        if (msg) toast.success(msg);
        options.onSuccess?.(result.data);
        return result.data;
      } catch (err) {
        if (attempt !== attemptId.current || !mounted.current) return null;
        const e = err instanceof Error ? err : new Error('Something went wrong.');
        setError(e);
        toast.error(options.errorMessage ?? 'That did not go through.', e.message);
        options.onError?.(e);
        return null;
      } finally {
        inFlight.current = false;
        if (mounted.current && attempt === attemptId.current) setPending(false);
      }
    },
    [skill, fn, toast, options],
  );

  /** Retry the last attempt under its original key — safe once the backend honours it. */
  const retry = useCallback(
    (params: Record<string, unknown> = {}) =>
      mutate(params, { retryOf: idempotencyKey.current ?? undefined }),
    [mutate],
  );

  return { mutate, retry, isPending, error };
}
