/**
 * client-skill: add_address
 * Add or update an address for a client.
 * Uses UPSERT on (client_id, address_type, is_live).
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const VALID_ADDRESS_TYPES = ['residential', 'office', 'mailing', 'permanent', 'temporary', 'other'] as const;

const CHECK_CLIENT_SQL  = fs.readFileSync(path.join(__dirname, '../queries/check-client.sql'),  'utf-8');
const UPSERT_ADDRESS_SQL = fs.readFileSync(path.join(__dirname, '../queries/upsert-address.sql'), 'utf-8');

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
  const clientCheck = await ctx.db.query<{ id: number }>(CHECK_CLIENT_SQL, {
    $client_id: client_id, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live,
  });
  if (!clientCheck.rows[0]) {
    throw new Error(`Client ${client_id} not found`);
  }

  const res = await ctx.db.query<{
    id: number; address_type: string; line1: string; line2: string | null;
    city: string; state: string; country: string; pincode: string; is_primary: boolean;
  }>(UPSERT_ADDRESS_SQL, {
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
  });

  return { address: res.rows[0], recipe: 'inline-item' };
}
