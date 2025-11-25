#!/usr/bin/env python3
"""Load CIP 2020 codes into ref_cip table."""

import csv
import re
import sys
import psycopg2
from pathlib import Path

# Database connection
DB_CONFIG = {
    "host": "localhost",
    "port": 5433,
    "database": "datagoose",
    "user": "postgres",
    "password": "postgres"
}

def clean_cip_code(raw_code: str) -> str:
    """Clean Excel formula notation from CIP code: ='01.0101' -> 01.0101"""
    # Remove =" prefix and " suffix
    code = re.sub(r'^="?|"$', '', raw_code.strip())
    return code

def get_cip_level(code: str) -> int:
    """
    Determine CIP hierarchy level:
    - 2-digit (01): Family level
    - 4-digit (01.00): Series level (2-digit group)
    - 6-digit (01.0000): Detailed level (4-digit group)
    """
    if '.' not in code:
        return 2  # Family (e.g., "01")
    parts = code.split('.')
    if len(parts[1]) == 2:
        return 4  # Series (e.g., "01.00")
    return 6  # Detailed (e.g., "01.0000")

def normalize_cip_code(code: str) -> str:
    """Normalize CIP code to consistent format (XX.XXXX)"""
    if '.' not in code:
        # Family level: 01 -> 01.0000 (but keep original for display)
        return code.zfill(2)

    parts = code.split('.')
    family = parts[0].zfill(2)
    sub = parts[1].ljust(4, '0') if len(parts[1]) < 4 else parts[1]
    return f"{family}.{sub}"

def main():
    csv_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/Users/ford/Downloads/CIPCode2020.csv")

    if not csv_path.exists():
        print(f"Error: {csv_path} not found")
        sys.exit(1)

    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    # Create ref_cip table
    cur.execute("""
        DROP TABLE IF EXISTS ref_cip CASCADE;

        CREATE TABLE ref_cip (
            code TEXT PRIMARY KEY,           -- Normalized code (e.g., "01.0101")
            code_display TEXT NOT NULL,      -- Display format from source
            family TEXT NOT NULL,            -- 2-digit family (e.g., "01")
            level INT NOT NULL,              -- 2=family, 4=series, 6=detailed
            title TEXT NOT NULL,             -- Short title
            definition TEXT,                 -- Full definition
            cross_references TEXT,           -- Related codes
            examples TEXT,                   -- Example programs
            action TEXT                      -- CIP 2020 change action
        );

        CREATE INDEX idx_cip_family ON ref_cip(family);
        CREATE INDEX idx_cip_level ON ref_cip(level);
        CREATE INDEX idx_cip_title_trgm ON ref_cip USING gin(title gin_trgm_ops);
    """)

    # Read and insert CIP codes
    inserted = 0
    skipped = 0

    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)

        for row in reader:
            code_raw = clean_cip_code(row['CIPCode'])
            family_raw = clean_cip_code(row['CIPFamily'])
            title = row['CIPTitle'].strip()
            definition = row.get('CIPDefinition', '').strip()
            cross_refs = row.get('CrossReferences', '').strip()
            examples = row.get('Examples', '').strip()
            action = row.get('Action', '').strip()

            # Skip reserved codes
            if 'Reserved' in title:
                skipped += 1
                continue

            # Skip "Moved from" entries (they're just redirects)
            if action == 'Moved from':
                skipped += 1
                continue

            level = get_cip_level(code_raw)
            code_norm = normalize_cip_code(code_raw)

            cur.execute("""
                INSERT INTO ref_cip (code, code_display, family, level, title, definition, cross_references, examples, action)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (code) DO UPDATE SET
                    title = EXCLUDED.title,
                    definition = EXCLUDED.definition
            """, (
                code_norm,
                code_raw,
                family_raw.zfill(2),
                level,
                title,
                definition or None,
                cross_refs or None,
                examples or None,
                action or None
            ))
            inserted += 1

    conn.commit()

    # Print summary
    cur.execute("SELECT level, COUNT(*) FROM ref_cip GROUP BY level ORDER BY level")
    print("CIP codes loaded by level:")
    for row in cur.fetchall():
        level_name = {2: 'Family', 4: 'Series', 6: 'Detailed'}[row[0]]
        print(f"  {level_name} ({row[0]}-digit): {row[1]}")

    print(f"\nTotal inserted: {inserted}, Skipped: {skipped}")

    # Verify we can join to completions
    cur.execute("""
        SELECT COUNT(DISTINCT c.cip_code), COUNT(DISTINCT r.code)
        FROM completions c
        LEFT JOIN ref_cip r ON
            LPAD(SPLIT_PART(c.cip_code, '.', 1), 2, '0') || '.' ||
            RPAD(SPLIT_PART(c.cip_code, '.', 2), 4, '0') = r.code
        WHERE c.year = 2023
    """)
    comp_codes, matched = cur.fetchone()
    print(f"\nCompletions CIP codes (2023): {comp_codes}, Matched to ref_cip: {matched}")

    cur.close()
    conn.close()

if __name__ == "__main__":
    main()
