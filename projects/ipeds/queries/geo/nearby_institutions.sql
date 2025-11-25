-- Find institutions within X miles of a location
-- Example: Schools within 25 miles of downtown Boston (42.3601, -71.0589)

WITH target AS (
    SELECT ST_SetSRID(ST_MakePoint(-71.0589, 42.3601), 4326) as point
)
SELECT
    i.name,
    i.city,
    i.state,
    ROUND((ST_Distance(i.geom::geography, target.point::geography) / 1609.34)::numeric, 1) as miles_away,
    s.label as sector
FROM institution i
CROSS JOIN target
LEFT JOIN ref_sector s ON i.sector = s.code
WHERE i.geom IS NOT NULL
  AND ST_DWithin(i.geom::geography, target.point::geography, 25 * 1609.34)  -- 25 miles in meters
ORDER BY ST_Distance(i.geom::geography, target.point::geography)
LIMIT 30;
