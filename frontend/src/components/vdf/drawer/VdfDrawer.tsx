'use client';

import { useEffect, type ReactNode } from 'react';
import s from './VdfDrawer.module.css';

export interface VdfDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Width of the drawer panel. Default: 480px */
  width?: number;
}

export function VdfDrawer({ isOpen, onClose, title, subtitle, children, footer, width = 480 }: VdfDrawerProps) {
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={s.overlay} onClick={onClose} aria-modal="true" role="dialog">
      <div
        className={s.drawer}
        style={{ width }}
        onClick={e => e.stopPropagation()}
      >
        <div className={s.header}>
          <div>
            <h2 className={s.title}>{title}</h2>
            {subtitle && <p className={s.subtitle}>{subtitle}</p>}
          </div>
          <button className={s.close} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={s.body}>
          {children}
        </div>

        {footer && (
          <div className={s.footer}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
