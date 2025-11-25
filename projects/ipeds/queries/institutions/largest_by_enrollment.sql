-- Largest institutions by undergraduate enrollment
SELECT i.name, i.state,
       CASE i.control WHEN 1 THEN 'Public' WHEN 2 THEN 'Private NP' ELSE 'For-profit' END as control,
       e.full_time as enrollment
FROM enrollment e
JOIN institution i ON e.unitid = i.unitid
WHERE e.year = 2023
  AND e.level = 'undergraduate'
  AND e.race = 'APTS'
  AND e.gender = 'total'
ORDER BY e.full_time DESC
LIMIT 30;
