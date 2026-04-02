-- ============================================================
-- KI-Prime — Migration 007: Performance Indexes
-- ============================================================

-- Metrics lookup: latest metrics per scheme (used by scheme dashboard)
CREATE INDEX IF NOT EXISTS idx_ki_nav_metrics_latest
    ON ki_nav_history (scheme_code, nav_date DESC)
    WHERE metrics_calculated_at IS NOT NULL;

-- NAV summary aggregation: used by search_schemes skill
CREATE INDEX IF NOT EXISTS idx_ki_nav_scheme_agg
    ON ki_nav_history (scheme_code);

-- Bookmark lookup by tenant
CREATE INDEX IF NOT EXISTS idx_ki_bookmarks_tenant_code
    ON ki_scheme_bookmarks (tenant_id, scheme_code);
