/**
 * contact-skill: get_goal_types
 * Returns goal type master data for the snapshot wizard.
 * Static data — not stored in DB (values are hardcoded in the CHECK constraint).
 */

import { SkillContext } from '../../../shared/types';

const GOAL_TYPES = [
  { id: 1, code: 'retirement', label: 'Retirement',      icon: '🌿', default_horizon_years: 20 },
  { id: 2, code: 'education',  label: 'Education',       icon: '🎓', default_horizon_years: 10 },
  { id: 3, code: 'house',      label: 'Home / Property', icon: '🏡', default_horizon_years: 7  },
  { id: 4, code: 'wedding',    label: 'Wedding',         icon: '💍', default_horizon_years: 3  },
  { id: 5, code: 'emergency',  label: 'Emergency Fund',  icon: '🛡️', default_horizon_years: 2  },
  { id: 6, code: 'vehicle',    label: 'Vehicle',         icon: '🚗', default_horizon_years: 3  },
  { id: 7, code: 'travel',     label: 'Travel',          icon: '✈️', default_horizon_years: 2  },
  { id: 8, code: 'custom',     label: 'Other',           icon: '⭐', default_horizon_years: 10 },
];

export async function get_goal_types(
  _params: Record<string, never>,
  _ctx: SkillContext
): Promise<{ goal_types: typeof GOAL_TYPES; recipe: 'master-data' }> {
  return { goal_types: GOAL_TYPES, recipe: 'master-data' };
}
