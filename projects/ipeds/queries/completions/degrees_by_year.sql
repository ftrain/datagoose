-- Total degrees awarded by year and level
SELECT year,
       SUM(CASE WHEN award_level = 3 THEN count END) as associate,
       SUM(CASE WHEN award_level = 5 THEN count END) as bachelor,
       SUM(CASE WHEN award_level = 7 THEN count END) as master,
       SUM(CASE WHEN award_level IN (17, 18, 19) THEN count END) as doctorate
FROM completions
WHERE race = 'APTS' AND gender = 'total'
GROUP BY year
ORDER BY year;
