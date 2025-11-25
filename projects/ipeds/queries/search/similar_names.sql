-- Find institutions with similar names (deduplication helper)
-- Uses trigram similarity to find potential duplicates

SELECT
    a.name as institution_1,
    b.name as institution_2,
    a.city as city_1,
    b.city as city_2,
    a.state as state_1,
    b.state as state_2,
    ROUND(similarity(a.name, b.name)::numeric, 3) as name_similarity
FROM institution a
JOIN institution b ON a.unitid < b.unitid
WHERE similarity(a.name, b.name) > 0.5
  AND a.state = b.state  -- same state
ORDER BY similarity(a.name, b.name) DESC
LIMIT 30;
