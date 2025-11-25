-- IPEDS Core Schema
-- Normalized tables for querying IPEDS data across years

-- ============================================================================
-- REFERENCE TABLES (code lookups)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ref_sector (
    code INTEGER PRIMARY KEY,
    label TEXT NOT NULL
);

INSERT INTO ref_sector (code, label) VALUES
    (0, 'Administrative Unit'),
    (1, 'Public, 4-year or above'),
    (2, 'Private not-for-profit, 4-year or above'),
    (3, 'Private for-profit, 4-year or above'),
    (4, 'Public, 2-year'),
    (5, 'Private not-for-profit, 2-year'),
    (6, 'Private for-profit, 2-year'),
    (7, 'Public, less-than 2-year'),
    (8, 'Private not-for-profit, less-than 2-year'),
    (9, 'Private for-profit, less-than 2-year'),
    (99, 'Sector unknown (not active)')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS ref_control (
    code INTEGER PRIMARY KEY,
    label TEXT NOT NULL
);

INSERT INTO ref_control (code, label) VALUES
    (1, 'Public'),
    (2, 'Private not-for-profit'),
    (3, 'Private for-profit'),
    (-3, 'Not available')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS ref_level (
    code INTEGER PRIMARY KEY,
    label TEXT NOT NULL
);

INSERT INTO ref_level (code, label) VALUES
    (1, 'Four or more years'),
    (2, 'At least 2 but less than 4 years'),
    (3, 'Less than 2 years (below associate)'),
    (-3, 'Not available')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS ref_race (
    code TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    sort_order INTEGER
);

INSERT INTO ref_race (code, label, sort_order) VALUES
    ('APTS', 'All students', 0),
    ('AIAN', 'American Indian or Alaska Native', 1),
    ('ASIA', 'Asian', 2),
    ('BKAA', 'Black or African American', 3),
    ('HISP', 'Hispanic', 4),
    ('NHPI', 'Native Hawaiian or Other Pacific Islander', 5),
    ('WHIT', 'White', 6),
    ('2MOR', 'Two or more races', 7),
    ('UNKN', 'Race/ethnicity unknown', 8),
    ('NRAL', 'U.S. Nonresident', 9)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- INSTITUTION (core entity, relatively stable over time)
-- ============================================================================

