-- The queue row, in the same transaction as the rows it refers to (the SQL
-- emitEvent runs; gt_events has no RLS, by design). $1 tenant · $2 type · $3 payload
INSERT INTO gt_events (tenant_id, event_type, source_type, payload)
VALUES ($1, $2, 'system', $3::jsonb)
RETURNING id;
