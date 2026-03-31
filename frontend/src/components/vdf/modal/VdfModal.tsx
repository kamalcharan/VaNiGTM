'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import s from './VdfModal.module.css';

export interface VdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg';
}

export function VdfModal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'md',
}: VdfModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

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
    <div
      ref={overlayRef}
      className={s.overlay}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className={`${s.card} ${s[width]}`} role="dialog" aria-modal="true">
        {(title || subtitle) && (
          <div className={s.header}>
            {title && <h3 className={s.title}>{title}</h3>}
            {subtitle && <p className={s.subtitle}>{subtitle}</p>}
          </div>
        )}
        <div className={s.body}>{children}</div>
        {footer && <div className={s.footer}>{footer}</div>}
      </div>
    </div>
  );
}
