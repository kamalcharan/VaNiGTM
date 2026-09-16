/**
 * The registry. Adding a skill is one folder under src/skills/ and one line
 * here — nothing inside src/platform/ changes. Planned routes need no page file
 * at all; the catch-all in app/(console) renders them from this declaration.
 */
import type { SkillModule } from '@/platform/registry';
import onboarding from './onboarding';
import smartProfile from './smart-profile';
import org from './org';
import workspace from './workspace';
import agents from './agents';
import runs from './runs';
import modelProvider from './model-provider';
import settings from './settings';
import demo from './demo';

export const SKILLS: SkillModule[] = [onboarding, smartProfile, org, workspace, agents, runs, modelProvider, settings, demo];
