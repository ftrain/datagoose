-- Summary statistics by year
SELECT
    'Institutions' as metric,
    (SELECT COUNT(*) FROM institution) as value
UNION ALL
SELECT 'Years of data', COUNT(DISTINCT year) FROM admissions
UNION ALL
SELECT 'Total completions records', COUNT(*) FROM completions
UNION ALL
SELECT 'Total enrollment records', COUNT(*) FROM enrollment;

-- Data by year
SELECT year,
       COUNT(DISTINCT a.unitid) as institutions_with_admissions,
       (SELECT COUNT(*) FROM graduation_rates WHERE year = a.year) as grad_rate_records,
       (SELECT COUNT(*) FROM enrollment WHERE year = a.year) as enrollment_records,
       (SELECT COUNT(*) FROM completions WHERE year = a.year) as completion_records,
       (SELECT COUNT(*) FROM financial_aid WHERE year = a.year) as financial_aid_records
FROM admissions a
GROUP BY year
ORDER BY year DESC;
