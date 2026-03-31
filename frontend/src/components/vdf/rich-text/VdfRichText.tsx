'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import s from './VdfRichText.module.css';

export interface VdfRichTextProps {
  value: string;
  onChange: (html: string) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  maxLength?: number;
  minHeight?: number;
  maxHeight?: number;
}

interface ToolbarItem {
  command: string;
  label: string;
  ariaLabel: string;
}

const TOOLBAR_ITEMS: ToolbarItem[] = [
  { command: 'bold', label: 'B', ariaLabel: 'Bold' },
  { command: 'italic', label: 'I', ariaLabel: 'Italic' },
  { command: 'underline', label: 'U', ariaLabel: 'Underline' },
  { command: 'insertUnorderedList', label: '\u2022', ariaLabel: 'Bullet list' },
  { command: 'insertOrderedList', label: '1.', ariaLabel: 'Ordered list' },
];

function isFormatActive(command: string): boolean {
  return document.queryCommandState(command);
}

function getTextLength(el: HTMLElement): number {
  return (el.textContent || '').length;
}

export function VdfRichText({
  value,
  onChange,
  label,
  placeholder,
  error,
  disabled = false,
  maxLength,
  minHeight = 80,
  maxHeight = 200,
}: VdfRichTextProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [activeFormats, setActiveFormats] = useState<Record<string, boolean>>({});
  const lastValueRef = useRef(value);

  // Sync value prop into the contentEditable div, avoiding cursor jump
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (el.innerHTML !== value && value !== lastValueRef.current) {
      el.innerHTML = value;
      lastValueRef.current = value;
    }
  }, [value]);

  // Set initial content on mount
  useEffect(() => {
    const el = editorRef.current;
    if (el && value && !el.innerHTML) {
      el.innerHTML = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateActiveFormats = useCallback(() => {
    const formats: Record<string, boolean> = {};
    for (const item of TOOLBAR_ITEMS) {
      formats[item.command] = isFormatActive(item.command);
    }
    setActiveFormats(formats);
  }, []);

  const handleInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = el.innerHTML;
    lastValueRef.current = html;
    onChange(html);
    updateActiveFormats();
  }, [onChange, updateActiveFormats]);

  const handleSelectionChange = useCallback(() => {
    updateActiveFormats();
  }, [updateActiveFormats]);

  // Listen for selection changes to update toolbar active state
  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [handleSelectionChange]);

  const execCommand = useCallback(
    (command: string) => {
      // Re-focus the editor before executing the command
      editorRef.current?.focus();
      document.execCommand(command, false);
      updateActiveFormats();
      // Trigger onChange after format change
      handleInput();
    },
    [updateActiveFormats, handleInput],
  );

  const charCount = editorRef.current ? getTextLength(editorRef.current) : 0;
  const isOverLimit = maxLength !== undefined && charCount > maxLength;

  const wrapClasses = [
    s.editorWrap,
    error ? s.editorWrapError : '',
    disabled ? s.editorWrapDisabled : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={s.wrap}>
      {label && <label className={s.label}>{label}</label>}

      <div className={wrapClasses}>
        {/* Toolbar */}
        <div className={s.toolbar} role="toolbar" aria-label="Text formatting">
          {TOOLBAR_ITEMS.map((item) => (
            <button
              key={item.command}
              type="button"
              className={`${s.toolBtn} ${activeFormats[item.command] ? s.toolBtnActive : ''}`}
              onMouseDown={(e) => {
                // Prevent blur of contentEditable
                e.preventDefault();
                execCommand(item.command);
              }}
              aria-label={item.ariaLabel}
              aria-pressed={!!activeFormats[item.command]}
              tabIndex={-1}
              style={
                item.command === 'italic'
                  ? { fontStyle: 'italic' }
                  : item.command === 'underline'
                    ? { textDecoration: 'underline' }
                    : item.command === 'bold'
                      ? { fontWeight: 700 }
                      : undefined
              }
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Editable Area */}
        <div
          ref={editorRef}
          className={s.editor}
          contentEditable={!disabled}
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={label || 'Rich text editor'}
          data-placeholder={placeholder || ''}
          onInput={handleInput}
          onKeyUp={updateActiveFormats}
          onMouseUp={updateActiveFormats}
          style={{
            minHeight: `${minHeight}px`,
            maxHeight: `${maxHeight}px`,
          }}
        />
      </div>

      {/* Footer: error + char count */}
      {(error || maxLength !== undefined) && (
        <div className={s.footer}>
          {error && (
            <span className={s.error} role="alert">
              {error}
            </span>
          )}
          {maxLength !== undefined && (
            <span className={`${s.charCount} ${isOverLimit ? s.charCountOver : ''}`}>
              {charCount} / {maxLength}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
