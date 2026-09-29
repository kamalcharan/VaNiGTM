'use client';
/**
 * Edge's chrome — the reference's `render()` in `src/mission/main.js`:
 * topbar (wordmark, Ask Edge, preview pill, allowance, save & pause), the
 * page, the footer, the dialog overlay and the chat panel.
 *
 * Deliberately NOT the console `Shell`: Edge is pixel-identical to the
 * prototype by ruling, and the prototype has its own header and a sidebar of
 * twelve chapters. What it shares with Vara and GTM is the platform layer
 * underneath — `RequireSession`, the query client, toasts — and a way back
 * ("← Back to VaNi"), which the prototype never needed and this console does.
 *
 * Everything renders under `.edge-root`, the scope the generated stylesheet
 * (edge.css, from scripts/build-edge-css.mjs) is prefixed with.
 */
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RequireSession } from '@/platform/shell/RequireSession';
import { installSkillTransport } from '@/lib/transport';
import { MissionProvider, useMission } from './mission/MissionProvider';
import { Orb } from './ui';
import { Dialogs } from './views/Dialogs';
import { AskEdge } from './views/AskEdge';
import './edge.css';

installSkillTransport();

export default function EdgeShell({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } }));
  return (
    <QueryClientProvider client={qc}>
      <RequireSession>
        <MissionProvider>
          <Chrome>{children}</Chrome>
        </MissionProvider>
      </RequireSession>
    </QueryClientProvider>
  );
}

function Chrome({ children }: { children: ReactNode }) {
  const { m, stage, modal, chatOpen, setChatOpen, openModal, go } = useMission();
  return (
    <div className="edge-root">
      <a className="skip" href="#main">Skip to content</a>
      {/* The prototype sets `inert` on #app while a dialog is open; same here. */}
      <div id="app" inert={modal ? true : undefined}>
        <header className="topbar">
          <button type="button" className="brand" onClick={() => go(-1)} aria-label="VaNi Edge home">
            <span className="wordmark"><Orb /><span>VaNi <b>Edge</b><small>BY AUTOMATIONEDGE</small></span></span>
          </button>
          <div className="top-actions">
            <Link className="nav-link" href="/dashboard" style={{ textDecoration: 'none' }}>← Back to VaNi</Link>
            <button type="button" className="edge-header" onClick={() => setChatOpen(!chatOpen)} aria-expanded={chatOpen} aria-controls="edge-chat">
              <span aria-hidden="true">◌</span> Ask Edge <small>Your process guide</small>
            </button>
            <span className="preview-pill">Guided mission · UX preview</span>
            <button type="button" className="nav-link" onClick={() => openModal('usage')}>Agent allowance ↗</button>
            {stage >= 0 && <button type="button" className="nav-link" onClick={() => openModal('save-exit')}>Save &amp; pause</button>}
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <span>VaNi Edge · Understand together. Decide with evidence.</span>
          <span>{m.storage ? 'Answers saved on this device' : 'Session-only workspace'} · No live LLM or customer-data mining</span>
        </footer>
        <button type="button" className="chat-launch" hidden onClick={() => setChatOpen(!chatOpen)} aria-expanded={chatOpen}><Orb /> Ask Edge <span>↗</span></button>
      </div>
      <AskEdge />
      <Dialogs />
    </div>
  );
}
