'use client';

/**
 * Toasts — the console's single channel for "something happened".
 *
 * API-compatible with VaNiGTM's frontend/src/components/toast.tsx:
 * `useToast().showToast({ message, type, duration, dismissible })`, the same
 * four types, the same three-deep stack. The shorthands and the `detail` line
 * are additions; nothing ported from there needs editing.
 *
 * Mandatory, not optional: every mutation reports its outcome here. A silent
 * success is indistinguishable from a silent failure, and users resolve that
 * ambiguity by clicking the button again — which is how duplicate writes get
 * made. See CLAUDE.md, "Every screen carries the same five".
 *
 * Accessibility is the reason for the split live regions. Errors are assertive
 * because they change what the user should do next; success and info are polite
 * so they do not interrupt a screen reader mid-sentence.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import styles from './toast.module.css';

/** Same four types as VaNiGTM's toast.tsx, including `warning`. */
export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  message: string;
  type: ToastType;
  /** Milliseconds. 0 keeps it until dismissed. */
  duration?: number;
  dismissible?: boolean;
  /** Second line — the server's own words, a run id, a next step. */
  detail?: string;
}

interface Toast extends ToastOptions {
  id: string;
}

interface ToastContextValue {
  /** VaNiGTM's signature, kept verbatim so ported code compiles unchanged. */
  showToast: (options: ToastOptions) => string;
  success: (message: string, detail?: string) => string;
  error: (message: string, detail?: string) => string;
  warning: (message: string, detail?: string) => string;
  info: (message: string, detail?: string) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_VISIBLE = 3;

const DEFAULTS: Record<ToastType, number> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  // 0 = stays until dismissed. An error that vanishes before it is read is
  // worse than no error, because the user then believes the action succeeded.
  // This is the one place we deviate from VaNiGTM's flat 4s default, and the
  // deviation is the point.
  error: 0,
};

/** Monotonic, not random: ids must be stable and Math.random is banned in some runners. */
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
    setToasts((list) => list.filter((x) => x.id !== id));
  }, []);

  const showToast = useCallback(
    (input: ToastOptions) => {
      const id = `toast-${++seq}`;
      const duration = input.duration ?? DEFAULTS[input.type];
      setToasts((list) => {
        // Collapse an identical message rather than stacking it. Retries and
        // double-clicks otherwise produce a wall of the same sentence.
        if (list.some((x) => x.type === input.type && x.message === input.message)) return list;
        return [...list, { ...input, id }].slice(-MAX_VISIBLE);
      });
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  // Clear every pending timer on unmount — a fired timer against an unmounted
  // provider is a setState-after-unmount warning and a small leak.
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach(clearTimeout);
      map.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      showToast,
      dismiss,
      success: (message, detail) => showToast({ type: 'success', message, detail }),
      error: (message, detail) => showToast({ type: 'error', message, detail }),
      warning: (message, detail) => showToast({ type: 'warning', message, detail }),
      info: (message, detail) => showToast({ type: 'info', message, detail }),
    }),
    [showToast, dismiss],
  );

  const polite = toasts.filter((t) => t.type !== 'error');
  const assertive = toasts.filter((t) => t.type === 'error');

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.dock}>
        <Region toasts={polite} live="polite" onDismiss={dismiss} />
        <Region toasts={assertive} live="assertive" onDismiss={dismiss} />
      </div>
    </ToastContext.Provider>
  );
}

function Region({
  toasts,
  live,
  onDismiss,
}: {
  toasts: Toast[];
  live: 'polite' | 'assertive';
  onDismiss: (id: string) => void;
}) {
  return (
    <div aria-live={live} aria-atomic="false" className={styles.region}>
      {toasts.map((t) => (
        <div key={t.id} className={`${styles.toast} ${styles[t.type]}`} role="status">
          <span className={styles.glyph} aria-hidden="true">
            {t.type === 'success' ? '✓' : t.type === 'error' ? '⚠' : t.type === 'warning' ? '!' : '›'}
          </span>
          <div className={styles.body}>
            <div className={styles.msg}>{t.message}</div>
            {t.detail && <div className={styles.detail}>{t.detail}</div>}
          </div>
          {t.dismissible !== false && (
            <button
              type="button"
              className={styles.close}
              onClick={() => onDismiss(t.id)}
              aria-label="Dismiss"
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}
