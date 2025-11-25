-- Autocomplete search for institution names
-- Fast prefix + trigram matching for typeahead
-- Example: User types "north carol"

WITH search_term AS (SELECT 'north carol' as term)
SELECT
    i.name,
    i.city,
    i.state,
    e.full_time as enrollment,
    CASE
        WHEN LOWER(i.name) LIKE LOWER(term) || '%' THEN 1.0
        ELSE similarity(i.name, term)
    END as relevance
FROM institution i, search_term
LEFT JOIN enrollment e ON i.unitid = e.unitid AND e.year = 2023
    AND e.level = 'undergraduate' AND e.race = 'APTS' AND e.gender = 'total'
WHERE LOWER(i.name) LIKE '%' || LOWER(term) || '%'
   OR i.name % term
ORDER BY
    CASE WHEN LOWER(i.name) LIKE LOWER(term) || '%' THEN 0 ELSE 1 END,
    e.full_time DESC NULLS LAST
LIMIT 15;
