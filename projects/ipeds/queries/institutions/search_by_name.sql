-- Search institutions by name (case insensitive)
-- Usage: Replace 'stanford' with your search term
SELECT i.unitid, i.name, i.city, i.state,
       s.label as sector,
       c.label as control,
       i.hbcu, i.tribal
FROM institution i
LEFT JOIN ref_sector s ON i.sector = s.code
LEFT JOIN ref_control c ON i.control = c.code
WHERE LOWER(i.name) LIKE '%stanford%'
ORDER BY i.name;
