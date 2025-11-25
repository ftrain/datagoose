-- Pell grant graduation gap (Pell vs overall)
SELECT
    i.name,
    i.state,
    pell.cohort_size as pell_cohort,
    ROUND(pell.grad_rate_150pct * 100, 1) as pell_grad_rate,
    ROUND(total.grad_rate_150pct * 100, 1) as overall_grad_rate,
    ROUND((total.grad_rate_150pct - pell.grad_rate_150pct) * 100, 1) as gap_pct_points
FROM graduation_rates_pell pell
JOIN graduation_rates_pell total
    ON pell.unitid = total.unitid
    AND pell.year = total.year
    AND pell.cohort_type = total.cohort_type
JOIN institution i ON pell.unitid = i.unitid
WHERE pell.year = 2023
  AND pell.pell_status = 'pell'
  AND total.pell_status = 'total'
  AND pell.cohort_size > 200
ORDER BY gap_pct_points DESC
LIMIT 25;
