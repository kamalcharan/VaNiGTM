/**
 * The mission — one object, the whole of what Edge knows about this
 * assessment. Ported field-for-field from the reference's
 * `src/mission/store.js` (`createMission`), so a mission saved by the
 * prototype reads back unchanged (`version: 2`, key `vani-edge-mission-v2`).
 *
 * Kept flat and mutable-by-draft on purpose: the reference mutates it freely
 * and every view reads it whole. The provider clones before each change, so
 * React sees a new object and nothing is mutated in place.
 */

import type { Analysis } from '../engine/analyse';

export type ProcessId = 'p2p' | 'o2c';
export type MissionType = 'readiness' | 'failure';
export type EvidenceMode = 'own' | 'sample';

export interface Respondent {
  name: string;
  designation: string;
  role: string;
  scope: string;
  email?: string;
  whatsapp?: string;
}

export interface Actor { id: string; name: string; designation: string; responsibility: string; email?: string }

export interface ContributionTask {
  id: string;
  topic: string;
  context: string;
  assignee: string;
  person: string;
  status: 'Awaiting response' | 'Needs reconciliation' | 'Resolved' | string;
  response?: string;
  recordedBy?: string;
}

export interface BoardNode {
  id: string;
  label: string;
  actor: string;
  system: string;
  type: 'activity' | 'decision' | string;
  input: string;
  output: string;
  rule: string;
  x: number;
  y: number;
}

export interface BoardLink { from: string; to: string; label: string; kind: 'normal' | 'exception' | 'parallel' | string }

export interface FileSummary {
  kind: string;
  /** Which of the register's expected columns the file carries (engine/schema). */
  columns?: { found: string[]; missing: string[]; missingRequired: string[] };
  name: string;
  headers?: string[];
  rows?: number;
  inconsistent?: number;
  document?: boolean;
  error?: string;
  needsReattach?: boolean;
}

export interface PathReview {
  relationship?: string;
  classification?: string;
  explanation?: string;
  treatment?: string;
  conditions?: string;
  owner?: string;
  fallback?: string;
  question?: string;
  by?: string;
}

export interface Assumptions {
  volume: number; minutes: number; rate: number; coverage: number; efficiency: number; setup: number; monthly: number;
}

export interface FailureHypothesis {
  id: string; statement: string; support?: string; counter?: string; missing?: string; status?: string; reviewer?: string;
}
export interface CorrectiveAction {
  id: string; title: string; hypothesis?: string; category?: string; owner?: string; due?: string; dependencies?: string;
  test?: string; criterion?: string; recovery?: string; status?: string; evidence?: string; reviewer?: string; window?: string;
}
export interface FailureRecord {
  incident: Record<string, string>;
  comparison: Record<string, string>;
  hypotheses: FailureHypothesis[];
  actions: CorrectiveAction[];
  verification: Record<string, string>;
}

export interface Mission {
  missionType: MissionType;
  failure: FailureRecord;
  version: 2;
  /** -1 is the welcome screen. In the console the URL carries this; the field stays for saved missions. */
  stage: number;
  furthest: number;
  resumeStage?: number;
  process: ProcessId;
  company: string;
  industry: string;
  profileSource: string;
  locations: string;
  icpConfirmed: boolean;
  role: string;
  goal: string;
  respondent: Respondent;
  actors: Actor[];
  tasks: ContributionTask[];
  pains: string[];
  priority: string;
  answers: Record<string, { answer: string; detail?: string; basis?: string; by?: string }>;
  gains: string[];
  current: string; target: string; unit: string; deadline: string;
  painStory: string; frequency: string; impact: string;
  quiz: number;
  discoveryConfirmed: boolean;
  failureIntake?: boolean;
  board: BoardNode[];
  links: BoardLink[];
  boardConfirmed: boolean;
  rules: Record<string, string>;
  ruleStatus: Record<string, string>;
  stack: string[];
  systemNotes: string;
  rulesConfirmed: boolean;
  mode: EvidenceMode;
  files: FileSummary[];
  mapping: { note?: string };
  evidenceConfirmed: boolean;
  lens: 'frequency' | 'waiting';
  variant: string;
  selectedNode: string;
  pathReviews: Record<string, PathReview>;
  resolutions: Record<string, string>;
  context: string;
  confirmed: boolean;
  control: 'assist' | 'guarded' | 'extend';
  assumptions: Assumptions;
  chat: { role: 'user' | 'assistant'; text: string }[];
  savedAt: string | null;
  storage: boolean;
  usage: 'available' | 'low' | 'exhausted';
  topup: boolean;
  delivery?: { email: string; whatsapp: string; preview: boolean };
  /** The engine's output for the confirmed evidence (engine/analyse). Persisted; the raw files are not. */
  analysis?: Analysis | null;
  analysisSource?: 'sample' | 'own';
}

export function createMission(): Mission {
  return {
    missionType: 'readiness',
    failure: { incident: {}, comparison: {}, hypotheses: [], actions: [], verification: {} },
    version: 2, stage: -1, furthest: 0, process: 'p2p',
    company: 'Meridian Pharma Distributors', industry: 'Pharma & distribution',
    profileSource: 'Illustrative inherited ICP profile', locations: '6 depots', icpConfirmed: false, role: '', goal: '',
    respondent: { name: '', designation: '', role: 'Process owner', scope: '' }, actors: [], tasks: [], pains: [], priority: '', answers: {}, gains: [],
    current: '', target: '', unit: 'working days', deadline: '', painStory: '', frequency: '', impact: '', quiz: 0, discoveryConfirmed: false,
    board: [], links: [], boardConfirmed: false, rules: {}, ruleStatus: {}, stack: [], systemNotes: '', rulesConfirmed: false,
    mode: 'own', files: [], mapping: {}, evidenceConfirmed: false, lens: 'frequency', variant: '', selectedNode: '',
    pathReviews: {}, resolutions: {}, context: '', confirmed: false, control: 'guarded',
    assumptions: { volume: 4213, minutes: 12, rate: 500, coverage: 60, efficiency: 50, setup: 150000, monthly: 15000 },
    chat: [], savedAt: null, storage: false, usage: 'available', topup: false,
  };
}
