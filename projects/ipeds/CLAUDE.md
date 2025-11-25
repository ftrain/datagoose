# IPEDS Project - Agent Instructions

This project loads IPEDS (Integrated Postsecondary Education Data System) data from NCES into PostgreSQL for analysis, and provides a web application to explore the data.

## Web Application

The project includes a full-stack web application:
- **API**: TypeScript/Express REST API (`src/api/`)
- **Frontend**: React/TypeScript with shadcn/ui (`ui/`)

### Running the Web App

```bash
cd /Users/ford/dev/datagoose/projects/ipeds

# Start PostgreSQL (port 5433)
COMPOSE_PROJECT_NAME=datagoose-ipeds docker compose -f /Users/ford/dev/datagoose/docker/docker-compose.yml up -d postgres

# Terminal 1: Start API server (port 3001)
npm run dev

# Terminal 2: Start frontend (port 5173)
npm run dev:ui

# Visit http://localhost:5173
```

### API Endpoints

The API provides these endpoints:
- `GET /api/institutions` - List/search institutions
- `GET /api/institutions/:unitid` - Institution details
- `GET /api/institutions/:unitid/similar` - Vector similarity search
- `GET /api/admissions` - Admissions data
- `GET /api/admissions/most-selective` - Most selective schools
- `GET /api/enrollment` - Enrollment data
- `GET /api/graduation` - Graduation rates
- `GET /api/completions` - Degree completions
- `GET /api/financial` - Financial aid data
- `GET /api/search/text` - Fuzzy text search (pg_trgm)
- `GET /api/search/nearby` - Geo search (PostGIS)
- `GET /api/stats` - Database statistics

## Quick Start (ETL)

```bash
# Start PostgreSQL (port 5433)
COMPOSE_PROJECT_NAME=datagoose-ipeds docker compose -f /Users/ford/dev/datagoose/docker/docker-compose.yml up -d postgres

# Connect to database
docker exec -it datagoose-ipeds-postgres-1 psql -U postgres -d datagoose

# Run ETL for a year
cd /Users/ford/dev/datagoose/projects/ipeds
source /Users/ford/dev/datagoose/.venv/bin/activate
python etl/load_year.py 2023
python etl/transform_year.py 2023
```

## ETL Tracking - IMPORTANT

**Always check the ETL tracking tables before loading data:**

```sql
-- See what's been loaded
SELECT * FROM etl_run ORDER BY id DESC LIMIT 10;

-- See detailed table loads
SELECT run_id, table_name, rows_affected, status
FROM etl_table_log
ORDER BY run_id DESC, id;

-- Quick summary by year
SELECT data_year, run_type, status, COUNT(*)
FROM etl_run
GROUP BY data_year, run_type, status
ORDER BY data_year;

-- Check which years have data in each table
SELECT 'admissions' as tbl, array_agg(DISTINCT year ORDER BY year) as years FROM admissions
UNION ALL
SELECT 'graduation_rates', array_agg(DISTINCT year ORDER BY year) FROM graduation_rates
UNION ALL
SELECT 'enrollment', array_agg(DISTINCT year ORDER BY year) FROM enrollment
UNION ALL
SELECT 'completions', array_agg(DISTINCT year ORDER BY year) FROM completions
UNION ALL
SELECT 'financial_aid', array_agg(DISTINCT year ORDER BY year) FROM financial_aid;
```

The tracking tables (`etl_run`, `etl_table_log`) are defined in `schemas/migrations/002_etl_tracking.sql`.

## Data Coverage (Updated November 2024)

### Transformed Data (Ready for Analysis)

| Table | Years | Count | Notes |
|-------|-------|-------|-------|
| institution | 2009-2024 | ~9,800 unique | Latest year per institution |
| admissions | 2014-2023 | 20,571 | ADM files start in 2014 |
| graduation_rates | 2009-2023 | 951,690 | 15 years |
| enrollment | 2009-2023 | 8,742,540 | 15 years |
| completions | 2009-2024 | 124,474,410 | 16 years |
| financial_aid | 2009, 2011-2023 | 90,000 | Missing 2010 |

