INSERT INTO ki_client_addresses
  (client_id, tenant_id, is_live, address_type,
   line1, line2, city, state, country, pincode, is_primary)
VALUES
  ($client_id, $tenant_id, $is_live, $address_type,
   $line1, $line2, $city, $state, $country, $pincode, $is_primary)
ON CONFLICT (client_id, address_type, is_live) DO UPDATE SET
  line1      = EXCLUDED.line1,
  line2      = EXCLUDED.line2,
  city       = EXCLUDED.city,
  state      = EXCLUDED.state,
  country    = EXCLUDED.country,
  pincode    = EXCLUDED.pincode,
  is_primary = EXCLUDED.is_primary,
  is_active  = true
RETURNING id, address_type, line1, line2, city, state, country, pincode, is_primary
