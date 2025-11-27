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
- `GET /api/historic/coverage` - Historic data coverage (1980-2008)
- `GET /api/historic/enrollment` - Historic enrollment trends
- `GET /api/historic/graduation` - Historic graduation rates (1997-2008)
- `GET /api/historic/completions` - Historic completions trends
- `GET /api/historic/institutions` - Historic institution directory

### Authentication (JWT-based)
- `POST /api/auth/register` - Create new account
- `POST /api/auth/login` - Login, returns JWT + sets refresh cookie
- `POST /api/auth/logout` - Clear refresh token
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user (protected)

### NL-to-SQL Query (Protected, requires auth)
- `POST /api/query/nl` - Convert natural language to SQL using Claude
- `POST /api/query/execute` - Execute SQL and return results
- `GET /api/query/saved` - List saved queries
- `POST /api/query/saved` - Save a query
- `DELETE /api/query/saved/:id` - Delete a saved query

### Data Dictionary
- `GET /api/dictionary` - Full data dictionary with metadata
- `GET /api/dictionary/tables` - List all tables with descriptions
- `GET /api/dictionary/tables/:table` - Detailed table info
- `GET /api/dictionary/search?q=term` - Search columns/tables
- `GET /api/dictionary/stats` - Live database statistics
- `POST /api/dictionary/ask` - AI-powered questions about the data

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
| financial_aid | 2009-2023 | ~100,000 | Complete 15 years |

### Historic Data (1980-2008)

| Table | Years | Records | Notes |
|-------|-------|---------|-------|
| enrollment_historic | 1980, 1986-89, 1991-93, 2000-08 | 109,106 | 17 years with data |
| completions_historic | 1980, 1984-89, 1991-94, 2000-08 | 844,439 | 20 years with data |
| institution_historic | 1980, 1984-85, 2000-08 | 80,242 | 12 years with data |
| graduation_rates_historic | 1997-2008 | 21,047 | 12 years |

Historic tables use simplified schemas (total enrollment, 2-digit CIP, etc.) for cross-era comparability.
Gaps in years are due to missing source files - IPEDS didn't publish data for those years.

### Data Gaps (No Source Data Available)

- **Admissions pre-2014**: IPEDS did not collect standalone ADM files before 2014
- **Enrollment 1981-85, 1990, 1994-99**: No EF files published
- **Completions 1981-83, 1990, 1995-99**: No C files published
- **Graduation rates pre-1997**: No GR files published
- **Institutions 1981-83, 1986-99**: No HD files published

### Raw Data Archive

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

## NL-to-SQL Tips

When generating SQL from natural language, note these important schema details:

### Reference Table Column Names
- **ref_sector**: `code` (INTEGER), `label` (TEXT) - NOT sector_name
- **ref_race**: `code` (TEXT), `label` (TEXT) - NOT race_name
- **ref_cip**: `code`, `title`, `definition`, `level`, `family`

### Enrollment Filtering
To get unduplicated totals, always filter:
```sql
WHERE level = 'all' AND gender = 'total' AND race = 'APTS'
```

### Rate Columns
- `admit_rate`, `yield_rate`, `grad_rate_150pct` are stored as decimals (0-1)
- Multiply by 100 for percentages: `ROUND(admit_rate * 100, 1)`

### Common Joins
```sql
-- Institution with sector name
SELECT i.name, rs.label as sector
FROM institution i
JOIN ref_sector rs ON i.sector = rs.code;

-- Enrollment with race name
SELECT rr.label as race, e.total
FROM enrollment e
JOIN ref_race rr ON e.race = rr.code;
```

## Authentication System

JWT-based auth with:
- Access tokens (15-minute expiry)
- Refresh tokens (7-day expiry, HTTP-only cookie)
- Argon2id password hashing

Database tables in `schemas/migrations/003_auth.sql`:
- `users` - User accounts
- `refresh_tokens` - Active refresh tokens

The `/api/query/*` endpoints require authentication. Use the `authFetch` helper on the frontend which handles token refresh automatically.

## Testing NL-to-SQL

Test scripts in `scripts/` and `src/api/__tests__/`:
- `scripts/test-nl-queries.ts` - CLI runner for NL query tests
- `src/api/__tests__/nl-queries.test.ts` - Comprehensive test suite (~100 queries)

Run tests:
```bash
# Single category
npx tsx scripts/test-nl-queries.ts institution

# All categories
npx tsx scripts/test-nl-queries.ts all --limit 5

# SQL generation only (no execution)
npx tsx scripts/test-nl-queries.ts enrollment --sql-only
```

## Production Deployment

**Live site**: https://ipeds.bkwaffles.com

### Server Details
- **Host**: Digital Ocean droplet at bkwaffles.com (204.48.22.228)
- **SSH**: `ssh root@bkwaffles.com`
- **App directory**: `/opt/ipeds/app`
- **PostgreSQL data**: `/mnt/volume_nyc1_01/ipeds-postgres`

### Architecture
- **nginx**: Reverse proxy, serves static UI, SSL termination
- **systemd**: `ipeds-api.service` runs the Express API
- **Docker**: PostgreSQL with pgvector + PostGIS

### Key Files on Server
- `/etc/nginx/sites-available/ipeds` - nginx config
- `/etc/systemd/system/ipeds-api.service` - systemd service
- `/opt/ipeds/docker-compose.yml` - PostgreSQL container
- `/opt/ipeds/app/.env` - environment variables

### Deploying Updates
```bash
# Sync code (excludes node_modules, .env, ui/dist)
rsync -avz --exclude=node_modules --exclude=.env --exclude='ui/node_modules' --exclude='ui/dist' \
  /Users/ford/dev/datagoose/projects/ipeds/ root@bkwaffles.com:/opt/ipeds/app/

# On server: rebuild UI and restart
ssh root@bkwaffles.com "cd /opt/ipeds/app/ui && npm install && npm run build && systemctl restart ipeds-api"
```

### Database Backup/Restore
```bash
# Export from local (790MB compressed from 44GB)
docker exec datagoose-ipeds-postgres-1 pg_dump -U postgres -d datagoose --format=custom --compress=9 > /tmp/ipeds-backup.dump

# Copy to server
scp /tmp/ipeds-backup.dump root@bkwaffles.com:/tmp/

# Import on server
ssh root@bkwaffles.com "docker cp /tmp/ipeds-backup.dump ipeds-postgres:/tmp/ && \
  docker exec ipeds-postgres pg_restore -U postgres -d ipeds --clean --if-exists --no-owner /tmp/ipeds-backup.dump"
```

### Common Server Commands
```bash
# Check API status
ssh root@bkwaffles.com "systemctl status ipeds-api"

# View API logs
ssh root@bkwaffles.com "journalctl -u ipeds-api -f"

# Restart API
ssh root@bkwaffles.com "systemctl restart ipeds-api"

# Check database
ssh root@bkwaffles.com "docker exec ipeds-postgres psql -U postgres -d ipeds -c 'SELECT COUNT(*) FROM institution;'"

# Renew SSL (auto-renewed by certbot)
ssh root@bkwaffles.com "certbot renew"
```

### Production Environment
- `NODE_ENV=production`
- Registration disabled (returns 403)
- JWT secrets in `/opt/ipeds/app/.env`
- ANTHROPIC_API_KEY for NL-to-SQL feature
