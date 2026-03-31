'use client';

import { useEffect, useState } from 'react';
import { VdfButton } from '@/components/vdf';
import s from './Navbar.module.css';

interface NavLink {
  label: string;
  href: string;
  isCta?: boolean;
}

interface NavbarProps {
  brandName: string;
  brandIcon?: React.ReactNode;
  links: NavLink[];
}

export default function Navbar({ brandName, brandIcon, links }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className={`${s.nav} ${scrolled ? s.scrolled : ''}`}>
      <a href="#" className={s.brand}>
        <div className={s.iconBox}>
          {brandIcon || (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          )}
        </div>
        <span className={s.name}>{brandName}</span>
      </a>

      <ul className={`${s.links} ${mobileOpen ? s.show : ''}`}>
        {links.map((link) =>
          link.isCta ? (
            <li key={link.href}>
              <VdfButton variant="outline" size="sm" href={link.href} className={s.cta}>
                {link.label}
              </VdfButton>
            </li>
          ) : (
            <li key={link.href}>
              <a href={link.href} className={s.link} onClick={() => setMobileOpen(false)}>
                {link.label}
              </a>
            </li>
          )
        )}
      </ul>

      <button
        className={s.toggle}
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle navigation"
      >
        <span /><span /><span />
      </button>
    </nav>
  );
}
