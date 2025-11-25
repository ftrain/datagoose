-- Find more affordable alternatives to an expensive school
-- Finds similar institutions with lower net price
-- Example: Alternatives to NYU (unitid = 193900)

WITH target AS (
    SELECT i.unitid, i.feature_vector, i.name, f.avg_net_price_0_30k as target_price
    FROM institution i
    JOIN financial_aid f ON i.unitid = f.unitid AND f.year = 2023
    WHERE i.unitid = 193900
),
similar AS (
    SELECT
        i.unitid,
        i.name,
        i.city,
        i.state,
        1 - (i.feature_vector <=> target.feature_vector) as similarity,
        f.avg_net_price_0_30k as net_price,
        target.target_price
    FROM institution i, target
    JOIN financial_aid f ON i.unitid = f.unitid AND f.year = 2023
    WHERE i.feature_vector IS NOT NULL
      AND i.unitid != target.unitid
      AND f.avg_net_price_0_30k < target.target_price * 0.7  -- At least 30% cheaper
    ORDER BY i.feature_vector <=> target.feature_vector
    LIMIT 20
)
SELECT
    s.name,
    s.city,
    s.state,
    ROUND(s.similarity::numeric, 3) as similarity,
    s.net_price,
    s.target_price - s.net_price as savings,
    ROUND(g.grad_rate_150pct * 100, 1) as grad_rate
FROM similar s
LEFT JOIN graduation_rates g ON s.unitid = g.unitid AND g.year = 2023
    AND g.race = 'APTS' AND g.gender = 'total' AND g.cohort_type = 'bachelor'
ORDER BY s.similarity DESC;
