-- Gender breakdown by major field (bachelor's degrees)
SELECT
    CASE
        WHEN cip_code LIKE '14.%' THEN 'Engineering'
        WHEN cip_code LIKE '11.%' THEN 'Computer Science'
        WHEN cip_code LIKE '51.%' THEN 'Health Professions'
        WHEN cip_code LIKE '52.%' THEN 'Business'
        WHEN cip_code LIKE '13.%' THEN 'Education'
        WHEN cip_code LIKE '42.%' THEN 'Psychology'
        WHEN cip_code LIKE '26.%' THEN 'Biological Sciences'
        WHEN cip_code LIKE '45.%' THEN 'Social Sciences'
        WHEN cip_code LIKE '27.%' THEN 'Mathematics'
        WHEN cip_code LIKE '40.%' THEN 'Physical Sciences'
    END as field,
    SUM(CASE WHEN gender = 'men' THEN count ELSE 0 END) as men,
    SUM(CASE WHEN gender = 'women' THEN count ELSE 0 END) as women,
    ROUND(SUM(CASE WHEN gender = 'women' THEN count ELSE 0 END)::numeric /
          NULLIF(SUM(CASE WHEN gender IN ('men','women') THEN count END), 0) * 100, 1) as pct_women
FROM completions
WHERE year = 2023
  AND award_level = 5
  AND race = 'APTS'
  AND cip_code SIMILAR TO '(14|11|51|52|13|42|26|45|27|40).%'
GROUP BY
    CASE
        WHEN cip_code LIKE '14.%' THEN 'Engineering'
        WHEN cip_code LIKE '11.%' THEN 'Computer Science'
        WHEN cip_code LIKE '51.%' THEN 'Health Professions'
        WHEN cip_code LIKE '52.%' THEN 'Business'
        WHEN cip_code LIKE '13.%' THEN 'Education'
        WHEN cip_code LIKE '42.%' THEN 'Psychology'
        WHEN cip_code LIKE '26.%' THEN 'Biological Sciences'
        WHEN cip_code LIKE '45.%' THEN 'Social Sciences'
        WHEN cip_code LIKE '27.%' THEN 'Mathematics'
        WHEN cip_code LIKE '40.%' THEN 'Physical Sciences'
    END
ORDER BY pct_women;
