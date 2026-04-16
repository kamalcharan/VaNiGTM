-- ============================================================================
-- Migration 056: Snapshot cash flow — add 'total' mode + fix expense categories
--
-- 1. ki_snapshot_income.source:   add 'total' (simple / single-value mode)
-- 2. ki_snapshot_expenses.category: add 'healthcare', 'other' (were in UI but
--    missing from DB CHECK — caused constraint violations on save), and 'total'
--    (simple / single-value mode)
--
-- Existing data is unaffected — all existing source/category values remain valid.
-- ============================================================================

-- ── Income: widen source CHECK ────────────────────────────────────────────────

ALTER TABLE ki_snapshot_income
  DROP CONSTRAINT IF EXISTS ki_snapshot_income_source_check;

ALTER TABLE ki_snapshot_income
  ADD CONSTRAINT ki_snapshot_income_source_check
  CHECK (source IN ('salary', 'partner', 'rental_other', 'total'));

COMMENT ON COLUMN ki_snapshot_income.source IS
  'salary | partner | rental_other — detailed mode.  total — simple (single-value) mode.';


-- ── Expenses: widen category CHECK ───────────────────────────────────────────

ALTER TABLE ki_snapshot_expenses
  DROP CONSTRAINT IF EXISTS ki_snapshot_expenses_category_check;

ALTER TABLE ki_snapshot_expenses
  ADD CONSTRAINT ki_snapshot_expenses_category_check
  CHECK (category IN (
    'housing', 'food', 'utilities', 'transport', 'education',
    'lifestyle', 'healthcare', 'other',   -- these existed in UI but were blocked by old CHECK
    'total'                                -- simple (single-value) mode
  ));

COMMENT ON COLUMN ki_snapshot_expenses.category IS
  'Detailed categories: housing | food | utilities | transport | education | lifestyle | healthcare | other.
   Simple mode: total (single value covers all expenses).';

COMMENT ON TABLE ki_snapshot_expenses IS
  'Monthly expenses by category. One row per category per snapshot.
   In detailed mode: up to 8 category rows.
   In simple mode: single row with category = ''total''.';
