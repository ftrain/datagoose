-- Search for keywords in institution names
-- Example: Find all "Technical" or "Technology" schools

SELECT
    i.name,
    i.city,
    i.state,
    s.label as sector,
    ROUND(g.grad_rate_150pct * 100, 1) as grad_rate,
    e.full_time as enrollment
FROM institution i
JOIN ref_sector s ON i.sector = s.code
LEFT JOIN graduation_rates g ON i.unitid = g.unitid AND g.year = 2023
    AND g.race = 'APTS' AND g.gender = 'total' AND g.cohort_type = 'bachelor'
LEFT JOIN enrollment e ON i.unitid = e.unitid AND e.year = 2023
    AND e.level = 'undergraduate' AND e.race = 'APTS' AND e.gender = 'total'
WHERE i.name ~* '\m(technical|technology|tech)\M'  -- word boundary regex
ORDER BY e.full_time DESC NULLS LAST
LIMIT 30;
