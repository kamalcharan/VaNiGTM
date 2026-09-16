/**
 * Declare or update the provider.
 *
 * An empty `key` means KEEP THE STORED ONE. The API never returns a credential,
 * so the form cannot pre-fill it; without this rule, changing only the model
 * would force a tenant to re-type a secret they may not have kept.
 *
 * Idempotent by construction — an upsert on the unique (tenant_id,
 * provider_code) returning no generated id. See SKILL.md.
 */

import { SkillContext } from '../../../shared/types';
import { getPool } from '../../../db/pool';
import { saveProvider } from '../../../vani/llm-provider.service';

export async function save_provider(
  params: Record<string, unknown>,
  ctx: SkillContext,
) {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

  const provider = await saveProvider(getPool(), ctx.tenant_id, {
    providerCode: String(params.provider_code ?? ''),
    key:          str(params.key),
    model:        str(params.model),
    baseUrl:      str(params.base_url),
  });

  return { provider, posture: 'byok' };
}
