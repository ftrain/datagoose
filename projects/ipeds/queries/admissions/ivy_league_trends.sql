-- Ivy League admission rate trends over time
SELECT i.name,
       a2020.admit_rate as "2020",
       a2021.admit_rate as "2021",
       a2022.admit_rate as "2022",
       a2023.admit_rate as "2023"
FROM institution i
LEFT JOIN admissions a2020 ON i.unitid = a2020.unitid AND a2020.year = 2020
LEFT JOIN admissions a2021 ON i.unitid = a2021.unitid AND a2021.year = 2021
LEFT JOIN admissions a2022 ON i.unitid = a2022.unitid AND a2022.year = 2022
LEFT JOIN admissions a2023 ON i.unitid = a2023.unitid AND a2023.year = 2023
WHERE i.name IN ('Harvard University', 'Yale University', 'Princeton University',
                 'Columbia University in the City of New York', 'Brown University',
                 'University of Pennsylvania', 'Cornell University', 'Dartmouth College')
ORDER BY a2023.admit_rate;
