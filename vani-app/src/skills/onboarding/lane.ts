/**
 * Onboarding lanes — the client's half of the contract.
 *
 * Onboarding is an agent. It owns the ENGINE; it does not own the CONTENT.
 * Each subject declares the lane it wants run, and the engine runs any lane it
 * is handed:
 *
 *   product lane  the organisation declares itself once  (VN-10 … VN-13)
 *   agent lane    an agent's activation checklist, run when that agent activates
 *
 * That separation is the whole point. If the onboarding agent knew about Vara,
 * adding Nova would mean editing the onboarding agent — which is the thing
 * "agents extend, never modify" exists to prevent. Instead an agent ships its
 * lane with itself, and this file never changes.
 *
 * Lane membership is carried in `step_id`, matching the server catalog:
 *   no colon        the legacy GTM lane
 *   `vani:<key>`    the VaNi product lane
 *   `<agent>:<key>` that agent's activation lane
 */

import type { ComponentType } from 'react';

export type LaneScope = 'product' | 'agent';

/** What a step screen is handed. `save` is the only way it writes. */
export interface StepScreenProps {
  /** Values already known for this step, from the server. */
  initial: Record<string, unknown>;
  /**
   * Completes the step. One call: the payload and the completion mark commit
   * together on the server, so a screen can never leave one without the other.
   */
  save: (data: Record<string, unknown>) => Promise<boolean>;
  isSaving: boolean;
}

export interface OnboardingStep {
  /** Must match the server catalog exactly — it is the storage key. */
  step_id: string;
  title: string;
  summary: string;
  Screen: ComponentType<StepScreenProps>;
}

export interface OnboardingLane {
  id: string;
  title: string;
  scope: LaneScope;
  /** What the person is agreeing to spend the next few minutes on. */
  intro: string;
  steps: OnboardingStep[];
}

const LANES = new Map<string, OnboardingLane>();

/**
 * Declare a lane. Agents call this from their own module, so adding an agent's
 * onboarding is one folder plus one registry line — no diff inside the
 * onboarding agent and none inside platform/.
 */
export function registerLane(lane: OnboardingLane): void {
  LANES.set(lane.id, lane);
}

export function getLane(id: string): OnboardingLane | undefined {
  return LANES.get(id);
}

/** The product lane. There is exactly one, and the gate enforces it. */
export const PRODUCT_LANE_ID = 'vani';
