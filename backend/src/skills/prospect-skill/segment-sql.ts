/**
 * The definition predicate, written once.
 *
 * A segment stores a filter; counting it, listing it and researching it all
 * have to apply that filter IDENTICALLY. Three copies of this SQL is three
 * chances for the number on the card to disagree with the rows behind it —
 * and a count that does not match its own list is worse than no count.
 *
 * Written against a `gt_prospects` alias so callers can join it however they
 * need, and reading the definition straight out of the JSONB so the stored
 * shape and the query can never drift apart.
 */

/**
 * @param p    alias for gt_prospects
 * @param def  SQL expression yielding the definition JSONB (a column or a param)
 */
export const segmentPredicate = (p: string, def: string): string => `
        (${def}->>'industry_canonical' IS NULL
         OR ${p}.industry_canonical = ${def}->>'industry_canonical')
    AND (${def}->>'industry_sub' IS NULL
         OR ${p}.industry_sub = ${def}->>'industry_sub')
    AND (${def}->>'relationship' IS NULL
         OR ${p}.relationship = ${def}->>'relationship')
    AND (${def}->>'city' IS NULL OR ${p}.city ILIKE ${def}->>'city')
    AND (${def}->>'state_code' IS NULL OR ${p}.state_code = ${def}->>'state_code')
    AND (${def}->>'min_quality' IS NULL
         OR COALESCE(${p}.completeness, 0) >= (${def}->>'min_quality')::numeric)
    AND (${def}->>'domain' IS NULL
         OR (${def}->>'domain' = 'has'  AND ${p}.domain_normalized IS NOT NULL)
         OR (${def}->>'domain' = 'none' AND ${p}.domain_normalized IS NULL))
    AND (${def}->>'tag_id' IS NULL OR EXISTS (
          SELECT 1 FROM gt_prospect_tags pt
           WHERE pt.prospect_id = ${p}.id
             AND pt.tag_id = (${def}->>'tag_id')::bigint))
    AND (${def}->>'search' IS NULL
         OR ${p}.name ILIKE '%' || (${def}->>'search') || '%'
         OR ${p}.domain_normalized ILIKE '%' || (${def}->>'search') || '%'
         OR ${p}.industry_raw ILIKE '%' || (${def}->>'search') || '%')`;
