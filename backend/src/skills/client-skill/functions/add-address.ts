/**
 * client-skill: add_address
 * Add or update an address for a client.
 * Uses UPSERT on (client_id, address_type, is_live).
 */

import { SkillContext } from '../../../shared/types';

const VALID_ADDRESS_TYPES = ['residential', 'office', 'mailing', 'permanent', 'temporary', 'other'] as const;

interface AddAddressParams {
  client_id: number;
  address_type: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  country?: string;
  pincode: string;
  is_primary?: boolean;
}

interface AddAddressResult {
  address: {
    id: number;
    address_type: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    country: string;
    pincode: string;
    is_primary: boolean;
  };
  recipe: 'inline-item';
}

export async function add_address(
  params: AddAddressParams,
  ctx: SkillContext
): Promise<AddAddressResult> {
  const { client_id, address_type, line1, line2, city, state, pincode, is_primary = false } = params;
  const country = params.country ?? 'India';

  if (!VALID_ADDRESS_TYPES.includes(address_type as typeof VALID_ADDRESS_TYPES[number])) {
    throw new Error(`Invalid address_type. Must be one of: ${VALID_ADDRESS_TYPES.join(', ')}`);
  }
  if (!line1?.trim() || !city?.trim() || !state?.trim() || !pincode?.trim()) {
    throw new Error('line1, city, state, and pincode are required');
  }

  // Verify client belongs to this tenant
  const clientCheck = await ctx.db.query<{ id: number }>(
    `SELECT id FROM ki_clients WHERE id = $client_id AND tenant_id = $tenant_id AND is_live = $is_live AND is_active = true`,
    { $client_id: client_id, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live }
  );
  if (!clientCheck.rows[0]) {
    throw new Error(`Client ${client_id} not found`);
  }

  const res = await ctx.db.query<{
    id: number; address_type: string; line1: string; line2: string | null;
    city: string; state: string; country: string; pincode: string; is_primary: boolean;
  }>(
    `INSERT INTO ki_client_addresses
       (client_id, tenant_id, is_live, address_type, line1, line2, city, state, country, pincode, is_primary)
     VALUES ($client_id, $tenant_id, $is_live, $address_type, $line1, $line2, $city, $state, $country, $pincode, $is_primary)
     ON CONFLICT (client_id, address_type, is_live) DO UPDATE SET
       line1      = EXCLUDED.line1,
       line2      = EXCLUDED.line2,
       city       = EXCLUDED.city,
       state      = EXCLUDED.state,
       country    = EXCLUDED.country,
       pincode    = EXCLUDED.pincode,
       is_primary = EXCLUDED.is_primary,
       is_active  = true
     RETURNING id, address_type, line1, line2, city, state, country, pincode, is_primary`,
    {
      $client_id:    client_id,
      $tenant_id:    ctx.tenant_id,
      $is_live:      ctx.is_live,
      $address_type: address_type,
      $line1:        line1.trim(),
      $line2:        line2?.trim() ?? null,
      $city:         city.trim(),
      $state:        state.trim(),
      $country:      country,
      $pincode:      pincode.trim(),
      $is_primary:   is_primary,
    }
  );

  return { address: res.rows[0], recipe: 'inline-item' };
}
