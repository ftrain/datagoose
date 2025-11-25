-- Data Quality Tests: Financial Aid
-- These tests find suspicious or incorrect financial aid data
-- Note: Table has columns: unitid, year, undergrad_enrolled, pell_recipients, pell_pct (generated),
--       avg_net_price, avg_net_price_0_30k, avg_net_price_30_48k, avg_net_price_48_75k,
--       avg_net_price_75_110k, avg_net_price_110k_plus

-- ============================================
-- TEST 1: Negative net price (should be rare but possible with aid)
-- ============================================
SELECT 'Negative net price' as test,
    f.unitid, i.name, f.year,
    f.avg_net_price
FROM financial_aid f
JOIN institution i ON f.unitid = i.unitid
WHERE f.avg_net_price < 0
ORDER BY f.avg_net_price
LIMIT 20;

-- ============================================
-- TEST 2: Net price > $100k (unrealistically high)
-- ============================================
SELECT 'Net price > 100k' as test,
    f.unitid, i.name, f.year,
    f.avg_net_price
FROM financial_aid f
JOIN institution i ON f.unitid = i.unitid
WHERE f.avg_net_price > 100000
ORDER BY f.avg_net_price DESC
LIMIT 20;

-- ============================================
-- TEST 3: Pell recipients > undergrad enrolled
-- ============================================
SELECT 'Pell > enrolled' as test,
    f.unitid, i.name, f.year,
    f.pell_recipients, f.undergrad_enrolled,
    ROUND(f.pell_pct * 100, 1) as pell_pct
FROM financial_aid f
JOIN institution i ON f.unitid = i.unitid
WHERE f.pell_recipients > f.undergrad_enrolled
    AND f.undergrad_enrolled > 0
ORDER BY f.pell_recipients - f.undergrad_enrolled DESC
LIMIT 20;

-- ============================================
-- TEST 4: Pell percentage > 100% or negative
-- ============================================
SELECT 'Invalid Pell %' as test,
    f.unitid, i.name, f.year,
    f.pell_recipients, f.undergrad_enrolled,
    ROUND(f.pell_pct * 100, 1) as pell_pct
FROM financial_aid f
JOIN institution i ON f.unitid = i.unitid
WHERE f.pell_pct IS NOT NULL
    AND (f.pell_pct < 0 OR f.pell_pct > 1)
LIMIT 20;

-- ============================================
-- TEST 5: Large year-over-year price changes (>30%)
-- ============================================
WITH changes AS (
    SELECT
        y1.unitid, y1.year,
        y1.avg_net_price as current_price,
        y2.avg_net_price as prev_price,
        ROUND((y1.avg_net_price - y2.avg_net_price)::numeric / NULLIF(y2.avg_net_price, 0) * 100, 1) as pct_change
    FROM financial_aid y1
    JOIN financial_aid y2 ON y1.unitid = y2.unitid AND y1.year = y2.year + 1
    WHERE y1.avg_net_price > 5000 AND y2.avg_net_price > 5000
)
SELECT 'Large net price change' as test, c.*, i.name
FROM changes c
JOIN institution i ON c.unitid = i.unitid
WHERE ABS(pct_change) > 30
ORDER BY ABS(pct_change) DESC
LIMIT 20;

-- ============================================
-- TEST 6: Income bracket pricing inversions (lower income paying more)
-- ============================================
SELECT 'Low income paying more' as test,
    f.unitid, i.name, f.year,
    f.avg_net_price_0_30k as low_income,
    f.avg_net_price_110k_plus as high_income
FROM financial_aid f
JOIN institution i ON f.unitid = i.unitid
WHERE f.avg_net_price_0_30k > f.avg_net_price_110k_plus
    AND f.avg_net_price_0_30k IS NOT NULL
    AND f.avg_net_price_110k_plus IS NOT NULL
    AND f.avg_net_price_110k_plus > 0
ORDER BY f.avg_net_price_0_30k - f.avg_net_price_110k_plus DESC
LIMIT 20;

-- ============================================
-- TEST 7: Summary statistics by year
-- ============================================
SELECT 'Summary by year' as info,
    year,
    COUNT(DISTINCT unitid) as institutions,
    ROUND(AVG(avg_net_price)::numeric, 0) as avg_net_price,
    ROUND(AVG(pell_pct * 100)::numeric, 1) as avg_pell_pct,
    ROUND(AVG(undergrad_enrolled)::numeric, 0) as avg_enrollment
FROM financial_aid
WHERE avg_net_price IS NOT NULL
GROUP BY year
ORDER BY year;

-- ============================================
-- TEST 8: Schools with unusually low Pell rates (<5% for public schools)
-- ============================================
SELECT 'Low Pell rate (public)' as test,
    f.unitid, i.name, i.state, f.year,
    ROUND(f.pell_pct * 100, 1) as pell_pct
FROM financial_aid f
JOIN institution i ON f.unitid = i.unitid
WHERE i.control = 1  -- Public
    AND f.pell_pct < 0.05
    AND f.pell_pct IS NOT NULL
    AND f.year = (SELECT MAX(year) FROM financial_aid)
ORDER BY f.pell_pct
LIMIT 20;

-- ============================================
-- TEST 9: Very high Pell rates (>90%, verify legitimacy)
-- ============================================
SELECT 'Very high Pell rate' as test,
    f.unitid, i.name, i.state, i.sector, f.year,
    ROUND(f.pell_pct * 100, 1) as pell_pct,
    f.undergrad_enrolled
FROM financial_aid f
JOIN institution i ON f.unitid = i.unitid
WHERE f.pell_pct > 0.9
    AND f.pell_pct IS NOT NULL
    AND f.undergrad_enrolled > 500
    AND f.year = (SELECT MAX(year) FROM financial_aid)
ORDER BY f.pell_pct DESC
LIMIT 20;

