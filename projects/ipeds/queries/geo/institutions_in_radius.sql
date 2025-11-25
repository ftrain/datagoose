-- Find all 4-year institutions within radius, with stats
-- Example: 50 miles of San Francisco (37.7749, -122.4194)

WITH target AS (
    SELECT ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326) as point
),
nearby AS (
    SELECT
        i.unitid,
        i.name,
        i.city,
        i.state,
        ST_Distance(i.geom::geography, target.point::geography) / 1609.34 as miles_away
    FROM institution i, target
    WHERE i.geom IS NOT NULL
      AND i.level = 1  -- 4-year
      AND ST_DWithin(i.geom::geography, target.point::geography, 50 * 1609.34)
)
SELECT
    n.name,
    n.city,
    ROUND(n.miles_away::numeric, 1) as miles,
    ROUND(a.admit_rate * 100, 1) as admit_pct,
    ROUND(g.grad_rate_150pct * 100, 1) as grad_rate,
    e.full_time as enrollment
FROM nearby n
LEFT JOIN admissions a ON n.unitid = a.unitid AND a.year = 2023
LEFT JOIN graduation_rates g ON n.unitid = g.unitid AND g.year = 2023
    AND g.race = 'APTS' AND g.gender = 'total' AND g.cohort_type = 'bachelor'
LEFT JOIN enrollment e ON n.unitid = e.unitid AND e.year = 2023
    AND e.level = 'undergraduate' AND e.race = 'APTS' AND e.gender = 'total'
ORDER BY n.miles_away
LIMIT 25;
