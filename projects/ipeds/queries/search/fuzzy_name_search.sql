-- Fuzzy search for institution names using trigram similarity
-- Handles typos and partial matches
-- Example: Search for "standford" (misspelled Stanford)

SELECT
    i.name,
    i.city,
    i.state,
    s.label as sector,
    ROUND(similarity(i.name, 'standford')::numeric, 3) as match_score
FROM institution i
JOIN ref_sector s ON i.sector = s.code
WHERE i.name % 'standford'  -- trigram similarity operator
   OR i.name ILIKE '%standford%'
ORDER BY similarity(i.name, 'standford') DESC
LIMIT 15;
