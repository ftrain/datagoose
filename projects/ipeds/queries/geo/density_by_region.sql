-- Institution density by region (institutions per 10,000 sq miles)
-- Uses approximate state centroids and clustering

WITH state_stats AS (
    SELECT
        state,
        COUNT(*) as num_institutions,
        COUNT(*) FILTER (WHERE level = 1) as four_year,
        COUNT(*) FILTER (WHERE hbcu) as hbcus,
        AVG(ST_X(geom)) as avg_lon,
        AVG(ST_Y(geom)) as avg_lat
    FROM institution
    WHERE geom IS NOT NULL
    GROUP BY state
)
SELECT
    state,
    num_institutions,
    four_year,
    hbcus,
    ROUND(avg_lat::numeric, 2) as center_lat,
    ROUND(avg_lon::numeric, 2) as center_lon
FROM state_stats
ORDER BY num_institutions DESC
LIMIT 20;
