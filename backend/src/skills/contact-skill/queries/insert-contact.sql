INSERT INTO ki_contacts
  (tenant_id, is_live, prefix, name, created_by, age, city, marital_status, dependents_count)
VALUES
  ($tenant_id, $is_live, $prefix, $name, $created_by, $age, $city, $marital_status, $dependents_count)
RETURNING id, prefix, name, normalized_name, is_client, age, city, marital_status, dependents_count
