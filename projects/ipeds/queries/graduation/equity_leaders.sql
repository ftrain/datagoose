-- Institutions where Black students outperform White students
SELECT i.name, i.state,
       ROUND(w.grad_rate_150pct * 100, 1) as white_grad_rate,
       ROUND(b.grad_rate_150pct * 100, 1) as black_grad_rate,
       ROUND((b.grad_rate_150pct - w.grad_rate_150pct) * 100, 1) as black_advantage
FROM graduation_rates w
JOIN graduation_rates b ON w.unitid = b.unitid
    AND w.year = b.year
    AND w.cohort_type = b.cohort_type
    AND w.gender = b.gender
JOIN institution i ON w.unitid = i.unitid
WHERE w.year = 2023
  AND w.cohort_type = 'bachelor'
  AND w.gender = 'total'
  AND w.race = 'WHIT'
  AND b.race = 'BKAA'
  AND w.cohort_size > 50
  AND b.cohort_size > 50
  AND b.grad_rate_150pct > w.grad_rate_150pct
ORDER BY black_advantage DESC
LIMIT 25;
