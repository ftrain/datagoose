-- Data Quality Tests: Enrollment
-- These tests find suspicious or incorrect enrollment data

-- ============================================
-- TEST 1: Find duplicate enrollment totals (should only have one total per institution per year)
-- ============================================
SELECT 'Duplicate totals' as test, unitid, year, COUNT(*) as count
FROM enrollment
WHERE level = 'all' AND gender = 'total' AND race = 'APTS'
GROUP BY unitid, year
HAVING COUNT(*) > 1
LIMIT 20;

-- ============================================
-- TEST 2: Find unrealistically high enrollments (> 200k)
-- ============================================
SELECT 'Unrealistically high enrollment' as test,
    e.unitid, i.name, e.year, e.total
FROM enrollment e
JOIN institution i ON e.unitid = i.unitid
WHERE e.level = 'all' AND e.gender = 'total' AND e.race = 'APTS'
    AND e.total > 200000
ORDER BY e.total DESC
LIMIT 20;

-- ============================================
-- TEST 3: Find negative enrollment values
-- ============================================
SELECT 'Negative enrollment' as test,
    e.unitid, i.name, e.year, e.level, e.gender, e.race, e.total
FROM enrollment e
JOIN institution i ON e.unitid = i.unitid
WHERE e.total < 0
LIMIT 20;

-- ============================================
-- TEST 4: Institutions with 0 enrollment
-- ============================================
SELECT 'Zero enrollment' as test,
    e.unitid, i.name, e.year
FROM enrollment e
JOIN institution i ON e.unitid = i.unitid
WHERE e.level = 'all' AND e.gender = 'total' AND e.race = 'APTS'
    AND e.total = 0
    AND e.year = 2023
LIMIT 20;

-- ============================================
-- TEST 5: Year-over-year changes > 50% (may indicate data issues)
-- ============================================
WITH yearly AS (
    SELECT unitid, year, total
    FROM enrollment
    WHERE level = 'all' AND gender = 'total' AND race = 'APTS'
        AND total > 1000
),
changes AS (
    SELECT
        y1.unitid, y1.year as year,
        y1.total as current_enrollment,
        y2.total as prev_enrollment,
        ROUND((y1.total - y2.total)::numeric / NULLIF(y2.total, 0) * 100, 1) as pct_change
    FROM yearly y1
    JOIN yearly y2 ON y1.unitid = y2.unitid AND y1.year = y2.year + 1
)
SELECT 'Large YoY change (>50%)' as test, c.*, i.name
FROM changes c
JOIN institution i ON c.unitid = i.unitid
WHERE ABS(pct_change) > 50
ORDER BY ABS(pct_change) DESC
LIMIT 20;

-- ============================================
-- TEST 6: Missing enrollment data for recent years
-- ============================================
SELECT 'Missing 2023 enrollment' as test,
    i.unitid, i.name, i.state,
    MAX(e.year) as latest_year
FROM institution i
LEFT JOIN enrollment e ON i.unitid = e.unitid
    AND e.level = 'all' AND e.gender = 'total' AND e.race = 'APTS'
GROUP BY i.unitid, i.name, i.state
HAVING MAX(e.year) < 2023 OR MAX(e.year) IS NULL
LIMIT 20;

-- ============================================
-- TEST 7: Race breakdown doesn't match total (within 5%)
-- ============================================
WITH race_sum AS (
    SELECT unitid, year, SUM(total) as race_total
    FROM enrollment
    WHERE level = 'all' AND gender = 'total' AND race != 'APTS'
    GROUP BY unitid, year
),
totals AS (
    SELECT unitid, year, total
    FROM enrollment
    WHERE level = 'all' AND gender = 'total' AND race = 'APTS'
)
SELECT 'Race breakdown mismatch' as test,
    t.unitid, i.name, t.year,
    t.total as reported_total,
    r.race_total as sum_of_races,
    ROUND(ABS(t.total - r.race_total)::numeric / NULLIF(t.total, 0) * 100, 1) as pct_diff
FROM totals t
JOIN race_sum r ON t.unitid = r.unitid AND t.year = r.year
JOIN institution i ON t.unitid = i.unitid
WHERE t.total > 1000
    AND ABS(t.total - r.race_total)::numeric / NULLIF(t.total, 0) > 0.05
ORDER BY ABS(t.total - r.race_total) DESC
LIMIT 20;
