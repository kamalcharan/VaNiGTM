'use client';
/** The Ask Edge chat panel — reference `renderChat()`; scripted answers from mission/ask.ts. */
import { useEffect, useRef, type FormEvent } from 'react';
import { useMission } from '../mission/MissionProvider';
import { answer } from '../mission/ask';
import { Btn } from '../ui';

const SUGGESTIONS = ['Why are you asking?', 'What should I attach?', 'Who can help?'];

export function AskEdge() {
  const { m, stage, chapters, chatOpen, setChatOpen, update } = useMission();
  const body = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!chatOpen) return;
    input.current?.focus();
    if (body.current) body.current.scrollTop = 1e6;
  }, [chatOpen, m.chat.length]);

  if (!chatOpen) return null;

  const ask = (q: string) => {
    const a = answer(m, chapters, stage, q);
    update((d) => { d.chat.push({ role: 'user', text: q }, { role: 'assistant', text: a }); });
  };
  const onSubmit = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const q = String(new FormData(ev.currentTarget).get('question') || '').trim();
    if (!q) return;
    ask(q);
    ev.currentTarget.reset();
  };

  return (
    <section className="chat-panel" id="edge-chat" aria-label="Ask Edge">
      <div className="chat-head">
        <div><strong>Edge Agent</strong><small>{stage < 0 ? 'Your mission' : chapters[stage]?.[0]} · contextual preview guide</small></div>
        <button type="button" className="close" onClick={() => setChatOpen(false)} aria-label="Close chat">×</button>
      </div>
      <div className="chat-body" aria-live="polite" ref={body}>
        <div className="message">I can explain this step, help you prepare evidence or clarify what remains unconfirmed. Your main mission stays where you left it.</div>
        {m.chat.map((x, i) => <div key={i} className={`message ${x.role === 'user' ? 'user' : ''}`}>{x.text}</div>)}
        <div className="chat-suggestions">
          {SUGGESTIONS.map((q) => <Btn key={q} kind="text" onClick={() => ask(q)}>{q}</Btn>)}
        </div>
      </div>
      <form id="chat-form" className="chat-form" onSubmit={onSubmit}>
        <input ref={input} name="question" required maxLength={1000} aria-label="Your question" placeholder="Ask about this step…" />
        <button type="submit" className="btn primary" aria-label="Send question">↑</button>
      </form>
      <div className="chat-disclaimer">Scripted UX preview · No live LLM</div>
    </section>
  );
}
