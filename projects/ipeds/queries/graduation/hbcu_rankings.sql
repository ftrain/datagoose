-- HBCUs ranked by graduation rate
SELECT i.name, i.state,
       g.cohort_size,
       ROUND(g.grad_rate_150pct * 100, 1) as grad_rate
FROM graduation_rates g
JOIN institution i ON g.unitid = i.unitid
WHERE g.year = 2023
  AND g.cohort_type = 'bachelor'
  AND g.race = 'APTS'
  AND g.gender = 'total'
  AND i.hbcu = true
  AND g.cohort_size > 100
ORDER BY g.grad_rate_150pct DESC;
