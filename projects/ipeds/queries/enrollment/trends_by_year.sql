-- Enrollment trends by year and level
SELECT year,
       SUM(CASE WHEN level = 'undergraduate' THEN full_time END) as undergrad,
       SUM(CASE WHEN level = 'graduate' THEN full_time END) as graduate,
       SUM(full_time) as total
FROM enrollment
WHERE race = 'APTS' AND gender = 'total'
GROUP BY year
ORDER BY year;
