-- Full institution profile
-- Usage: Replace 166027 with the unitid of interest (Harvard = 166027)

WITH inst AS (SELECT 166027 as unitid)
SELECT 'Institution' as category, i.name as metric, '' as value
FROM institution i, inst WHERE i.unitid = inst.unitid

UNION ALL SELECT 'Location', i.city || ', ' || i.state, ''
FROM institution i, inst WHERE i.unitid = inst.unitid

UNION ALL SELECT 'Sector', s.label, ''
FROM institution i
JOIN ref_sector s ON i.sector = s.code, inst
WHERE i.unitid = inst.unitid

UNION ALL SELECT 'Admissions 2023', 'Applicants', a.applicants_total::text
FROM admissions a, inst WHERE a.unitid = inst.unitid AND a.year = 2023

UNION ALL SELECT 'Admissions 2023', 'Admit Rate', ROUND(a.admit_rate * 100, 1) || '%'
FROM admissions a, inst WHERE a.unitid = inst.unitid AND a.year = 2023

UNION ALL SELECT 'Admissions 2023', 'SAT Math 75th', a.sat_math_75::text
FROM admissions a, inst WHERE a.unitid = inst.unitid AND a.year = 2023

UNION ALL SELECT 'Graduation', '6-Year Rate', ROUND(g.grad_rate_150pct * 100, 1) || '%'
FROM graduation_rates g, inst
WHERE g.unitid = inst.unitid AND g.year = 2023 AND g.race = 'APTS' AND g.gender = 'total' AND g.cohort_type = 'bachelor'

UNION ALL SELECT 'Financial Aid', 'Net Price <$30k', '$' || f.avg_net_price_0_30k::text
FROM financial_aid f, inst WHERE f.unitid = inst.unitid AND f.year = 2023

UNION ALL SELECT 'Enrollment', 'Undergrad', e.full_time::text
FROM enrollment e, inst
WHERE e.unitid = inst.unitid AND e.year = 2023 AND e.level = 'undergraduate' AND e.race = 'APTS' AND e.gender = 'total';