### What's NOT Loaded and Why

#### Pre-2014: No Admissions Data
- **Reason**: IPEDS did not collect standalone ADM files before 2014
- **Impact**: Admissions trend analysis starts at 2014

#### 2010: Financial Aid Missing
- **Reason**: SFA0910 raw table has `unitid` as TEXT instead of INTEGER
- **Error**: `operator does not exist: text = integer`
- **Fix needed**: Cast unitid to integer in transform: `sfa2010.unitid::integer`

#### Pre-2009: Institution Transform Fails
- **Reason**: HD files before 2009 lack `latitude`/`longitude` columns
- **Error**: `column "latitude" does not exist`
- **Data available**: Raw data is loaded for 2002-2008
- **Fix needed**: Custom ETL that handles missing geo columns

#### Pre-2002: Different File Structure
- **Reason**: Early IPEDS data (1980-2001) uses different naming conventions
- **Example**: IC1980 exists but HD1980 doesn't
- **Status**: Requires custom ETL per era

### Raw Data Available (in staging tables)

Years 2002-2024 have raw data loaded in staging tables (e.g., `hd2008`, `gr2007`).
Transform to normalized tables failed for:
- 2002-2008: Missing latitude/longitude
- 2010: Financial aid type mismatch

### Data Archive

Raw IPEDS files available in `data/raw/` from 1980-2024 (2,300+ zip files).

## File Naming Conventions

IPEDS files follow these patterns:
- `HD{year}` - Header/directory (institution characteristics)
- `ADM{year}` - Admissions
- `GR{year}` - Graduation rates
- `GR{year}_PELL_SSL` - Graduation by Pell/Stafford status
- `EF{year}A` - Fall enrollment by race/gender
- `EF{year}B` - Fall enrollment by age
- `C{year}_A` - Completions by CIP code
- `SFA{yy}{yy}` - Student financial aid (e.g., SFA2223 for 2022-23)
- `IC{year}` - Institutional characteristics

Note: SFA uses academic year naming (SFA2223 = 2022-23 academic year, data year 2023).

## Schema Overview

### Main Tables
- `institution` - Core institution data (unitid, name, location, geom, feature_vector)
- `admissions` - Admission stats by year
- `graduation_rates` - Graduation rates by race/gender/cohort
- `graduation_rates_pell` - Graduation by Pell/Stafford status
- `enrollment` - Enrollment by level/race/gender
- `completions` - Degrees awarded by CIP/race/gender
- `financial_aid` - Net price, Pell percentages

### Reference Tables
- `ref_sector` - Institution sector codes
- `ref_level` - Institution level codes
- `ref_control` - Control (public/private) codes
- `ref_race` - Race/ethnicity codes
- `ref_cip` - CIP codes for academic programs

### Special Columns
- `institution.geom` - PostGIS geometry (POINT) for spatial queries
- `institution.feature_vector` - pgvector embedding for similarity search
- All tables have trigram indexes on name fields for fuzzy search

## PostgreSQL Extensions in Use

```sql
-- Check enabled extensions
SELECT extname, extversion FROM pg_extension;
```

- **pgvector** - Vector similarity search (cosine distance)
- **PostGIS** - Geospatial queries (ST_Distance, ST_DWithin)
- **pg_trgm** - Trigram fuzzy matching (similarity(), %)

## Queries

Saved queries are in `/queries/` organized by category:
- `admissions/` - Selectivity, test scores
- `completions/` - Degrees by field
- `enrollment/` - Demographics, trends
- `financial/` - Net price, Pell rates
- `geo/` - PostGIS spatial queries
- `graduation/` - Rates, equity gaps
- `institutions/` - Profiles, search
- `search/` - Trigram fuzzy search
- `vector/` - pgvector similarity search

