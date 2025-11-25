-- Data Quality Tests: Completions (Degrees Awarded)
-- These tests find suspicious or incorrect completions data

-- ============================================
-- TEST 1: Completions > Enrollment (suspicious for single year)
-- ============================================
SELECT 'Completions > Enrollment' as test,
    c.unitid, i.name, c.year,
    SUM(c.count) as completions,
    e.total as enrollment
FROM completions c
JOIN institution i ON c.unitid = i.unitid
JOIN enrollment e ON c.unitid = e.unitid AND c.year = e.year
    AND e.level = 'all' AND e.gender = 'total' AND e.race = 'APTS'
GROUP BY c.unitid, i.name, c.year, e.total
HAVING SUM(c.count) > e.total AND e.total > 1000
ORDER BY SUM(c.count) - e.total DESC
LIMIT 20;

-- ============================================
-- TEST 2: Negative completion counts
-- ============================================
SELECT 'Negative completions' as test,
    c.unitid, i.name, c.year, c.cip_code, c.award_level, c.count
FROM completions c
JOIN institution i ON c.unitid = i.unitid
WHERE c.count < 0
LIMIT 20;

-- ============================================
-- TEST 3: Single program with >10k completions in one year (unusual)
-- ============================================
SELECT 'Very high single program' as test,
    c.unitid, i.name, c.year, c.cip_code, r.title as program,
    c.award_level, c.count
FROM completions c
JOIN institution i ON c.unitid = i.unitid
LEFT JOIN ref_cip r ON c.cip_code = r.code
WHERE c.count > 10000
ORDER BY c.count DESC
LIMIT 20;

-- ============================================
-- TEST 4: Invalid CIP codes (not in reference table)
-- ============================================
SELECT 'Invalid CIP code' as test,
    c.cip_code,
    COUNT(DISTINCT c.unitid) as institutions,
    COUNT(*) as rows,
    SUM(c.count) as total_completions
FROM completions c
LEFT JOIN ref_cip r ON c.cip_code = r.code
WHERE r.code IS NULL
GROUP BY c.cip_code
ORDER BY SUM(c.count) DESC
LIMIT 20;

-- ============================================
-- TEST 5: Large year-over-year changes in total completions (>50%)
-- ============================================
WITH yearly AS (
    SELECT unitid, year, SUM(count) as total_completions
    FROM completions
    GROUP BY unitid, year
    HAVING SUM(count) >= 100
),
changes AS (
    SELECT
        y1.unitid, y1.year,
        y1.total_completions as current,
        y2.total_completions as prev,
        ROUND((y1.total_completions - y2.total_completions)::numeric / NULLIF(y2.total_completions, 0) * 100, 1) as pct_change
    FROM yearly y1
    JOIN yearly y2 ON y1.unitid = y2.unitid AND y1.year = y2.year + 1
)
SELECT 'Large completion change' as test, c.*, i.name
FROM changes c
JOIN institution i ON c.unitid = i.unitid
WHERE ABS(pct_change) > 50
ORDER BY ABS(pct_change) DESC
LIMIT 20;

-- ============================================
-- TEST 6: Award level distribution
-- ============================================
SELECT 'Award level distribution' as info,
    award_level,
    COUNT(DISTINCT unitid) as institutions,
    COUNT(*) as rows,
    SUM(count) as total_completions
FROM completions
GROUP BY award_level
ORDER BY SUM(count) DESC;

-- ============================================
-- TEST 7: Schools with no completions but have enrollment
-- ============================================
SELECT 'No completions but enrolled' as test,
    i.unitid, i.name, i.state,
    MAX(e.year) as latest_enrollment_year,
    MAX(e.total) as enrollment
FROM institution i
JOIN enrollment e ON i.unitid = e.unitid
    AND e.level = 'all' AND e.gender = 'total' AND e.race = 'APTS'
LEFT JOIN completions c ON i.unitid = c.unitid
WHERE c.unitid IS NULL
    AND e.total > 1000
GROUP BY i.unitid, i.name, i.state
ORDER BY MAX(e.total) DESC
LIMIT 20;

-- ============================================
-- TEST 8: CIP codes with suspiciously high completion rates
-- ============================================
SELECT 'Top CIP codes by volume' as info,
    c.cip_code, r.title,
    COUNT(DISTINCT c.unitid) as institutions,
    SUM(c.count) as total_completions,
    ROUND(AVG(c.count)::numeric, 1) as avg_per_school
FROM completions c
LEFT JOIN ref_cip r ON c.cip_code = r.code
WHERE c.year = (SELECT MAX(year) FROM completions)
GROUP BY c.cip_code, r.title
ORDER BY SUM(c.count) DESC
LIMIT 30;

