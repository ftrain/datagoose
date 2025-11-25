-- Find nearest HBCUs to any location
-- Example: From Chicago (41.8781, -87.6298)

WITH target AS (
    SELECT ST_SetSRID(ST_MakePoint(-87.6298, 41.8781), 4326) as point
)
SELECT
    i.name,
    i.city,
    i.state,
    ROUND((ST_Distance(i.geom::geography, target.point::geography) / 1609.34)::numeric, 0) as miles_away,
    ROUND(g.grad_rate_150pct * 100, 1) as grad_rate,
    e.full_time as enrollment
FROM institution i, target
LEFT JOIN graduation_rates g ON i.unitid = g.unitid AND g.year = 2023
    AND g.race = 'APTS' AND g.gender = 'total' AND g.cohort_type = 'bachelor'
LEFT JOIN enrollment e ON i.unitid = e.unitid AND e.year = 2023
    AND e.level = 'undergraduate' AND e.race = 'APTS' AND e.gender = 'total'
WHERE i.hbcu = true
  AND i.geom IS NOT NULL
ORDER BY ST_Distance(i.geom::geography, target.point::geography)
LIMIT 15;
