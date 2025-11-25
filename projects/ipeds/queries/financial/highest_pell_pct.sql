-- Institutions with highest Pell grant recipient percentage
SELECT i.name, i.state,
       f.undergrad_enrolled,
       f.pell_recipients,
       ROUND(f.pell_pct * 100, 1) as pell_pct
FROM financial_aid f
JOIN institution i ON f.unitid = i.unitid
WHERE f.year = 2023
  AND f.undergrad_enrolled > 1000
  AND f.pell_recipients IS NOT NULL
ORDER BY f.pell_pct DESC
LIMIT 30;
