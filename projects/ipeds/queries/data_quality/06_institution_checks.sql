-- Data Quality Tests: Institutions
-- These tests find suspicious or incorrect institution data

-- ============================================
-- TEST 1: Duplicate UNITIDs
-- ============================================
SELECT 'Duplicate UNITIDs' as test,
    unitid, COUNT(*) as count
FROM institution
GROUP BY unitid
HAVING COUNT(*) > 1
LIMIT 20;

-- ============================================
-- TEST 2: Invalid coordinates (outside US bounds)
-- ============================================
SELECT 'Invalid coordinates' as test,
    unitid, name, state, latitude, longitude
FROM institution
WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    AND (
        latitude < 17 OR latitude > 72  -- US latitude range (including AK, HI, PR)
        OR longitude < -180 OR longitude > -65  -- US longitude range
    )
LIMIT 20;

-- ============================================
-- TEST 3: Missing critical fields
-- ============================================
SELECT 'Missing name' as test, unitid, name, city, state
FROM institution WHERE name IS NULL OR name = ''
LIMIT 10;

SELECT 'Missing state' as test, unitid, name, city, state
FROM institution WHERE state IS NULL OR state = ''
LIMIT 10;

SELECT 'Missing city' as test, unitid, name, city, state
FROM institution WHERE city IS NULL OR city = ''
LIMIT 10;

-- ============================================
-- TEST 4: Invalid sector codes
-- ============================================
SELECT 'Invalid sector' as test,
    i.unitid, i.name, i.sector
FROM institution i
LEFT JOIN ref_sector rs ON i.sector = rs.code
WHERE rs.code IS NULL AND i.sector IS NOT NULL
LIMIT 20;

-- ============================================
-- TEST 5: Control/Level consistency with sector
-- ============================================
SELECT 'Control/Sector mismatch' as test,
    unitid, name, control, level, sector,
    CASE
        WHEN sector IN (1, 4, 7) THEN 'Public'
        WHEN sector IN (2, 5, 8) THEN 'Private nonprofit'
        WHEN sector IN (3, 6, 9) THEN 'Private for-profit'
    END as expected_control
FROM institution
WHERE (sector IN (1, 4, 7) AND control != 1)
   OR (sector IN (2, 5, 8) AND control != 2)
   OR (sector IN (3, 6, 9) AND control != 3)
LIMIT 20;

-- ============================================
-- TEST 6: Distribution by sector
-- ============================================
SELECT 'Sector distribution' as info,
    i.sector, rs.label,
    COUNT(*) as count
FROM institution i
LEFT JOIN ref_sector rs ON i.sector = rs.code
GROUP BY i.sector, rs.label
ORDER BY i.sector;

-- ============================================
-- TEST 7: Distribution by state
-- ============================================
SELECT 'State distribution' as info,
    state, COUNT(*) as institutions
FROM institution
GROUP BY state
ORDER BY COUNT(*) DESC;

-- ============================================
-- TEST 8: Institutions with no data in any table
-- ============================================
SELECT 'No data anywhere' as test,
    i.unitid, i.name, i.state, i.sector
FROM institution i
LEFT JOIN enrollment e ON i.unitid = e.unitid
LEFT JOIN admissions a ON i.unitid = a.unitid
LEFT JOIN graduation_rates g ON i.unitid = g.unitid
LEFT JOIN financial_aid f ON i.unitid = f.unitid
LEFT JOIN completions c ON i.unitid = c.unitid
WHERE e.unitid IS NULL
    AND a.unitid IS NULL
    AND g.unitid IS NULL
    AND f.unitid IS NULL
    AND c.unitid IS NULL
LIMIT 20;

-- ============================================
-- TEST 9: Carnegie classification distribution
-- ============================================
SELECT 'Carnegie distribution' as info,
    carnegie_basic, COUNT(*) as count
FROM institution
WHERE carnegie_basic IS NOT NULL
GROUP BY carnegie_basic
ORDER BY COUNT(*) DESC
LIMIT 20;

-- ============================================
-- TEST 10: HBCU flag validation
-- ============================================
SELECT 'HBCU distribution' as info,
    hbcu, COUNT(*) as count
FROM institution
GROUP BY hbcu;

-- Check HBCU locations make sense (should be mostly in southern states)
SELECT 'HBCU by state' as info,
    state, COUNT(*) as hbcus
FROM institution
WHERE hbcu = 1
GROUP BY state
ORDER BY COUNT(*) DESC;

