-- States with highest % of students at public institutions
SELECT i.state,
       SUM(CASE WHEN i.control = 1 THEN e.full_time END) as public_enrollment,
       SUM(e.full_time) as total_enrollment,
       ROUND(SUM(CASE WHEN i.control = 1 THEN e.full_time END)::numeric /
             SUM(e.full_time) * 100, 1) as pct_public
FROM enrollment e
JOIN institution i ON e.unitid = i.unitid
WHERE e.year = 2023
  AND e.level = 'undergraduate'
  AND e.race = 'APTS'
  AND e.gender = 'total'
GROUP BY i.state
HAVING SUM(e.full_time) > 50000
ORDER BY pct_public DESC;
