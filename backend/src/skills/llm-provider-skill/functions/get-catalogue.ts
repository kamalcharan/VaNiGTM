/**
 * The providers on offer, and whether key storage works at all.
 *
 * `encryptionReady` is here so the form can say WHY saving is unavailable
 * before anyone fills it in. Without it a tenant types a 100-character secret
 * and learns on submit that the deployment has no TENANT_SECRET_KEY — which is
 * an operator problem they cannot fix and should not discover that way.
 */

import { SkillContext } from '../../../shared/types';
import { providerCatalogue } from '../../../vani/llm-provider.service';
import { isConfigured } from '../../../agent-core/secret.crypto';

export async function get_catalogue(_params: Record<string, unknown>, _ctx: SkillContext) {
  return { providers: providerCatalogue(), encryptionReady: isConfigured() };
}
