-- get-corrections: list scheme remap corrections for the tenant
-- Named params: $tenant_id, $is_live, $status (nullable text)
--
-- Status normalisation:
--   DB 'draft' | 'previewed' | 'executing' → returned as 'pending'
--   DB 'completed' | 'rolled_back' | 'failed' → returned as-is
-- Filter mapping:
--   $status = 'pending'  → match DB rows IN ('draft','previewed','executing')
--   $status = 'completed'|'rolled_back'|'failed' → match exact DB status
--   $status IS NULL → all rows (no status filter)

SELECT
    c.id,
    c.source_value                                          AS source_scheme_code,
    c.target_value                                          AS target_scheme_code,
    s1.scheme_name                                          AS source_scheme_name,
    s2.scheme_name                                          AS target_scheme_name,
    c.client_id                                             AS customer_id,
    ct.name                                                 AS customer_name,
    COALESCE(c.affected_txn_count, 0)                       AS transaction_count,

    -- total_invested: sum of all transaction amounts for this scheme for this client
    -- (covers both source and target scheme codes to handle pre/post correction state)
    COALESCE((
        SELECT SUM(t.amount)
        FROM ki_transactions t
        WHERE t.tenant_id   = c.tenant_id
          AND t.is_live     = c.is_live
          AND t.client_id   = c.client_id
          AND t.scheme_code IN (c.source_value, c.target_value)
    ), 0)                                                   AS total_invested,

    -- Normalise pre-execution statuses to 'pending' for the frontend
    CASE
        WHEN c.status IN ('draft', 'previewed', 'executing') THEN 'pending'
        ELSE c.status
    END                                                     AS status,

    c.notes,

    -- Error detail from the first failed step (if any)
    (
        SELECT cs.error_message
        FROM ki_correction_steps cs
        WHERE cs.correction_id = c.id
          AND cs.status = 'failed'
        ORDER BY cs.step_order DESC
        LIMIT 1
    )                                                       AS error_message,

    c.created_at,
    c.completed_at                                          AS executed_at,
    c.rolled_back_at

FROM ki_corrections c
JOIN ki_clients  cl ON cl.id = c.client_id AND cl.tenant_id = c.tenant_id
JOIN ki_contacts ct ON ct.id = cl.contact_id
LEFT JOIN ki_schemes s1 ON s1.scheme_code = c.source_value
LEFT JOIN ki_schemes s2 ON s2.scheme_code = c.target_value

WHERE c.tenant_id       = $tenant_id
  AND c.is_live         = $is_live
  AND c.correction_type = 'scheme_remap'
  AND (
      $status::text IS NULL
      OR (
          $status::text = 'pending'
          AND c.status IN ('draft', 'previewed', 'executing')
      )
      OR (
          $status::text IN ('completed', 'rolled_back', 'failed')
          AND c.status = $status::text
      )
  )

ORDER BY c.created_at DESC
LIMIT 200;
