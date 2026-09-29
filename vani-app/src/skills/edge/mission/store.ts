/**
 * Mission persistence and the few structural mutations — reference
 * `src/mission/store.js`. Saving is OPT-IN (the chapter-1 checkbox) and lives
 * in this browser only, exactly as the prototype does it; a server-side
 * mission is spec §14 schema and waits on approval. Every storage call is
 * wrapped, because storage can be absent or throw in a private window.
 */
import { createMission, type Mission, type ProcessId } from './types';

export const KEY = 'vani-edge-mission-v2';

export function loadMission(): Mission {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Mission>;
      if (saved.version === 2) {
        return { ...createMission(), ...saved, files: (saved.files || []).map((f) => ({ ...f, needsReattach: true })) };
      }
    }
  } catch { /* unreadable or blocked storage: start fresh */ }
  return createMission();
}

/** Returns false when nothing was saved — either opted out or the browser refused. */
export function saveMission(m: Mission): boolean {
  if (!m.storage) return false;
  try {
    m.savedAt = new Date().toISOString();
    localStorage.setItem(KEY, JSON.stringify(m));
    return true;
  } catch { return false; }
}

export function clearSaved(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}

/** Switching process keeps the business, the people and the save choice; process answers reset. */
export function switchedProcess(m: Mission, id: ProcessId): Mission {
  if (id === m.process) return m;
  const next = createMission();
  Object.assign(next, {
    missionType: m.missionType, company: m.company, industry: m.industry, locations: m.locations, profileSource: m.profileSource,
    icpConfirmed: m.icpConfirmed, respondent: m.respondent, actors: m.actors, storage: m.storage,
    process: id, stage: 2, furthest: 2,
  });
  next.assumptions.volume = id === 'p2p' ? 4213 : 1800;
  next.assumptions.minutes = id === 'p2p' ? 12 : 15;
  return next;
}

export function seedBoard(m: Mission, activities: string[]): void {
  if (m.board.length) return;
  m.board = activities.map((label, i) => ({ id: 'n' + i, label, actor: '', system: '', input: '', output: '', rule: '', type: 'activity', x: 50 + (i % 3) * 245, y: 40 + Math.floor(i / 3) * 150 }));
  m.links = m.board.slice(1).map((n, i) => ({ from: m.board[i].id, to: n.id, label: 'Next', kind: 'normal' }));
}

export function removeNode(m: Mission, id: string): void {
  m.board = m.board.filter((n) => n.id !== id);
  m.links = m.links.filter((l) => l.from !== id && l.to !== id);
  m.boardConfirmed = false;
}
