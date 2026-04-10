INSERT INTO ki_contacts
  (tenant_id, is_live, prefix, name, contact_no, created_by, age, city, marital_status, dependents_count)
VALUES
  ($tenant_id, $is_live, $prefix, $name,
   ki_next_seq($tenant_id::uuid, 'contact'),
   $created_by, $age, $city, $marital_status, $dependents_count)
RETURNING id, prefix, name, normalized_name, contact_no, is_client, age, city, marital_status, dependents_count
