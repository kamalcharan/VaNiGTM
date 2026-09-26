-- get_loads: the DELIVERIES behind a record surface — one row per load, with
-- its publisher, what it carried, and what of it is live in the record view.
--
-- scope 'mine' -> the tenant's own uploads (gt_source_loads.tenant_id = caller)
-- scope 'pool' -> common-pool deliveries (tenant_id IS NULL) — admin only,
--                 enforced in the function; nothing in this SQL constrains who
--                 reads the pool, exactly as get_records.
--
-- Counts come from gt_record_view so a load's "records" means the same thing
-- here as on the list: active rows, this tenant, this environment.
--
-- Named params: $scope, $tenant_id, $is_live

SELECT
    l.id,
    l.label,
    l.region,
    l.state_code,
    l.as_of,
    l.row_count,
    l.status,
    l.loaded_at,
    l.file_checksum,
    (l.tenant_id IS NULL)                 AS is_pool,
    ds.code                               AS source_code,
    ds.name                               AS source_name,
    ds.kind                               AS source_kind,
    COALESCE(l.tier_override, ds.tier)    AS tier,
    COALESCE(rc.records, 0)               AS records,
    COALESCE(rc.with_domain, 0)           AS with_domain,
    COALESCE(rc.duplicates, 0)            AS duplicates,
    rc.avg_completeness,
    rc.avg_validity,
    COALESCE(tg.tags, '[]'::json)         AS tags
FROM gt_source_loads l
JOIN gt_data_sources ds ON ds.id = l.source_id
LEFT JOIN LATERAL (
    SELECT COUNT(*)::int                                              AS records,
           COUNT(*) FILTER (WHERE v.domain_normalized IS NOT NULL)::int AS with_domain,
           COUNT(*) FILTER (WHERE v.duplicate)::int                   AS duplicates,
           ROUND(AVG(v.completeness)::numeric, 3)                     AS avg_completeness,
           ROUND(AVG(v.validity)::numeric, 3)                         AS avg_validity
    FROM   gt_record_view v
    WHERE  v.load_id = l.id
      AND  v.scope = $scope::text
      AND  v.is_active
      AND  ( v.scope = 'pool'
             OR (v.tenant_id = $tenant_id::uuid AND v.is_live = $is_live::boolean) )
) rc ON true
LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object('id', t.id, 'label', t.label, 'is_platform', t.tenant_id IS NULL)
                    ORDER BY t.label) AS tags
    FROM   gt_load_tags lt
    JOIN   gt_tags t ON t.id = lt.tag_id AND t.is_active = true
    WHERE  lt.load_id = l.id
) tg ON true
WHERE ( $scope::text = 'pool' AND l.tenant_id IS NULL )
   OR ( $scope::text = 'mine' AND l.tenant_id = $tenant_id::uuid )
ORDER BY l.loaded_at DESC, l.id DESC
LIMIT 200;
