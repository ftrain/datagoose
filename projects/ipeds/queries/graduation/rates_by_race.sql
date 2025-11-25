-- Graduation rates by race (national averages)
SELECT r.label as race,
       ROUND(AVG(g.grad_rate_150pct) * 100, 1) as avg_grad_rate,
       COUNT(DISTINCT g.unitid) as institutions,
       SUM(g.cohort_size) as total_cohort
FROM graduation_rates g
JOIN ref_race r ON g.race = r.code
WHERE g.year = 2023
  AND g.cohort_type = 'bachelor'
  AND g.gender = 'total'
  AND g.cohort_size > 10
GROUP BY r.label, r.sort_order
ORDER BY r.sort_order;
