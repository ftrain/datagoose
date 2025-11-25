#!/usr/bin/env python3
"""
Load historical IPEDS data (1980-2008) into summary tables.

The historical data has different schemas per era, so we create
simplified summary tables that can be compared across all years.

Tables created:
- enrollment_historic: Total enrollment by institution/year
- completions_historic: Completions by institution/year/cip (2-digit)
- institution_historic: Institution names by year
"""

import os
import re
import zipfile
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from io import StringIO

# Database connection
DB_CONFIG = {
    'host': 'localhost',
    'port': 5433,
    'dbname': 'datagoose',
    'user': 'postgres',
    'password': 'postgres'
}

RAW_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'raw')


def get_conn():
    return psycopg2.connect(**DB_CONFIG)


def create_historic_tables():
    """Create tables for historical data."""
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS enrollment_historic (
            unitid INTEGER NOT NULL,
            year INTEGER NOT NULL,
            total_enrollment INTEGER,
            PRIMARY KEY (unitid, year)
        );

        CREATE TABLE IF NOT EXISTS completions_historic (
            unitid INTEGER NOT NULL,
            year INTEGER NOT NULL,
            cip_2digit VARCHAR(2),
            total_completions INTEGER,
            PRIMARY KEY (unitid, year, cip_2digit)
        );

        CREATE TABLE IF NOT EXISTS institution_historic (
            unitid INTEGER NOT NULL,
            year INTEGER NOT NULL,
            name VARCHAR(255),
            city VARCHAR(100),
            state VARCHAR(2),
            PRIMARY KEY (unitid, year)
        );

        CREATE INDEX IF NOT EXISTS idx_enroll_hist_year ON enrollment_historic(year);
        CREATE INDEX IF NOT EXISTS idx_comp_hist_year ON completions_historic(year);
        CREATE INDEX IF NOT EXISTS idx_inst_hist_year ON institution_historic(year);

        CREATE TABLE IF NOT EXISTS graduation_rates_historic (
            unitid INTEGER NOT NULL,
            year INTEGER NOT NULL,
            cohort_size INTEGER,
            completers INTEGER,
            grad_rate_150pct NUMERIC(5,2),
            PRIMARY KEY (unitid, year)
        );
        CREATE INDEX IF NOT EXISTS idx_gr_hist_year ON graduation_rates_historic(year);
    """)

    conn.commit()
    cur.close()
    conn.close()
    print("Created historic tables")


def read_zip_csv(zip_path: str) -> pd.DataFrame:
    """Read CSV from a zip file."""
    with zipfile.ZipFile(zip_path, 'r') as z:
        csv_name = [n for n in z.namelist() if n.endswith('.csv')][0]
        with z.open(csv_name) as f:
            # Handle BOM and encoding issues
            content = f.read().decode('utf-8', errors='replace')
            content = content.replace('\ufeff', '').replace('ï»¿', '')
            return pd.read_csv(StringIO(content), low_memory=False)


def find_enrollment_file(year: int) -> str:
    """Find the enrollment file for a given year."""
    patterns = [
        f'EF{year}A.zip',       # 2000s format (EF2000A.zip)
        f'EF{year}_A.zip',      # 1980s-1990s format (EF1980_A.zip)
        f'ef{year}a.zip',       # lowercase
        f'ef{year}_a.zip',      # lowercase with underscore
    ]
    for p in patterns:
        path = os.path.join(RAW_DIR, p)
        if os.path.exists(path):
            return path
    return None


def find_ic_file(year: int) -> str:
    """Find the institutional characteristics file.

    Prefer HD files (Header/Directory) as they have institution names.
    IC files have institutional characteristics but often lack names.
    Also try FA (Financial Aid) HD files as backup.
    """
    # Try HD first - these have institution names
    hd_patterns = [
        f'HD{year}.zip',
        f'hd{year}.zip',
    ]
    for p in hd_patterns:
        path = os.path.join(RAW_DIR, p)
        if os.path.exists(path):
            return path

    # Try FA (Financial Aid) HD files - have institution names for 2000-2001
    fa_patterns = [
        f'FA{year}HD.zip',
        f'fa{year}hd.zip',
    ]
    for p in fa_patterns:
        path = os.path.join(RAW_DIR, p)
        if os.path.exists(path):
            return path

    # Fall back to IC files for older years
    ic_patterns = [
        f'IC{year}.zip',
        f'ic{year}.zip',
    ]
    for p in ic_patterns:
        path = os.path.join(RAW_DIR, p)
        if os.path.exists(path):
            return path
    return None


def find_completions_file(year: int) -> str:
    """Find the completions file for a given year."""
    patterns = [
        f'C{year}_A.zip',           # Modern format
        f'C{year}_CIP.zip',         # 1980s format
        f'C{year}_4ORMORE_CIP.zip', # 1980 format
        f'c{year}_a.zip',
    ]
    for p in patterns:
        path = os.path.join(RAW_DIR, p)
        if os.path.exists(path):
            return path
    return None


def get_total_enrollment_column(df: pd.DataFrame, year: int) -> str:
    """Find the column that represents total enrollment."""
    # Different years use different column names
    candidates = [
        'efrace15',    # 1980s-1990s: total men
        'efrace16',    # 1980s-1990s: total women
        'eftotlt',     # 2000s: total
        'EFTOTLT',
    ]

    # For older data, we may need to sum efrace15 + efrace16
    if 'efrace15' in df.columns and 'efrace16' in df.columns:
        return 'efrace15+efrace16'

    for col in candidates:
        if col in df.columns:
            return col

    return None


def load_enrollment_year(year: int):
    """Load enrollment data for a single year."""
    ef_file = find_enrollment_file(year)
    if not ef_file:
        print(f"  No enrollment file for {year}")
        return 0

    try:
        df = read_zip_csv(ef_file)
        df.columns = [c.lower() for c in df.columns]

        if 'unitid' not in df.columns:
            print(f"  No unitid in {ef_file}")
            return 0

        # Calculate total enrollment per institution
        # Line 29 = Grand total all students (efalevel=1)
        # Line 99 = Grand total first-time students (efalevel=2)
        # Line 1 = Full-time undergraduate (efalevel=24)
        if 'line' in df.columns:
            # Use line 29 for grand total (all students)
            df_total = df[df['line'] == 29]
            if len(df_total) == 0:
                # Fallback to line 1 for older files that don't have line 29
                df_total = df[df['line'] == 1]
            if len(df_total) == 0:
                print(f"  No total line in {ef_file}")
                return 0
            df = df_total

        # Get enrollment total
        if 'efrace15' in df.columns and 'efrace16' in df.columns:
            # 1980s format: sum men + women
            for col in ['efrace15', 'efrace16']:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
            df['total'] = df['efrace15'] + df['efrace16']
        elif 'eftotlt' in df.columns:
            # 2000s format: total enrollment column
            df['total'] = pd.to_numeric(df['eftotlt'], errors='coerce').fillna(0)
        else:
            print(f"  Can't find enrollment total for {year}")
            return 0

        # One row per institution now (since we filtered to line 1)
        agg = df[['unitid', 'total']].copy()
        agg = agg[agg['total'] > 0]

        # Insert into database
        conn = get_conn()
        cur = conn.cursor()

        values = [(int(row['unitid']), year, int(row['total'])) for _, row in agg.iterrows()]

        execute_values(cur, """
            INSERT INTO enrollment_historic (unitid, year, total_enrollment)
            VALUES %s
            ON CONFLICT (unitid, year) DO UPDATE SET total_enrollment = EXCLUDED.total_enrollment
        """, values)

        conn.commit()
        cur.close()
        conn.close()

        return len(values)

    except Exception as e:
        print(f"  Error loading {year}: {e}")
        return 0


def load_institutions_year(year: int):
    """Load institution names for a single year."""
    ic_file = find_ic_file(year)
    if not ic_file:
        print(f"  No IC file for {year}")
        return 0

    try:
        df = read_zip_csv(ic_file)
        df.columns = [c.lower() for c in df.columns]

        if 'unitid' not in df.columns:
            print(f"  No unitid in {ic_file}")
            return 0

        # Find name column (handle quoted column names like '"instnm"')
        name_col = None
        for col in df.columns:
            col_clean = col.strip().strip('"').lower()
            if col_clean in ['instnm', 'name']:
                name_col = col
                break

        if not name_col:
            print(f"  No name column in {ic_file}")
            return 0

        # Find city and state (handle quoted column names)
        city_col = None
        state_col = None
        for col in df.columns:
            col_clean = col.strip().strip('"').lower()
            if col_clean == 'city':
                city_col = col
            elif col_clean in ['stabbr', 'state']:
                state_col = col

        conn = get_conn()
        cur = conn.cursor()

        values = []
        for _, row in df.iterrows():
            values.append((
                int(row['unitid']),
                year,
                str(row[name_col])[:255] if pd.notna(row[name_col]) else None,
                str(row[city_col])[:100] if city_col and pd.notna(row.get(city_col)) else None,
                str(row[state_col])[:2] if state_col and pd.notna(row.get(state_col)) else None,
            ))

        execute_values(cur, """
            INSERT INTO institution_historic (unitid, year, name, city, state)
            VALUES %s
            ON CONFLICT (unitid, year) DO UPDATE SET
                name = EXCLUDED.name,
                city = EXCLUDED.city,
                state = EXCLUDED.state
        """, values)

        conn.commit()
        cur.close()
        conn.close()

        return len(values)

    except Exception as e:
        print(f"  Error loading institutions {year}: {e}")
        return 0


def load_completions_year(year: int):
    """Load completions data aggregated to 2-digit CIP."""
    comp_file = find_completions_file(year)
    if not comp_file:
        print(f"  No completions file for {year}")
        return 0

    try:
        df = read_zip_csv(comp_file)
        df.columns = [c.lower() for c in df.columns]

        if 'unitid' not in df.columns:
            print(f"  No unitid in {comp_file}")
            return 0

        # Find CIP and count columns
        cip_col = None
        for col in ['cipcode', 'cip', 'majornum']:
            if col in df.columns:
                cip_col = col
                break

        if not cip_col:
            print(f"  No CIP column in {comp_file}")
            return 0

        # Find count column - varies by year
        count_col = None
        for col in ['ctotalt', 'crace15', 'crace16', 'grand_total', 'total']:
            if col in df.columns:
                count_col = col
                break

        # If we have crace15 and crace16, sum them
        if count_col is None and 'crace15' in df.columns and 'crace16' in df.columns:
            df['crace15'] = pd.to_numeric(df['crace15'], errors='coerce').fillna(0)
            df['crace16'] = pd.to_numeric(df['crace16'], errors='coerce').fillna(0)
            df['total'] = df['crace15'] + df['crace16']
            count_col = 'total'

        if not count_col:
            print(f"  No count column in {comp_file}")
            return 0

        # Extract 2-digit CIP
        df['cip_2digit'] = df[cip_col].astype(str).str[:2].str.zfill(2)
        df[count_col] = pd.to_numeric(df[count_col], errors='coerce').fillna(0)

        # Aggregate by unitid and 2-digit CIP
        agg = df.groupby(['unitid', 'cip_2digit'])[count_col].sum().reset_index()
        agg = agg[agg[count_col] > 0]

        conn = get_conn()
        cur = conn.cursor()

        values = [(int(row['unitid']), year, row['cip_2digit'], int(row[count_col]))
                  for _, row in agg.iterrows()]

        execute_values(cur, """
            INSERT INTO completions_historic (unitid, year, cip_2digit, total_completions)
            VALUES %s
            ON CONFLICT (unitid, year, cip_2digit) DO UPDATE SET
                total_completions = EXCLUDED.total_completions
        """, values)

        conn.commit()
        cur.close()
        conn.close()

        return len(values)

    except Exception as e:
        print(f"  Error loading completions {year}: {e}")
        import traceback
        traceback.print_exc()
        return 0


def find_gr_file(year: int) -> str:
    """Find the graduation rates file for a given year."""
    patterns = [
        f'GR{year}.zip',
        f'gr{year}.zip',
    ]
    for p in patterns:
        path = os.path.join(RAW_DIR, p)
        if os.path.exists(path):
            return path
    return None


def load_graduation_rates_year(year: int):
    """Load graduation rates for a single year.

    Historic GR files (1997-2008) have this structure:
    - grtype=6, line='10' = Bachelor's seeking cohort at 4-year institutions
    - grtype=12, line='18A' = Completers within 150% of normal time
    - grrace24 (1997-2007) or grtotlt (2008+) = Total (all races/genders combined)

    We extract: cohort size and completers to calculate graduation rate.
    """
    gr_file = find_gr_file(year)
    if not gr_file:
        print(f"  No GR file for {year}")
        return 0

    try:
        df = read_zip_csv(gr_file)
        df.columns = [c.lower() for c in df.columns]

        if 'unitid' not in df.columns:
            print(f"  No unitid in {gr_file}")
            return 0

        # Strip whitespace from line values (some years have '10 ' instead of '10')
        if 'line' in df.columns:
            df['line'] = df['line'].astype(str).str.strip()

        # Total column: grrace24 (1997-2007) or grtotlt (2008+)
        if 'grtotlt' in df.columns:
            total_col = 'grtotlt'
        elif 'grrace24' in df.columns:
            total_col = 'grrace24'
        else:
            print(f"  No total column (grrace24 or grtotlt) in {gr_file}")
            return 0

        # Get cohort size (grtype=6, line='10')
        cohort_df = df[(df['grtype'] == 6) & (df['line'] == '10')][['unitid', total_col]].copy()
        cohort_df.columns = ['unitid', 'cohort_size']

        # Get completers within 150% (grtype=12, line='18A')
        completers_df = df[(df['grtype'] == 12) & (df['line'] == '18A')][['unitid', total_col]].copy()
        completers_df.columns = ['unitid', 'completers']

        if len(cohort_df) == 0:
            print(f"  No cohort data found for {year}")
            return 0

        # Merge cohort and completers
        result = cohort_df.merge(completers_df, on='unitid', how='left')
        result['cohort_size'] = pd.to_numeric(result['cohort_size'], errors='coerce')
        result['completers'] = pd.to_numeric(result['completers'], errors='coerce')

        # Calculate graduation rate
        result['grad_rate'] = (result['completers'] / result['cohort_size'] * 100).round(2)

        # Filter out invalid rows
        result = result[result['cohort_size'] > 0]

        # Insert into database
        conn = get_conn()
        cur = conn.cursor()

        values = []
        for _, row in result.iterrows():
            cohort = int(row['cohort_size']) if pd.notna(row['cohort_size']) else None
            completers = int(row['completers']) if pd.notna(row['completers']) else None
            grad_rate = float(row['grad_rate']) if pd.notna(row['grad_rate']) else None
            values.append((int(row['unitid']), year, cohort, completers, grad_rate))

        if values:
            execute_values(cur, """
                INSERT INTO graduation_rates_historic (unitid, year, cohort_size, completers, grad_rate_150pct)
                VALUES %s
                ON CONFLICT (unitid, year) DO UPDATE SET
                    cohort_size = EXCLUDED.cohort_size,
                    completers = EXCLUDED.completers,
                    grad_rate_150pct = EXCLUDED.grad_rate_150pct
            """, values)

        conn.commit()
        cur.close()
        conn.close()

        return len(values)

    except Exception as e:
        print(f"  Error loading graduation rates {year}: {e}")
        import traceback
        traceback.print_exc()
        return 0


def main():
    """Load historical data for all available years."""
    import sys

    # Create tables
    create_historic_tables()

    # Years to load (1980-2008, before modern format)
    years = list(range(1980, 2009))

    # If a specific year is provided
    if len(sys.argv) > 1:
        years = [int(sys.argv[1])]

    for year in years:
        print(f"\n=== Loading {year} ===")

        # Load enrollment
        n = load_enrollment_year(year)
        print(f"  Enrollment: {n} records")

        # Load institutions
        n = load_institutions_year(year)
        print(f"  Institutions: {n} records")

        # Load completions
        n = load_completions_year(year)
        print(f"  Completions: {n} records")

        # Load graduation rates
        n = load_graduation_rates_year(year)
        print(f"  Graduation rates: {n} records")


if __name__ == '__main__':
    main()
