-- Fastest growing CS programs (2020 to 2024)
WITH cs_by_year AS (
    SELECT c.unitid, c.year, SUM(c.count) as degrees
    FROM completions c
    WHERE c.cip_code LIKE '11.%'
      AND c.award_level = 5
      AND c.race = 'APTS'
      AND c.gender = 'total'
    GROUP BY c.unitid, c.year
)
SELECT i.name, i.state,
       c2020.degrees as "2020",
       c2024.degrees as "2024",
       c2024.degrees - c2020.degrees as growth,
       ROUND((c2024.degrees - c2020.degrees)::numeric / c2020.degrees * 100, 1) as pct_growth
FROM cs_by_year c2020
JOIN cs_by_year c2024 ON c2020.unitid = c2024.unitid
JOIN institution i ON c2020.unitid = i.unitid
WHERE c2020.year = 2020 AND c2024.year = 2024
  AND c2020.degrees > 100
ORDER BY growth DESC
LIMIT 25;
