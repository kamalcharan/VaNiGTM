'use client';

import { useEffect, useState } from 'react';
import { useTheme } from '@/config/theme';
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const { themeId, colorMode, setTheme, toggleColorMode, themes } = useTheme();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`.${s.themePicker}`)) setPickerOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [pickerOpen]);

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

      <div className={s.navActions}>
        {/* Theme picker toggle */}
        <div className={s.themePicker}>
          <button
            className={s.themeToggleBtn}
            onClick={(e) => { e.stopPropagation(); setPickerOpen(!pickerOpen); }}
            aria-label="Change theme"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          </button>

          {pickerOpen && (
            <div className={s.pickerDropdown}>
              <div className={s.pickerHeader}>
                <span className={s.pickerLabel}>Theme</span>
                <button className={s.modeToggle} onClick={toggleColorMode}>
                  {colorMode === 'dark' ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
                  )}
                  <span>{colorMode === 'dark' ? 'Light' : 'Dark'}</span>
                </button>
              </div>
              <div className={s.themeGrid}>
                {themes.map((t) => (
                  <button
                    key={t.id}
                    className={`${s.themeOption} ${t.id === themeId ? s.themeActive : ''}`}
                    onClick={() => setTheme(t.id)}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className={s.toggle}
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle navigation"
        >
          <span /><span /><span />
        </button>
      </div>
    </nav>
  );
}