CREATE TABLE IF NOT EXISTS institution (
    unitid INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    city TEXT,
    state TEXT,
    zip TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    sector INTEGER REFERENCES ref_sector(code),
    control INTEGER REFERENCES ref_control(code),
    level INTEGER REFERENCES ref_level(code),
    hbcu BOOLEAN,
    tribal BOOLEAN,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_institution_state ON institution(state);
CREATE INDEX IF NOT EXISTS idx_institution_sector ON institution(sector);
CREATE INDEX IF NOT EXISTS idx_institution_control ON institution(control);
CREATE INDEX IF NOT EXISTS idx_institution_level ON institution(level);

-- ============================================================================
-- ADMISSIONS (one row per institution per year)
-- ============================================================================

CREATE TABLE IF NOT EXISTS admissions (
    unitid INTEGER NOT NULL REFERENCES institution(unitid),
    year INTEGER NOT NULL,
    applicants_total INTEGER,
    applicants_men INTEGER,
    applicants_women INTEGER,
    admitted_total INTEGER,
    admitted_men INTEGER,
    admitted_women INTEGER,
    enrolled_total INTEGER,
    enrolled_men INTEGER,
    enrolled_women INTEGER,
    admit_rate NUMERIC(5,4) GENERATED ALWAYS AS (
        CASE WHEN applicants_total > 0
        THEN admitted_total::numeric / applicants_total
        ELSE NULL END
    ) STORED,
    yield_rate NUMERIC(5,4) GENERATED ALWAYS AS (
        CASE WHEN admitted_total > 0
        THEN enrolled_total::numeric / admitted_total
        ELSE NULL END
    ) STORED,
    sat_verbal_25 INTEGER,
    sat_verbal_75 INTEGER,
    sat_math_25 INTEGER,
    sat_math_75 INTEGER,
    act_composite_25 INTEGER,
    act_composite_75 INTEGER,
    PRIMARY KEY (unitid, year)
);

CREATE INDEX IF NOT EXISTS idx_admissions_year ON admissions(year);
CREATE INDEX IF NOT EXISTS idx_admissions_admit_rate ON admissions(admit_rate);

-- ============================================================================
-- GRADUATION RATES (denormalized for query performance)
-- One row per institution/year/cohort_type/race/gender
-- ============================================================================

CREATE TABLE IF NOT EXISTS graduation_rates (
    unitid INTEGER NOT NULL REFERENCES institution(unitid),
    year INTEGER NOT NULL,
    cohort_type TEXT NOT NULL,  -- 'bachelor', 'associate', 'certificate'
    race TEXT NOT NULL REFERENCES ref_race(code),
    gender TEXT NOT NULL,  -- 'total', 'men', 'women'
    cohort_size INTEGER,
    completers_150pct INTEGER,  -- within 150% of normal time (6yr for bachelors)
    completers_100pct INTEGER,  -- within 100% of normal time (4yr for bachelors)
    transfer_out INTEGER,
    still_enrolled INTEGER,
    grad_rate_150pct NUMERIC(5,4) GENERATED ALWAYS AS (
        CASE WHEN cohort_size > 0
        THEN completers_150pct::numeric / cohort_size
        ELSE NULL END
    ) STORED,
    transfer_rate NUMERIC(5,4) GENERATED ALWAYS AS (
        CASE WHEN cohort_size > 0
        THEN transfer_out::numeric / cohort_size
        ELSE NULL END
    ) STORED,
    PRIMARY KEY (unitid, year, cohort_type, race, gender)
);

CREATE INDEX IF NOT EXISTS idx_grad_rates_year ON graduation_rates(year);
CREATE INDEX IF NOT EXISTS idx_grad_rates_cohort ON graduation_rates(cohort_type);
CREATE INDEX IF NOT EXISTS idx_grad_rates_race ON graduation_rates(race);

-- ============================================================================
-- GRADUATION RATES BY PELL STATUS
-- ============================================================================

CREATE TABLE IF NOT EXISTS graduation_rates_pell (
    unitid INTEGER NOT NULL REFERENCES institution(unitid),
    year INTEGER NOT NULL,
    cohort_type TEXT NOT NULL,  -- 'bachelor', 'less_than_4yr'
    pell_status TEXT NOT NULL,  -- 'pell', 'non_pell_loan', 'neither', 'total'
    cohort_size INTEGER,
    completers_150pct INTEGER,
    completers_100pct INTEGER,
    grad_rate_150pct NUMERIC(5,4) GENERATED ALWAYS AS (
        CASE WHEN cohort_size > 0
        THEN completers_150pct::numeric / cohort_size
        ELSE NULL END
    ) STORED,
    PRIMARY KEY (unitid, year, cohort_type, pell_status)
);

CREATE INDEX IF NOT EXISTS idx_grad_pell_year ON graduation_rates_pell(year);
CREATE INDEX IF NOT EXISTS idx_grad_pell_status ON graduation_rates_pell(pell_status);

-- ============================================================================
-- ENROLLMENT (fall enrollment by level, race, gender)
-- ============================================================================

CREATE TABLE IF NOT EXISTS enrollment (
    unitid INTEGER NOT NULL REFERENCES institution(unitid),
    year INTEGER NOT NULL,
    level TEXT NOT NULL,  -- 'undergraduate', 'graduate', 'first_professional'
    race TEXT NOT NULL REFERENCES ref_race(code),
    gender TEXT NOT NULL,  -- 'total', 'men', 'women'
    full_time INTEGER,
    part_time INTEGER,
    total INTEGER GENERATED ALWAYS AS (COALESCE(full_time, 0) + COALESCE(part_time, 0)) STORED,
    PRIMARY KEY (unitid, year, level, race, gender)
);

CREATE INDEX IF NOT EXISTS idx_enrollment_year ON enrollment(year);
CREATE INDEX IF NOT EXISTS idx_enrollment_level ON enrollment(level);

-- ============================================================================
-- COMPLETIONS (degrees awarded by CIP code)
-- ============================================================================

CREATE TABLE IF NOT EXISTS completions (
    unitid INTEGER NOT NULL REFERENCES institution(unitid),
    year INTEGER NOT NULL,
    cip_code TEXT NOT NULL,  -- 6-digit CIP code
    award_level INTEGER NOT NULL,  -- 1=cert<1yr, 2=cert1-2yr, 3=assoc, 5=bach, 7=masters, etc
    race TEXT NOT NULL REFERENCES ref_race(code),
    gender TEXT NOT NULL,
    count INTEGER,
    PRIMARY KEY (unitid, year, cip_code, award_level, race, gender)
);

CREATE INDEX IF NOT EXISTS idx_completions_year ON completions(year);
CREATE INDEX IF NOT EXISTS idx_completions_cip ON completions(cip_code);
CREATE INDEX IF NOT EXISTS idx_completions_cip4 ON completions(LEFT(cip_code, 4));
CREATE INDEX IF NOT EXISTS idx_completions_award ON completions(award_level);

-- ============================================================================
-- STUDENT FINANCIAL AID (for Pell eligibility queries)
-- ============================================================================

CREATE TABLE IF NOT EXISTS financial_aid (
    unitid INTEGER NOT NULL REFERENCES institution(unitid),
    year INTEGER NOT NULL,
    undergrad_enrolled INTEGER,
    pell_recipients INTEGER,
    pell_pct NUMERIC(5,4) GENERATED ALWAYS AS (
        CASE WHEN undergrad_enrolled > 0
        THEN pell_recipients::numeric / undergrad_enrolled
        ELSE NULL END
    ) STORED,
    avg_net_price INTEGER,
    avg_net_price_0_30k INTEGER,
    avg_net_price_30_48k INTEGER,
    avg_net_price_48_75k INTEGER,
    avg_net_price_75_110k INTEGER,
    avg_net_price_110k_plus INTEGER,
    PRIMARY KEY (unitid, year)
);

CREATE INDEX IF NOT EXISTS idx_finaid_year ON financial_aid(year);
CREATE INDEX IF NOT EXISTS idx_finaid_pell_pct ON financial_aid(pell_pct);

-- ============================================================================
-- COMPARATOR GROUPS (for vector mapping query)
-- ============================================================================

CREATE TABLE IF NOT EXISTS comparator_groups (
    unitid INTEGER NOT NULL REFERENCES institution(unitid),
    comparator_unitid INTEGER NOT NULL REFERENCES institution(unitid),
    year INTEGER NOT NULL,
    group_type TEXT NOT NULL,  -- 'custom', 'auto'
    PRIMARY KEY (unitid, comparator_unitid, year)
);

CREATE INDEX IF NOT EXISTS idx_comparators_year ON comparator_groups(year);

-- ============================================================================
-- CONVENIENCE VIEWS
-- ============================================================================

CREATE OR REPLACE VIEW v_institutions AS
SELECT
    i.unitid,
    i.name,
    i.city,
    i.state,
    i.latitude,
    i.longitude,
    s.label as sector,
    c.label as control,
    l.label as level,
    i.hbcu,
    i.tribal
FROM institution i
LEFT JOIN ref_sector s ON i.sector = s.code
LEFT JOIN ref_control c ON i.control = c.code
LEFT JOIN ref_level l ON i.level = l.code;

CREATE OR REPLACE VIEW v_bachelor_institutions AS
SELECT * FROM v_institutions WHERE level = 'Four or more years';

CREATE OR REPLACE VIEW v_associate_institutions AS
SELECT * FROM v_institutions WHERE level = 'At least 2 but less than 4 years';
