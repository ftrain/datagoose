-- Data Quality Tests: Admissions
-- These tests find suspicious or incorrect admissions data

-- ============================================
-- TEST 1: Admitted > Applicants (impossible)
-- ============================================
SELECT 'Admitted > Applicants' as test,
    a.unitid, i.name, a.year,
    a.applicants_total, a.admitted_total,
    ROUND(a.admitted_total::numeric / NULLIF(a.applicants_total, 0) * 100, 1) as admit_rate_pct
FROM admissions a
JOIN institution i ON a.unitid = i.unitid
WHERE a.admitted_total > a.applicants_total
    AND a.applicants_total > 0
ORDER BY a.admitted_total - a.applicants_total DESC
LIMIT 20;

-- ============================================
-- TEST 2: Enrolled > Admitted (impossible)
-- ============================================
SELECT 'Enrolled > Admitted' as test,
    a.unitid, i.name, a.year,
    a.admitted_total, a.enrolled_total
FROM admissions a
JOIN institution i ON a.unitid = i.unitid
WHERE a.enrolled_total > a.admitted_total
    AND a.admitted_total > 0
ORDER BY a.enrolled_total - a.admitted_total DESC
LIMIT 20;

-- ============================================
-- TEST 3: Unrealistic admit rates (< 1% or 100% for large schools)
-- ============================================
SELECT 'Suspicious admit rate' as test,
    a.unitid, i.name, a.year,
    a.applicants_total, a.admitted_total,
    ROUND(a.admit_rate * 100, 1) as admit_rate_pct
FROM admissions a
JOIN institution i ON a.unitid = i.unitid
WHERE a.applicants_total >= 1000
    AND (a.admit_rate < 0.01 OR a.admit_rate > 0.99)
ORDER BY a.admit_rate
LIMIT 20;

-- ============================================
-- TEST 4: SAT scores outside valid range (200-800 per section)
-- ============================================
SELECT 'Invalid SAT scores' as test,
    a.unitid, i.name, a.year,
    a.sat_verbal_25, a.sat_verbal_75, a.sat_math_25, a.sat_math_75
FROM admissions a
JOIN institution i ON a.unitid = i.unitid
WHERE (a.sat_verbal_25 NOT BETWEEN 200 AND 800 AND a.sat_verbal_25 IS NOT NULL)
   OR (a.sat_verbal_75 NOT BETWEEN 200 AND 800 AND a.sat_verbal_75 IS NOT NULL)
   OR (a.sat_math_25 NOT BETWEEN 200 AND 800 AND a.sat_math_25 IS NOT NULL)
   OR (a.sat_math_75 NOT BETWEEN 200 AND 800 AND a.sat_math_75 IS NOT NULL)
LIMIT 20;

-- ============================================
-- TEST 5: 25th percentile > 75th percentile (impossible)
-- ============================================
SELECT 'SAT 25th > 75th percentile' as test,
    a.unitid, i.name, a.year,
    a.sat_verbal_25, a.sat_verbal_75, a.sat_math_25, a.sat_math_75
FROM admissions a
JOIN institution i ON a.unitid = i.unitid
WHERE (a.sat_verbal_25 > a.sat_verbal_75 AND a.sat_verbal_25 IS NOT NULL AND a.sat_verbal_75 IS NOT NULL)
   OR (a.sat_math_25 > a.sat_math_75 AND a.sat_math_25 IS NOT NULL AND a.sat_math_75 IS NOT NULL)
LIMIT 20;

-- ============================================
-- TEST 6: ACT scores outside valid range (1-36)
-- ============================================
SELECT 'Invalid ACT scores' as test,
    a.unitid, i.name, a.year,
    a.act_composite_25, a.act_composite_75
FROM admissions a
JOIN institution i ON a.unitid = i.unitid
WHERE (a.act_composite_25 NOT BETWEEN 1 AND 36 AND a.act_composite_25 IS NOT NULL)
   OR (a.act_composite_75 NOT BETWEEN 1 AND 36 AND a.act_composite_75 IS NOT NULL)
LIMIT 20;

-- ============================================
-- TEST 7: Large year-over-year swings in admit rate (>20 percentage points)
-- ============================================
WITH yearly AS (
    SELECT unitid, year, admit_rate
    FROM admissions
    WHERE applicants_total >= 1000
),
changes AS (
    SELECT
        y1.unitid, y1.year,
        y1.admit_rate as current_rate,
        y2.admit_rate as prev_rate,
        ROUND((y1.admit_rate - y2.admit_rate) * 100, 1) as rate_change_pp
    FROM yearly y1
    JOIN yearly y2 ON y1.unitid = y2.unitid AND y1.year = y2.year + 1
)
SELECT 'Large admit rate change' as test, c.*, i.name
FROM changes c
JOIN institution i ON c.unitid = i.unitid
WHERE ABS(rate_change_pp) > 20
ORDER BY ABS(rate_change_pp) DESC
LIMIT 20;

-- ============================================
-- TEST 8: Yield rate > 100% (enrolled > admitted)
-- ============================================
SELECT 'Yield rate > 100%' as test,
    a.unitid, i.name, a.year,
    a.admitted_total, a.enrolled_total,
    ROUND(a.yield_rate * 100, 1) as yield_rate_pct
FROM admissions a
JOIN institution i ON a.unitid = i.unitid
WHERE a.yield_rate > 1
    AND a.admitted_total > 0
ORDER BY a.yield_rate DESC
LIMIT 20;
