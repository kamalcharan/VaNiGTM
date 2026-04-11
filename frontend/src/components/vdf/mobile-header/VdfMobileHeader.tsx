'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/auth-provider';
import { NAV_ITEMS, getActiveNavId } from '@/config/nav';
import s from './VdfMobileHeader.module.css';

export interface VdfMobileHeaderProps {
  onMenuOpen: () => void;
}

export function VdfMobileHeader({ onMenuOpen }: VdfMobileHeaderProps) {
  const pathname = usePathname();
  const { isLive } = useAuth();

  const activeId  = getActiveNavId(pathname);
  const pageTitle = NAV_ITEMS.find(item => item.id === activeId)?.label ?? 'ProKey';

  return (
    <header className={s.header}>
      <button className={s.menuBtn} onClick={onMenuOpen} aria-label="Open navigation">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" width="20" height="20">
          <line x1="3" y1="6"  x2="21" y2="6"  />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      <div className={s.logoMark}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="15" height="15">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      </div>

      <span className={s.title}>{pageTitle}</span>

      <span className={`${s.envPill} ${isLive ? s.live : s.test}`}>
        <span className={s.dot} />
        {isLive ? 'LIVE' : 'TEST'}
      </span>
    </header>
  );
}
