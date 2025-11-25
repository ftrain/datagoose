-- Data Quality Tests: Cross-Table Consistency
-- These tests verify data consistency across related tables

-- ============================================
-- TEST 1: Year coverage comparison across tables
-- ============================================
SELECT 'Year coverage' as info,
    'admissions' as tbl, MIN(year) as min_year, MAX(year) as max_year, COUNT(DISTINCT year) as years FROM admissions
UNION ALL
SELECT 'Year coverage', 'graduation_rates', MIN(year), MAX(year), COUNT(DISTINCT year) FROM graduation_rates
UNION ALL
SELECT 'Year coverage', 'enrollment', MIN(year), MAX(year), COUNT(DISTINCT year) FROM enrollment
UNION ALL
SELECT 'Year coverage', 'completions', MIN(year), MAX(year), COUNT(DISTINCT year) FROM completions
UNION ALL
SELECT 'Year coverage', 'financial_aid', MIN(year), MAX(year), COUNT(DISTINCT year) FROM financial_aid;

-- ============================================
-- TEST 2: Institutions in data tables but not in institution table
-- ============================================
SELECT 'Orphan enrollment' as test, unitid, COUNT(*) as rows
FROM enrollment
WHERE unitid NOT IN (SELECT unitid FROM institution)
GROUP BY unitid
LIMIT 10;

SELECT 'Orphan admissions' as test, unitid, COUNT(*) as rows
FROM admissions
WHERE unitid NOT IN (SELECT unitid FROM institution)
GROUP BY unitid
LIMIT 10;

SELECT 'Orphan graduation' as test, unitid, COUNT(*) as rows
FROM graduation_rates
WHERE unitid NOT IN (SELECT unitid FROM institution)
GROUP BY unitid
LIMIT 10;

-- ============================================
-- TEST 3: Very selective schools with high Pell (unusual combination)
-- ============================================
SELECT 'Selective + High Pell' as test,
    a.unitid, i.name, a.year,
    ROUND(a.admit_rate * 100, 1) as admit_pct,
    ROUND(f.pct_pell, 1) as pell_pct
FROM admissions a
JOIN institution i ON a.unitid = i.unitid
JOIN financial_aid f ON a.unitid = f.unitid AND a.year = f.year
WHERE a.admit_rate < 0.15  -- Very selective
    AND f.pct_pell > 40     -- High Pell (unusual for elite schools)
    AND a.applicants_total > 5000
ORDER BY a.admit_rate
LIMIT 20;

-- ============================================
-- TEST 4: High graduation rate but low retention (suspicious)
-- ============================================
SELECT 'High grad, low retain' as test,
    i.unitid, i.name, i.retention_ft,
    g.year,
    ROUND(SUM(g.completers_150pct)::numeric / NULLIF(SUM(g.cohort_size), 0) * 100, 1) as grad_rate
FROM institution i
JOIN graduation_rates g ON i.unitid = g.unitid
WHERE i.retention_ft < 50  -- Low retention
    AND g.cohort_type = 'bachelor'
GROUP BY i.unitid, i.name, i.retention_ft, g.year
HAVING SUM(g.completers_150pct)::numeric / NULLIF(SUM(g.cohort_size), 0) > 0.8  -- High grad
    AND SUM(g.cohort_size) > 100
ORDER BY SUM(g.completers_150pct)::numeric / NULLIF(SUM(g.cohort_size), 0) DESC
LIMIT 20;

-- ============================================
-- TEST 5: Schools with admissions data but no enrollment
-- ============================================
SELECT 'Admissions no enrollment' as test,
    a.unitid, i.name, a.year,
    a.applicants_total, a.enrolled_total
FROM admissions a
JOIN institution i ON a.unitid = i.unitid
LEFT JOIN enrollment e ON a.unitid = e.unitid AND a.year = e.year
    AND e.level = 'all' AND e.gender = 'total' AND e.race = 'APTS'
WHERE e.unitid IS NULL
    AND a.applicants_total > 1000
ORDER BY a.applicants_total DESC
LIMIT 20;

-- ============================================
-- TEST 6: Admitted students vs actual enrollment mismatch
-- ============================================
SELECT 'Admit/Enroll mismatch' as test,
    a.unitid, i.name, a.year,
    a.enrolled_total as admitted_enrolled,
    e.total as total_enrolled,
    a.enrolled_total - e.total as diff
FROM admissions a
JOIN institution i ON a.unitid = i.unitid
JOIN enrollment e ON a.unitid = e.unitid AND a.year = e.year
    AND e.level = 'all' AND e.gender = 'total' AND e.race = 'APTS'
WHERE ABS(a.enrolled_total - e.total) > e.total * 0.5  -- 50% mismatch
    AND e.total > 1000
ORDER BY ABS(a.enrolled_total - e.total) DESC
LIMIT 20;

-- ============================================
-- TEST 7: Schools missing data for recent years
-- ============================================
WITH latest AS (
    SELECT unitid, MAX(year) as latest FROM admissions GROUP BY unitid
)
SELECT 'Missing recent admissions' as test,
    i.unitid, i.name, l.latest as last_admissions_year
FROM institution i
JOIN latest l ON i.unitid = l.unitid
WHERE l.latest < 2022
    AND i.sector IN (1, 2)  -- 4-year public or nonprofit
ORDER BY l.latest DESC
LIMIT 20;

-- ============================================
-- TEST 8: Data completeness by institution
-- ============================================
SELECT 'Data completeness' as info,
    i.unitid, i.name,
    (SELECT COUNT(DISTINCT year) FROM admissions WHERE unitid = i.unitid) as adm_years,
    (SELECT COUNT(DISTINCT year) FROM enrollment WHERE unitid = i.unitid AND level = 'all' AND gender = 'total' AND race = 'APTS') as enr_years,
    (SELECT COUNT(DISTINCT year) FROM graduation_rates WHERE unitid = i.unitid) as grad_years,
    (SELECT COUNT(DISTINCT year) FROM financial_aid WHERE unitid = i.unitid) as fin_years,
    (SELECT COUNT(DISTINCT year) FROM completions WHERE unitid = i.unitid) as comp_years
FROM institution i
WHERE i.sector IN (1, 2)  -- 4-year
ORDER BY i.name
LIMIT 50;

-- ============================================
-- TEST 9: ETL run summary
-- ============================================
SELECT 'ETL runs' as info,
    data_year, run_type, status, COUNT(*) as runs
FROM etl_run
GROUP BY data_year, run_type, status
ORDER BY data_year DESC, run_type;

