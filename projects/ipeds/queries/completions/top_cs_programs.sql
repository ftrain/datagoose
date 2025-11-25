-- Top computer science degree producers
SELECT i.name, i.state, SUM(c.count) as cs_degrees
FROM completions c
JOIN institution i ON c.unitid = i.unitid
WHERE c.year = 2023
  AND c.cip_code LIKE '11.%'  -- Computer and Information Sciences
  AND c.award_level = 5  -- Bachelor's
  AND c.race = 'APTS'
  AND c.gender = 'total'
GROUP BY i.unitid, i.name, i.state
ORDER BY cs_degrees DESC
LIMIT 25;
