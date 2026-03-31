'use client';

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';
import { COUNTRIES, getCountryByCode, validateMobile, type CountryConfig } from '@/constants/countries';
import s from './VdfMobileInput.module.css';

export interface VdfMobileInputProps {
  countryCode: string;
  mobile: string;
  onCountryChange: (code: string) => void;
  onMobileChange: (mobile: string) => void;
  error?: string;
  disabled?: boolean;
  label?: string;
}

export function VdfMobileInput({
  countryCode,
  mobile,
  onCountryChange,
  onMobileChange,
  error,
  disabled = false,
  label = 'Phone Number',
}: VdfMobileInputProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const country = getCountryByCode(countryCode) ?? COUNTRIES[0];

  // Filtered list based on search
  const filtered = search.trim()
    ? COUNTRIES.filter((c) => {
        const q = search.toLowerCase();
        return c.name.toLowerCase().includes(q) || c.dial_code.includes(q);
      })
    : COUNTRIES;

  // Click outside closes dropdown
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open) {
      setSearch('');
      setHighlightIdx(0);
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  // Scroll highlighted option into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[highlightIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx, open]);

  const selectCountry = useCallback(
    (c: CountryConfig) => {
      onCountryChange(c.code);
      onMobileChange('');
      setOpen(false);
    },
    [onCountryChange, onMobileChange],
  );

  // Keyboard navigation for dropdown
  const handleDropdownKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((prev) => Math.min(prev + 1, filtered.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlightIdx]) {
        selectCountry(filtered[highlightIdx]);
      }
    }
  };

  // Strip non-digits from mobile input
  const handleMobileChange = (value: string) => {
    const digits = value.replace(/\D/g, '');
    onMobileChange(digits);
  };

  // Validation hint from country config
  const validationError = mobile ? validateMobile(countryCode, mobile) : null;
  const displayError = error || validationError;

  return (
    <div className={s.wrap} ref={wrapRef}>
      {label && <span className={s.label}>{label}</span>}

      <div className={s.row}>
        {/* Country selector button */}
        <button
          type="button"
          className={`${s.countryBtn} ${open ? s.countryBtnOpen : ''} ${disabled ? s.countryBtnDisabled : ''}`}
          onClick={() => !disabled && setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={disabled}
        >
          <span className={s.flag}>{country.flag}</span>
          <span className={s.dialCode}>{country.dial_code}</span>
          <span className={`${s.chevron} ${open ? s.chevronOpen : ''}`}>&#9662;</span>
        </button>

        {/* Dropdown */}
        {open && (
          <div className={s.dropdown} role="listbox">
            <div className={s.searchWrap}>
              <input
                ref={searchRef}
                className={s.searchInput}
                type="text"
                placeholder="Search country..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setHighlightIdx(0);
                }}
                onKeyDown={handleDropdownKeyDown}
              />
            </div>
            <div className={s.optionList} ref={listRef}>
              {filtered.map((c, idx) => (
                <div
                  key={c.code}
                  className={`${s.option} ${idx === highlightIdx ? s.optionHighlighted : ''} ${c.code === countryCode ? s.optionActive : ''}`}
                  role="option"
                  aria-selected={c.code === countryCode}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  onClick={() => selectCountry(c)}
                >
                  <span className={s.optionFlag}>{c.flag}</span>
                  <span className={s.optionName}>{c.name}</span>
                  <span className={s.optionDial}>{c.dial_code}</span>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className={s.option} style={{ cursor: 'default', color: 'var(--color-muted)' }}>
                  No results
                </div>
              )}
            </div>
          </div>
        )}

        {/* Mobile input */}
        <input
          type="tel"
          className={`${s.mobileInput} ${disabled ? s.mobileInputDisabled : ''} ${displayError ? s.mobileInputError : ''}`}
          placeholder={country.placeholder}
          value={mobile}
          onChange={(e) => handleMobileChange(e.target.value)}
          disabled={disabled}
          maxLength={country.mobileLength + 2}
          aria-label="Mobile number"
        />
      </div>

      {/* Hint */}
      {!displayError && country.mobileHint && (
        <span className={s.hint}>{country.mobileHint}</span>
      )}

      {/* Error */}
      {displayError && <span className={s.error}>{displayError}</span>}
    </div>
  );
}
