-- Most selective institutions (by admission rate)
-- Parameters: Minimum applicants, year
SELECT i.name, i.state,
       a.applicants_total,
       a.admitted_total,
       ROUND(a.admit_rate * 100, 2) as admit_pct,
       a.sat_math_75,
       a.act_composite_75
FROM admissions a
JOIN institution i ON a.unitid = i.unitid
WHERE a.year = 2023
  AND a.applicants_total > 5000
ORDER BY a.admit_rate ASC NULLS LAST
LIMIT 25;
