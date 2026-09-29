'use client';
/**
 * The mission in React — what the reference keeps as module state in
 * `src/mission/main.js` (`m`, `chatOpen`, the overlay, `go`, `persist`,
 * `download`, `toast`) becomes one context.
 *
 * Two departures from the prototype, both deliberate:
 * - The URL carries the chapter (`/agents/edge/<slug>`), so browser back and
 *   deep links work. `stage` on the mission is still written (a saved
 *   prototype mission resumes at the right place) but the router is the truth.
 * - Dialogs are named, not HTML strings: `openModal('memory')` and the shell
 *   renders that dialog from the current mission, so a dialog never shows
 *   stale state.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useToast } from '@/platform/feedback';
import { createMission, type Mission } from './types';
import { chapters as readinessChapters, failureChapters, slugOfStage, stageOfSlug, type Chapter } from './domain';
import { loadMission, saveMission } from './store';

export const EDGE_ROOT = '/agents/edge';

export type ModalId =
  | 'memory' | 'usage' | 'topup' | 'save-exit' | 'reset-confirm' | 'engage' | 'assist' | 'choose-mission'
  | 'add-actor' | 'assign' | 'task' | 'node' | 'link' | 'switch-process' | 'sample-evidence' | 'mapping' | 'rules-review'
  | 'failure-hypothesis' | 'failure-action';

export interface ModalState { id: ModalId; props?: Record<string, unknown> }

export interface MissionContextValue {
  m: Mission;
  /** -1 on the welcome screen; otherwise the chapter index from the URL. */
  stage: number;
  chapters: Chapter[];
  update: (fn: (draft: Mission) => void) => void;
  replace: (next: Mission) => void;
  go: (stage: number) => void;
  modal: ModalState | null;
  openModal: (id: ModalId, props?: Record<string, unknown>) => void;
  closeModal: () => void;
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  toast: (text: string) => void;
  download: (name: string, body: string, type?: string) => void;
  /** The form the chapter currently owns; `capture` reads it before leaving. */
  registerCapture: (fn: (() => void) | null) => void;
  hydrated: boolean;
}

const Ctx = createContext<MissionContextValue | null>(null);

export function useMission(): MissionContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMission outside MissionProvider');
  return v;
}

export function stageFromPath(pathname: string): number {
  const rest = pathname.startsWith(EDGE_ROOT) ? pathname.slice(EDGE_ROOT.length).replace(/^\//, '') : '';
  if (!rest) return -1;
  return stageOfSlug(rest.split('/')[0]);
}

export function MissionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? EDGE_ROOT;
  const toasts = useToast();
  const [m, setM] = useState<Mission>(createMission);
  const [hydrated, setHydrated] = useState(false);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const captureRef = useRef<(() => void) | null>(null);
  const mRef = useRef(m);
  mRef.current = m;

  // Storage is read after mount, never during render: the server has no
  // localStorage and a hydration mismatch here would blank the page.
  useEffect(() => { setM(loadMission()); setHydrated(true); }, []);

  const stage = stageFromPath(pathname);
  const chapters = m.missionType === 'failure' ? failureChapters : readinessChapters;

  const replace = useCallback((next: Mission) => { saveMission(next); mRef.current = next; setM(next); }, []);
  const update = useCallback((fn: (draft: Mission) => void) => {
    const next = structuredClone(mRef.current);
    fn(next);
    replace(next);
  }, [replace]);

  const go = useCallback((target: number) => {
    captureRef.current?.();
    update((d) => {
      if (target >= 0) { d.furthest = Math.max(d.furthest, target); d.resumeStage = target; }
      d.stage = target;
    });
    setChatOpen(false);
    router.push(target < 0 ? EDGE_ROOT : `${EDGE_ROOT}/${slugOfStage(target)}`);
    window.scrollTo(0, 0);
  }, [router, update]);

  const toast = useCallback((text: string) => { toasts.info(text); }, [toasts]);

  const download = useCallback((name: string, body: string, type = 'text/plain') => {
    const url = URL.createObjectURL(new Blob([body], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast('Download prepared.');
  }, [toast]);

  const openModal = useCallback((id: ModalId, props?: Record<string, unknown>) => setModal({ id, props }), []);
  const closeModal = useCallback(() => setModal(null), []);
  const registerCapture = useCallback((fn: (() => void) | null) => { captureRef.current = fn; }, []);

  // Keep the tab title in step with the chapter, as the prototype does.
  useEffect(() => {
    document.title = (stage < 0 ? 'Your guided assessment' : chapters[stage]?.[0] ?? 'VaNi Edge') + ' · VaNi Edge';
  }, [stage, chapters]);

  // Escape closes whichever overlay is open — dialog first, then the chat.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { setModal(null); setChatOpen(false); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Unsaved edits are captured when the tab closes, like the prototype's beforeunload.
  useEffect(() => {
    const onLeave = () => { captureRef.current?.(); saveMission(mRef.current); };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, []);

  const value = useMemo<MissionContextValue>(() => ({
    m, stage, chapters, update, replace, go, modal, openModal, closeModal, chatOpen, setChatOpen, toast, download, registerCapture, hydrated,
  }), [m, stage, chapters, update, replace, go, modal, openModal, closeModal, chatOpen, toast, download, registerCapture, hydrated]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
