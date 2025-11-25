-- Find institutions most similar to a given school using vector similarity
-- Example: Schools similar to MIT (unitid = 166683)

WITH target AS (
    SELECT feature_vector, name FROM institution WHERE unitid = 166683
)
SELECT
    i.name,
    i.city,
    i.state,
    1 - (i.feature_vector <=> target.feature_vector) as similarity,
    ROUND(a.admit_rate * 100, 1) as admit_pct,
    ROUND(g.grad_rate_150pct * 100, 1) as grad_rate,
    e.full_time as enrollment
FROM institution i, target
LEFT JOIN admissions a ON i.unitid = a.unitid AND a.year = 2023
LEFT JOIN graduation_rates g ON i.unitid = g.unitid AND g.year = 2023
    AND g.race = 'APTS' AND g.gender = 'total' AND g.cohort_type = 'bachelor'
LEFT JOIN enrollment e ON i.unitid = e.unitid AND e.year = 2023
    AND e.level = 'undergraduate' AND e.race = 'APTS' AND e.gender = 'total'
WHERE i.feature_vector IS NOT NULL
  AND i.name != target.name
ORDER BY i.feature_vector <=> target.feature_vector
LIMIT 20;
