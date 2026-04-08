INSERT INTO ki_contacts (tenant_id, is_live, prefix, name, created_by)
VALUES ($tenant_id, $is_live, $prefix, $name, $created_by)
RETURNING id, prefix, name, normalized_name, is_client
