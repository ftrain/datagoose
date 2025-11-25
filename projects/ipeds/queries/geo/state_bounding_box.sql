-- Find all institutions within a bounding box (useful for map views)
-- Example: Greater Los Angeles area

SELECT
    i.unitid,
    i.name,
    i.city,
    i.latitude,
    i.longitude,
    s.label as sector,
    e.full_time as enrollment
FROM institution i
JOIN ref_sector s ON i.sector = s.code
LEFT JOIN enrollment e ON i.unitid = e.unitid AND e.year = 2023
    AND e.level = 'undergraduate' AND e.race = 'APTS' AND e.gender = 'total'
WHERE i.geom IS NOT NULL
  AND i.geom && ST_MakeEnvelope(-118.7, 33.5, -117.5, 34.4, 4326)  -- LA area bbox
ORDER BY e.full_time DESC NULLS LAST;
