'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import s from './toast.module.css';

/* ── Types ───────────────────────────────────────────── */

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastOptions {
  message: string;
  type: ToastType;
  duration?: number;
  dismissible?: boolean;
}

interface Toast extends ToastOptions {
  id: string;
  exiting: boolean;
}

interface ToastContextValue {
  showToast: (options: ToastOptions) => void;
}

/* ── Context ─────────────────────────────────────────── */

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 4000;

/* ── Provider ────────────────────────────────────────── */

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
    );
    setTimeout(() => removeToast(id), 300);
  }, [removeToast]);

  const showToast = useCallback((options: ToastOptions) => {
    const id = `toast-${++counterRef.current}`;
    const duration = options.duration ?? DEFAULT_DURATION;
    const dismissible = options.dismissible ?? true;

    setToasts((prev) => {
      const next = [...prev, { ...options, id, dismissible, exiting: false }];
      // Keep only MAX_VISIBLE most recent; mark overflow for exit
      if (next.length > MAX_VISIBLE) {
        return next.slice(-MAX_VISIBLE);
      }
      return next;
    });

    if (duration > 0) {
      setTimeout(() => dismissToast(id), duration);
    }
  }, [dismissToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

/* ── Hook ────────────────────────────────────────────── */

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a <ToastProvider>');
  }
  return ctx;
}

/* ── Icons ───────────────────────────────────────────── */

const icons: Record<ToastType, string> = {
  success: '\u2713',
  error: '\u2715',
  warning: '\u26A0',
  info: '\u2139',
};

/* ── Container ───────────────────────────────────────── */

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className={s.container} aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`${s.toast} ${s[toast.type]} ${toast.exiting ? s.exit : s.enter}`}
          role="alert"
        >
          <span className={s.icon}>{icons[toast.type]}</span>
          <span className={s.message}>{toast.message}</span>
          {toast.dismissible && (
            <button
              className={s.dismiss}
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss"
            >
              &times;
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
