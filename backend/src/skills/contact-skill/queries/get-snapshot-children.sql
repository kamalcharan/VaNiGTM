-- get-snapshot-children: all child rows for a snapshot_id
-- Run 5 queries (income, expenses, assets, liabilities, protection, goals)
-- These are split into individual statements — call each separately in TS.

-- [income] Named params: $snapshot_id
-- SELECT source, amount_monthly, notes FROM ki_snapshot_income WHERE snapshot_id = $snapshot_id ORDER BY source;

-- [expenses] Named params: $snapshot_id
-- SELECT category, amount_monthly FROM ki_snapshot_expenses WHERE snapshot_id = $snapshot_id ORDER BY category;

-- [assets] Named params: $snapshot_id
-- SELECT a.id, a.asset_type_id, t.label AS asset_type_label, t.code AS asset_type_code,
--        a.description, a.current_value, a.is_liquid, a.sort_order
-- FROM ki_snapshot_assets a
-- JOIN ki_asset_types t ON t.id = a.asset_type_id
-- WHERE a.snapshot_id = $snapshot_id ORDER BY a.sort_order, a.id;

-- [liabilities] Named params: $snapshot_id
-- SELECT l.id, l.liability_type_id, t.label AS liability_type_label, t.code AS liability_type_code,
--        l.description, l.outstanding_amount, l.monthly_emi, l.interest_rate_pct, l.sort_order
-- FROM ki_snapshot_liabilities l
-- JOIN ki_liability_types t ON t.id = l.liability_type_id
-- WHERE l.snapshot_id = $snapshot_id ORDER BY l.sort_order, l.id;

-- [protection] Named params: $snapshot_id
-- SELECT life_cover_amount, life_premium_annual, health_cover_amount, health_premium_annual,
--        ci_cover_amount, protection_ratio, has_term_plan, has_health_cover, notes
-- FROM ki_snapshot_protection WHERE snapshot_id = $snapshot_id;

-- [goals] Named params: $snapshot_id
-- SELECT id, goal_type, name, target_amount, timeline_years, priority, seeded_goal_id, notes, sort_order
-- FROM ki_snapshot_goals WHERE snapshot_id = $snapshot_id ORDER BY priority, sort_order, id;
