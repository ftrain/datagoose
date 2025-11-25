# IPEDS Missing Data Import Plan

## Current State (November 2024)

### Transformed Data Available

| Table | Years | Notes |
|-------|-------|-------|
| admissions | 2014-2023 | ADM files start in 2014 |
| graduation_rates | 2009-2023 | Complete |
| enrollment | 2009-2023 | Complete |
| completions | 2009-2024 | Complete |
| financial_aid | 2009, 2011-2023 | **Missing 2010** |

### Known Missing Data

1. **2010 Financial Aid**
   - Raw data exists in `sfa0910` table
   - **Issue**: `unitid` column is TEXT instead of INTEGER
   - **Fix**: Modify `etl/transform_year.py` to cast `sfa2010.unitid::integer`

2. **Pre-2014 Admissions**
   - IPEDS did not collect standalone ADM files before 2014
   - Admissions data before 2014 was embedded in IC (Institutional Characteristics)
   - **Not recoverable** from current data sources

3. **Pre-2009 Data**
   - Raw data loaded for 2002-2008 years
   - Transform fails because HD files lack `latitude`/`longitude` columns
   - **Fix needed**: Custom ETL that handles missing geo columns

4. **Pre-2002 Data (1980-2001)**
   - Different IPEDS file structure
   - No standard HD/ADM/GR files
   - **Would require**: Custom ETL per era with significant research

## Recommended Actions

### Priority 1: Fix 2010 Financial Aid

```sql
-- In transform_year.py, modify the SFA query for 2010:
-- Change: sfa.unitid
-- To: sfa.unitid::integer
```

Or run directly:
```sql
INSERT INTO financial_aid (unitid, year, ...)
SELECT sfa.unitid::integer, 2010, ...
FROM sfa0910 sfa
...
```

### Priority 2: Pre-2009 Institution Data

Create a migration to handle missing geo columns:

```python
# etl/transform_historic.py
def transform_historic_year(year):
    """Transform years 2002-2008 without geo data"""
    # Institution data without lat/long
    sql = f"""
    INSERT INTO institution (unitid, name, city, state, ...)
    SELECT unitid, instnm, city, stabbr, ...
    -- No latitude/longitude columns
    FROM hd{year}
    ON CONFLICT (unitid) DO UPDATE SET ...
    """
```

### Priority 3: Historical CIP Codes

Current ref_cip has CIP 2020 codes only. Historical completions use older CIP versions:
- CIP 2010 (used 2010-2019)
- CIP 2000 (used 2000-2009)

**Options:**
1. Load historical CIP code files and create mapping tables
2. Accept ~5% of completions data won't match current CIP codes
3. Create fuzzy matching based on CIP code prefix (XX.XX)

### Not Recommended

- **Pre-2002 data**: Would require significant research into legacy file formats
- **Filling in admissions pre-2014**: Data not collected, cannot be reconstructed

## Data Quality Issues Found

### Critical (Fixed)
- [x] Enrollment over-counting (SNHU showing 1.4M instead of 184K)
- [x] CIP codes missing leading zeros (1.0101 vs 01.0101)

### Known Anomalies (Not Bugs)
- **Negative net price**: Schools like Berea College give full scholarships
- **Pell % > 100%**: Bad data from some small schools
- **Completions > Enrollment**: Online/competency schools (WGU, UoP)
- **Large YoY changes**: Often real events (mergers, campus consolidations)

### Tracking
- Race breakdown mismatches pre-2011 (IPEDS changed race categories)
- Some historical CIP codes don't exist in CIP 2020

## Estimated Effort

| Task | Effort | Impact |
|------|--------|--------|
| Fix 2010 financial aid | 1 hour | Fills gap in financial trends |
| Pre-2009 institutions (no geo) | 4 hours | Adds historical institution data |
| Historical CIP codes | 8 hours | Better completions matching |
| Pre-2002 data | 40+ hours | Minimal value for most analyses |

## Raw Data Available

The `data/raw/` directory contains IPEDS files from 1980-2024:
- 2,300+ zip files
- All years have raw data downloaded
- Earlier years have different schemas

