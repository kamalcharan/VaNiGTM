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
import settings from './settings';
import install from './install';
import demo from './demo';
import { VARA_WORKSPACE } from './vara-shell/vara-nav';
import { GTM_WORKSPACE } from './gtm-shell/gtm-nav';

export const SKILLS: SkillModule[] = [onboarding, smartProfile, org, workspace, agents, runs, install, settings, demo];

/**
 * The agent workspaces. Each swaps the sidebar when entered (its own shell)
 * and declares a journey the dashboard renders as a card. Adding an agent is
 * its folder plus one line here — the catalog and the journey travel together.
 */
export const AGENT_WORKSPACES: SkillModule[] = [VARA_WORKSPACE, GTM_WORKSPACE];