Run a query:
```bash
docker exec -i datagoose-ipeds-postgres-1 psql -U postgres -d datagoose < queries/vector/similar_institutions.sql
```

## Common Issues & Fixes

### BOM in Column Names
IPEDS CSV files sometimes have BOM (byte order mark) in headers. The load scripts strip these patterns:
- `\ufeff`
- `\xef\xbb\xbf`
- `ï»¿`

### Numeric Overflow
Some IPEDS fields have bad data (e.g., Pell recipients > enrolled students). Schema uses `NUMERIC(7,4)` for percentages to handle edge cases.

### SFA Table Naming
Financial aid tables use academic year naming. Transform script checks both `sfa{yy}{yy}` and `sfa{year}` patterns.

## CIP Codes (Programs)

CIP (Classification of Instructional Programs) codes are hierarchical:
- **Family** (2-digit): e.g., `11` = Computer and Information Sciences
- **Series** (4-digit): e.g., `11.01` = Computer Science
- **Detailed** (6-digit): e.g., `11.0101` = Computer and Information Sciences, General

### CIP API Endpoints
- `GET /api/cip` - List all CIP families with completion counts
- `GET /api/cip/search?q=nursing` - Fuzzy search CIP codes
- `GET /api/cip/:code` - Get CIP details, children, top institutions, trends
- `GET /api/cip/:code/institutions` - Get all institutions offering a CIP

### CIP Code Format Issues
The completions table had CIP codes with missing leading zeros (`1.0101` instead of `01.0101`).
This was fixed November 2024. If you see mismatches, normalize with:
```sql
-- Add leading zero to single-digit families
UPDATE completions
SET cip_code = LPAD(cip_code, LENGTH(cip_code) + 1, '0')
WHERE cip_code ~ '^\d\.';
```

## Data Quality Tests

Data quality tests are in `queries/data_quality/`:
- `01_enrollment_checks.sql` - Duplicate totals, unrealistic values, YoY changes
- `02_admissions_checks.sql` - Admit/yield rates, SAT/ACT scores
- `03_graduation_checks.sql` - Grad rates > 100%, cohort mismatches
- `04_financial_aid_checks.sql` - Net price, Pell rates
- `05_completions_checks.sql` - CIP code validation, completion volumes
- `06_institution_checks.sql` - Coordinates, sector distribution
- `07_cross_table_checks.sql` - Cross-table consistency

### Important Data Quirks
- **Enrollment totals**: Must filter by `level = 'all' AND gender = 'total' AND race = 'APTS'` to get unduplicated counts
- **Negative net price**: Valid! Schools like Berea College give full scholarships
- **Pell % > 100%**: Bad data from small schools (don't trust)
- **Completions > Enrollment**: Normal for online/competency schools (WGU, UoP)
- **Race mismatches pre-2011**: IPEDS changed race categories

## Feature Vector Schema

The 10-dimensional feature vector encodes:
```
[0] admit_rate      - Admission rate (0-1)
[1] grad_rate       - Graduation rate (0-1)
[2] size            - Normalized enrollment (0-1)
[3] pell_pct        - Pell grant percentage (0-1)
[4] affordability   - Inverted net price (0-1, higher=cheaper)
[5] sat             - Normalized SAT scores (0-1)
[6] public          - 1 if public, 0 if private
[7] 4year           - 1 if 4-year, 0 otherwise
[8] hbcu            - 1 if HBCU, 0 otherwise
[9] research_proxy  - Research activity proxy (0-1)
```

Use for finding similar institutions:
```sql
SELECT name, 1 - (feature_vector <=> target.feature_vector) as similarity
FROM institution, (SELECT feature_vector FROM institution WHERE unitid = 166683) target
WHERE feature_vector IS NOT NULL
ORDER BY feature_vector <=> target.feature_vector
LIMIT 10;
```
