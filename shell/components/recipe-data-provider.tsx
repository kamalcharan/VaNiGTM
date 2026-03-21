/**
 * KI-32: Recipe Data Provider
 *
 * Wraps a recipe page with skill data fetching. Accepts a mapping of
 * skill calls, fetches data in parallel, resolves recipe slot data paths,
 * and passes the combined data to the RecipeRenderer.
 *
 * Usage:
 *   <RecipeDataProvider
 *     recipeName="client-list"
 *     calls={{ clients: { skill: 'client-skill', fn: 'get_clients' } }}
 *   />
 */

'use client';

import { useSkills } from '../hooks/use-skill';
import { SkillLoading } from './skill-loading';
import { SkillError } from './skill-error';

interface SkillCall {
  skill: string;
  fn: string;
  params?: Record<string, any>;
}

interface RecipeDataProviderProps {
  recipeName: string;
  calls: Record<string, SkillCall>;
  deps?: any[];
  children: (data: Record<string, any>) => React.ReactNode;
}

export function RecipeDataProvider({
  recipeName,
  calls,
  deps = [],
  children,
}: RecipeDataProviderProps) {
  const { data, loading, errors, hasErrors } = useSkills(calls, deps);

  if (loading) {
    return <SkillLoading message={`Loading ${recipeName.replace(/-/g, ' ')}...`} />;
  }

  if (hasErrors) {
    const errorMessages = Object.entries(errors)
      .map(([key, msg]) => `${key}: ${msg}`)
      .join('; ');
    return <SkillError error={errorMessages} />;
  }

  // Flatten: merge all skill response data into a single object
  // Each call key maps to its response data
  const mergedData: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Spread top-level keys from each skill response into merged data
      Object.assign(mergedData, value);
    }
    // Also keep the call key itself for direct access
    mergedData[`_${key}`] = value;
  }

  return <>{children(mergedData)}</>;
}
