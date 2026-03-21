/**
 * KI-32: Skill API Client
 *
 * Utility to call skill endpoints from the Next.js shell.
 * Uses dev auth headers for now (JWT auth comes later in KI-40).
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Dev auth headers — replace with JWT when KI-40 is built
const DEV_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'X-Dev-Tenant-Id': process.env.NEXT_PUBLIC_DEV_TENANT_ID || 'a0000000-0000-0000-0000-000000000001',
  'X-Dev-User-Id': process.env.NEXT_PUBLIC_DEV_USER_ID || 'a0000000-0000-0000-0000-000000000002',
};

export interface SkillResponse<T = any> {
  data: T;
  recipe?: string;
  success: boolean;
  error?: string;
}

/**
 * Call a skill function endpoint.
 *
 * @param skill  - Skill name, e.g. "client-skill"
 * @param fn     - Function name, e.g. "get_clients"
 * @param params - Parameters to pass to the skill function
 * @returns SkillResponse with data, recipe, success, and optional error
 */
export async function callSkill<T = any>(
  skill: string,
  fn: string,
  params: Record<string, any> = {}
): Promise<SkillResponse<T>> {
  const url = `${API_BASE}/api/v1/skills/${skill}/${fn}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: DEV_HEADERS,
    body: JSON.stringify({ params }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    return {
      data: null as T,
      success: false,
      error: `${res.status}: ${errorBody}`,
    };
  }

  return res.json();
}
