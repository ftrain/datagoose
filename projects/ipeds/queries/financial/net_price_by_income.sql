-- Net price by income bracket (public vs private)
SELECT
    CASE WHEN i.control = 1 THEN 'Public' ELSE 'Private' END as control,
    COUNT(*) as institutions,
    ROUND(AVG(f.avg_net_price_0_30k)) as "<30k",
    ROUND(AVG(f.avg_net_price_30_48k)) as "30-48k",
    ROUND(AVG(f.avg_net_price_48_75k)) as "48-75k",
    ROUND(AVG(f.avg_net_price_75_110k)) as "75-110k",
    ROUND(AVG(f.avg_net_price_110k_plus)) as ">110k"
FROM financial_aid f
JOIN institution i ON f.unitid = i.unitid
WHERE f.year = 2023
  AND i.level = 1  -- 4-year
  AND i.control IN (1, 2)  -- Public or Private nonprofit
GROUP BY i.control
ORDER BY i.control;
