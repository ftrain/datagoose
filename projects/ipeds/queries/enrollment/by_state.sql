-- Undergraduate enrollment by state
SELECT i.state,
       SUM(e.full_time) as total_enrollment,
       COUNT(DISTINCT i.unitid) as num_institutions,
       ROUND(SUM(e.full_time)::numeric / COUNT(DISTINCT i.unitid)) as avg_per_inst
FROM enrollment e
JOIN institution i ON e.unitid = i.unitid
WHERE e.year = 2023
  AND e.level = 'undergraduate'
  AND e.race = 'APTS'
  AND e.gender = 'total'
GROUP BY i.state
ORDER BY total_enrollment DESC;
