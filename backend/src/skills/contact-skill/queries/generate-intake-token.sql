-- generate-intake-token: insert a new intake token
-- Named params: $tenant_id, $token, $contact_id, $created_by_user_id, $expires_at

INSERT INTO ki_intake_tokens
    (tenant_id, token, contact_id, created_by_user_id, expires_at, status, is_live)
VALUES
    ($tenant_id, $token, $contact_id, $created_by_user_id, $expires_at, 'active', $is_live)
RETURNING id, token, contact_id, expires_at, status, created_at, is_live;
