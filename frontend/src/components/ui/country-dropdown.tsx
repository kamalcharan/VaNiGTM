'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import s from './country-dropdown.module.css';

/* ── Types ───────────────────────────────────────────── */

export interface Country {
  code: string;      // ISO 3166-1 alpha-2 lowercase (e.g. "in")
  dial_code: string;  // e.g. "+91"
  name: string;
}

interface CountryDropdownProps {
  value?: string;                     // country code
  onChange: (country: Country) => void;
  disabled?: boolean;
  error?: string;
}

/* ── Country list ────────────────────────────────────── */

const COUNTRIES: Country[] = [
  { code: 'in', dial_code: '+91', name: 'India' },
  { code: 'us', dial_code: '+1', name: 'United States' },
  { code: 'gb', dial_code: '+44', name: 'United Kingdom' },
  { code: 'ae', dial_code: '+971', name: 'UAE' },
  { code: 'sg', dial_code: '+65', name: 'Singapore' },
  { code: 'au', dial_code: '+61', name: 'Australia' },
  { code: 'ca', dial_code: '+1', name: 'Canada' },
  { code: 'de', dial_code: '+49', name: 'Germany' },
  { code: 'fr', dial_code: '+33', name: 'France' },
  { code: 'jp', dial_code: '+81', name: 'Japan' },
  { code: 'cn', dial_code: '+86', name: 'China' },
  { code: 'kr', dial_code: '+82', name: 'South Korea' },
  { code: 'br', dial_code: '+55', name: 'Brazil' },
  { code: 'za', dial_code: '+27', name: 'South Africa' },
  { code: 'ng', dial_code: '+234', name: 'Nigeria' },
  { code: 'ke', dial_code: '+254', name: 'Kenya' },
  { code: 'sa', dial_code: '+966', name: 'Saudi Arabia' },
  { code: 'my', dial_code: '+60', name: 'Malaysia' },
  { code: 'id', dial_code: '+62', name: 'Indonesia' },
  { code: 'th', dial_code: '+66', name: 'Thailand' },
  { code: 'nz', dial_code: '+64', name: 'New Zealand' },
  { code: 'hk', dial_code: '+852', name: 'Hong Kong' },
  { code: 'ph', dial_code: '+63', name: 'Philippines' },
  { code: 'it', dial_code: '+39', name: 'Italy' },
  { code: 'es', dial_code: '+34', name: 'Spain' },
];

/* ── Flag image ──────────────────────────────────────── */

function Flag({ code }: { code: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <span className={s.flagFallback}>{code.toUpperCase()}</span>;
  }

  return (
    <img
      src={`https://flagcdn.com/w20/${code}.png`}
      srcSet={`https://flagcdn.com/w40/${code}.png 2x`}
      width={20}
      height={15}
      alt={code}
      className={s.flag}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/* ── Component ───────────────────────────────────────── */

export default function CountryDropdown({
  value = 'in',
  onChange,
  disabled = false,
  error,
}: CountryDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [focusIdx, setFocusIdx] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = COUNTRIES.find((c) => c.code === value) || COUNTRIES[0];

  const filtered = search
    ? COUNTRIES.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.dial_code.includes(search),
      )
    : COUNTRIES;

  /* ── Open / close ──────────────────────────────────── */

  const openDropdown = useCallback(() => {
    if (disabled) return;
    setOpen(true);
    setSearch('');
    setFocusIdx(-1);
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [disabled]);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setSearch('');
    setFocusIdx(-1);
  }, []);

  const selectCountry = useCallback(
    (country: Country) => {
      onChange(country);
      closeDropdown();
    },
    [onChange, closeDropdown],
  );

  /* ── Click outside ─────────────────────────────────── */

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, closeDropdown]);

  /* ── Scroll focused item into view ─────────────────── */

  useEffect(() => {
    if (focusIdx < 0 || !listRef.current) return;
    const item = listRef.current.children[focusIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [focusIdx]);

  /* ── Keyboard ──────────────────────────────────────── */

  function handleKeyDown(e: KeyboardEvent) {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        openDropdown();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusIdx((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusIdx((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (focusIdx >= 0 && filtered[focusIdx]) {
          selectCountry(filtered[focusIdx]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        closeDropdown();
        break;
    }
  }

  return (
    <div
      ref={containerRef}
      className={`${s.container} ${error ? s.hasError : ''}`}
      onKeyDown={handleKeyDown}
    >
      {/* ── Trigger button ── */}
      <button
        type="button"
        className={`${s.trigger} ${open ? s.triggerOpen : ''}`}
        onClick={() => (open ? closeDropdown() : openDropdown())}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Flag code={selected.code} />
        <span className={s.dialCode}>{selected.dial_code}</span>
        <span className={s.chevron}>
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div className={s.dropdown} role="listbox">
          <div className={s.searchWrap}>
            <input
              ref={searchRef}
              type="text"
              className={s.searchInput}
              placeholder="Search country..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setFocusIdx(-1);
              }}
            />
          </div>
          <div className={s.list} ref={listRef}>
            {filtered.length === 0 && (
              <div className={s.empty}>No results</div>
            )}
            {filtered.map((country, idx) => (
              <div
                key={country.code}
                className={`${s.option} ${country.code === selected.code ? s.optionSelected : ''} ${idx === focusIdx ? s.optionFocused : ''}`}
                role="option"
                aria-selected={country.code === selected.code}
                onClick={() => selectCountry(country)}
                onMouseEnter={() => setFocusIdx(idx)}
              >
                <Flag code={country.code} />
                <span className={s.optionName}>{country.name}</span>
                <span className={s.optionDial}>{country.dial_code}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className={s.error} role="alert">{error}</div>
      )}
    </div>
  );
}
