'use client';
/**
 * Edge's own primitives — the reference's `src/mission/ui.js` and
 * `src/components.js` as components. Class names are the reference's, so the
 * scoped stylesheet (edge.css) applies unchanged; that is what keeps the
 * console's Edge pixel-identical to the prototype.
 */
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

type Kind = 'primary' | 'secondary' | 'text' | 'lime' | 'selected' | '';

export function Btn({ kind = 'primary', className = '', type = 'button', children, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { kind?: Kind }) {
  return <button type={type} className={`btn ${kind} ${className}`.trim()} {...rest}>{children}</button>;
}

export function Intro({ step, title, sub }: { step: string; title: ReactNode; sub: ReactNode }) {
  return (
    <div className="page-heading">
      <div className="eyebrow">EDGE AGENT / {step}</div>
      <h1>{title}</h1>
      <p>{sub}</p>
    </div>
  );
}

export function Input({ label, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return <label className="field">{label}<input {...rest} /></label>;
}

export function Area({ label, hint = '', rows = 3, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: ReactNode; hint?: string }) {
  return <label className="field">{label}<textarea rows={rows} placeholder={hint} maxLength={2000} {...rest} /></label>;
}

/** Back / Continue bar. `onNext` omitted renders a submit button for the enclosing form. */
export function Foot({ label = 'Confirm & continue', onBack, onNext }: { label?: string; onBack: () => void; onNext?: () => void }) {
  return (
    <div className="step-actions">
      <Btn kind="text" onClick={onBack}>← Back</Btn>
      {onNext ? <Btn onClick={onNext}>{label} →</Btn> : <Btn type="submit">{label} →</Btn>}
    </div>
  );
}

export function Orb() {
  return <span className="orb" aria-hidden="true"><i /></span>;
}

export function Agent({ title, text }: { title: ReactNode; text: ReactNode }) {
  return (
    <div className="vani-note"><Orb /><div><strong>{title}</strong><p>{text}</p></div></div>
  );
}

export function Choice({ values, selected, onToggle }: { values: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="chips">
      {values.map((v) => (
        <Btn key={v} kind={selected.includes(v) ? 'selected' : 'secondary'} aria-pressed={selected.includes(v)} onClick={() => onToggle(v)}>{v}</Btn>
      ))}
    </div>
  );
}

export function Status({ children }: { children: ReactNode }) {
  return <span className="tag">{children}</span>;
}

export function Help({ topic, onAssist }: { topic: string; onAssist: (topic: string) => void }) {
  return <Btn kind="text" onClick={() => onAssist(topic)}>Get help with {topic} ↗</Btn>;
}
