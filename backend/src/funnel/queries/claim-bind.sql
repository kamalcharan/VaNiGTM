UPDATE vani_anon_session SET bound_tenant_id = $2, bound_at = now() WHERE id = $1;
