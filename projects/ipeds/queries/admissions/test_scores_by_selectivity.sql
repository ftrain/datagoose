-- Average test scores by selectivity tier
WITH tiers AS (
    SELECT unitid,
           CASE
               WHEN admit_rate < 0.10 THEN '1. <10% (Most Selective)'
               WHEN admit_rate < 0.25 THEN '2. 10-25%'
               WHEN admit_rate < 0.50 THEN '3. 25-50%'
               WHEN admit_rate < 0.75 THEN '4. 50-75%'
               ELSE '5. >75% (Least Selective)'
           END as tier,
           sat_math_75, sat_verbal_75, act_composite_75
    FROM admissions
    WHERE year = 2023 AND admit_rate IS NOT NULL
)
SELECT tier,
       COUNT(*) as schools,
       ROUND(AVG(sat_math_75)) as avg_sat_math_75,
       ROUND(AVG(sat_verbal_75)) as avg_sat_verbal_75,
       ROUND(AVG(act_composite_75)) as avg_act_75
FROM tiers
GROUP BY tier
ORDER BY tier;
