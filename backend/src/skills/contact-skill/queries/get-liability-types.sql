-- get-liability-types: all active liability types for dropdown population
-- No tenant filter — global master table
-- Named params: (none)

SELECT
    id,
    code,
    label,
    description,
    sort_order
FROM ki_liability_types
WHERE is_active = true
ORDER BY sort_order, label;
