-- Find institutions matching a desired profile using vector search
-- Profile vector: [admit_rate, grad_rate, size, pell_pct, affordability, sat, public, 4year, hbcu, research]
-- Example: Selective (0.1), high grad rate (0.9), medium size (0.5),
--          moderate pell (0.3), affordable (0.7), high SAT (0.9),
--          private (0), 4-year (1), not HBCU (0), research (0.8)

WITH target_profile AS (
    SELECT '[0.1, 0.9, 0.5, 0.3, 0.7, 0.9, 0, 1, 0, 0.8]'::vector as profile
)
SELECT
    i.name,
    i.city,
    i.state,
    1 - (i.feature_vector <=> target_profile.profile) as match_score,
    ROUND(a.admit_rate * 100, 1) as admit_pct,
    ROUND(g.grad_rate_150pct * 100, 1) as grad_rate,
    a.sat_math_75,
    f.avg_net_price_0_30k as net_price_low_income
FROM institution i, target_profile
LEFT JOIN admissions a ON i.unitid = a.unitid AND a.year = 2023
LEFT JOIN graduation_rates g ON i.unitid = g.unitid AND g.year = 2023
    AND g.race = 'APTS' AND g.gender = 'total' AND g.cohort_type = 'bachelor'
LEFT JOIN financial_aid f ON i.unitid = f.unitid AND f.year = 2023
WHERE i.feature_vector IS NOT NULL
  AND i.level = 1  -- 4-year only
ORDER BY i.feature_vector <=> target_profile.profile
LIMIT 20;
