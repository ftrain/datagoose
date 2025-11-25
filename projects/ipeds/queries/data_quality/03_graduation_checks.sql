-- Data Quality Tests: Graduation Rates
-- These tests find suspicious or incorrect graduation rate data

-- ============================================
-- TEST 1: Graduation rate > 100% (impossible)
-- ============================================
SELECT 'Grad rate > 100%' as test,
    g.unitid, i.name, g.year, g.cohort_type,
    SUM(g.cohort_size) as cohort,
    SUM(g.completers_150pct) as completers,
    ROUND(SUM(g.completers_150pct)::numeric / NULLIF(SUM(g.cohort_size), 0) * 100, 1) as grad_rate_pct
FROM graduation_rates g
JOIN institution i ON g.unitid = i.unitid
GROUP BY g.unitid, i.name, g.year, g.cohort_type
HAVING SUM(g.completers_150pct) > SUM(g.cohort_size)
    AND SUM(g.cohort_size) > 0
ORDER BY SUM(g.completers_150pct)::numeric / NULLIF(SUM(g.cohort_size), 0) DESC
LIMIT 20;

-- ============================================
-- TEST 2: Completers > Cohort size (at row level)
-- ============================================
SELECT 'Completers > Cohort' as test,
    g.unitid, i.name, g.year, g.cohort_type, g.race, g.gender,
    g.cohort_size, g.completers_150pct
FROM graduation_rates g
JOIN institution i ON g.unitid = i.unitid
WHERE g.completers_150pct > g.cohort_size
    AND g.cohort_size > 0
ORDER BY g.completers_150pct - g.cohort_size DESC
LIMIT 20;

-- ============================================
-- TEST 3: Negative values
-- ============================================
SELECT 'Negative values' as test,
    g.unitid, i.name, g.year, g.cohort_type,
    g.cohort_size, g.completers_150pct
FROM graduation_rates g
JOIN institution i ON g.unitid = i.unitid
WHERE g.cohort_size < 0 OR g.completers_150pct < 0
LIMIT 20;

-- ============================================
-- TEST 4: Large year-over-year changes (>20 percentage points)
-- ============================================
WITH yearly AS (
    SELECT
        unitid, year,
        SUM(cohort_size) as cohort,
        ROUND(SUM(completers_150pct)::numeric / NULLIF(SUM(cohort_size), 0) * 100, 1) as grad_rate
    FROM graduation_rates
    WHERE cohort_type = 'bachelor'
    GROUP BY unitid, year
    HAVING SUM(cohort_size) >= 100
),
changes AS (
    SELECT
        y1.unitid, y1.year,
        y1.grad_rate as current_rate,
        y2.grad_rate as prev_rate,
        y1.grad_rate - y2.grad_rate as rate_change
    FROM yearly y1
    JOIN yearly y2 ON y1.unitid = y2.unitid AND y1.year = y2.year + 1
)
SELECT 'Large grad rate change' as test, c.*, i.name
FROM changes c
JOIN institution i ON c.unitid = i.unitid
WHERE ABS(rate_change) > 20
ORDER BY ABS(rate_change) DESC
LIMIT 20;

-- ============================================
-- TEST 5: Schools with 0% graduation rate (suspicious for large cohorts)
-- ============================================
SELECT 'Zero grad rate (large cohort)' as test,
    g.unitid, i.name, g.year, g.cohort_type,
    SUM(g.cohort_size) as cohort,
    SUM(g.completers_150pct) as completers
FROM graduation_rates g
JOIN institution i ON g.unitid = i.unitid
WHERE g.cohort_type = 'bachelor'
GROUP BY g.unitid, i.name, g.year, g.cohort_type
HAVING SUM(g.cohort_size) >= 100 AND SUM(g.completers_150pct) = 0
ORDER BY SUM(g.cohort_size) DESC
LIMIT 20;

-- ============================================
-- TEST 6: Check for missing cohort types
-- ============================================
SELECT 'Distinct cohort types' as info,
    cohort_type, COUNT(DISTINCT unitid) as institutions, COUNT(*) as rows
FROM graduation_rates
GROUP BY cohort_type
ORDER BY COUNT(*) DESC;

-- ============================================
-- TEST 7: Race breakdown doesn't match total cohort
-- ============================================
WITH race_sum AS (
    SELECT unitid, year, cohort_type, SUM(cohort_size) as race_cohort
    FROM graduation_rates
    WHERE race != 'APTS' -- Assuming APTS is the total
    GROUP BY unitid, year, cohort_type
),
totals AS (
    SELECT unitid, year, cohort_type, SUM(cohort_size) as total_cohort
    FROM graduation_rates
    WHERE race = 'APTS'
    GROUP BY unitid, year, cohort_type
)
SELECT 'Race cohort mismatch' as test,
    t.unitid, i.name, t.year, t.cohort_type,
    t.total_cohort as reported_total,
    r.race_cohort as sum_of_races,
    ABS(t.total_cohort - r.race_cohort) as diff
FROM totals t
JOIN race_sum r ON t.unitid = r.unitid AND t.year = r.year AND t.cohort_type = r.cohort_type
JOIN institution i ON t.unitid = i.unitid
WHERE t.total_cohort > 100
    AND ABS(t.total_cohort - r.race_cohort) > t.total_cohort * 0.1
ORDER BY ABS(t.total_cohort - r.race_cohort) DESC
LIMIT 20;
