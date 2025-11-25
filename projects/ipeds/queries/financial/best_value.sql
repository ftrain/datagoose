-- Best value: high graduation rate + low net price for low-income students
SELECT i.name, i.state,
       ROUND(g.grad_rate_150pct * 100, 1) as grad_rate,
       f.avg_net_price_0_30k as net_price_low_income,
       ROUND(g.grad_rate_150pct * 1000 / NULLIF(f.avg_net_price_0_30k, 0), 2) as value_score
FROM graduation_rates g
JOIN financial_aid f ON g.unitid = f.unitid AND g.year = f.year
JOIN institution i ON g.unitid = i.unitid
WHERE g.year = 2023
  AND g.cohort_type = 'bachelor'
  AND g.race = 'APTS'
  AND g.gender = 'total'
  AND g.cohort_size > 200
  AND f.avg_net_price_0_30k > 0
  AND i.control IN (1, 2)  -- Public or private nonprofit
ORDER BY value_score DESC
LIMIT 30;
