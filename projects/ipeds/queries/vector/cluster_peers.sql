-- Find natural peer clusters for an institution
-- Returns schools with highest vector similarity, useful for benchmarking
-- Example: Find peers for University of Michigan (unitid = 170976)

WITH target AS (
    SELECT unitid, feature_vector, name, state FROM institution WHERE unitid = 170976
),
peers AS (
    SELECT
        i.unitid,
        i.name,
        i.state,
        1 - (i.feature_vector <=> target.feature_vector) as similarity
    FROM institution i, target
    WHERE i.feature_vector IS NOT NULL
      AND i.unitid != target.unitid
    ORDER BY i.feature_vector <=> target.feature_vector
    LIMIT 15
)
SELECT
    p.name,
    p.state,
    ROUND(p.similarity::numeric, 3) as similarity,
    ROUND(a.admit_rate * 100, 1) as admit_pct,
    ROUND(g.grad_rate_150pct * 100, 1) as grad_rate,
    e.full_time as enrollment,
    f.avg_net_price_0_30k as net_price
FROM peers p
LEFT JOIN admissions a ON p.unitid = a.unitid AND a.year = 2023
LEFT JOIN graduation_rates g ON p.unitid = g.unitid AND g.year = 2023
    AND g.race = 'APTS' AND g.gender = 'total' AND g.cohort_type = 'bachelor'
LEFT JOIN enrollment e ON p.unitid = e.unitid AND e.year = 2023
    AND e.level = 'undergraduate' AND e.race = 'APTS' AND e.gender = 'total'
LEFT JOIN financial_aid f ON p.unitid = f.unitid AND f.year = 2023
ORDER BY p.similarity DESC;
