"""
Load IPEDS data for any year into PostgreSQL.

Generic loader that handles whatever files are available for a given year.
"""

import argparse
import logging
import zipfile
from pathlib import Path

import pandas as pd
import psycopg2
from io import StringIO

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(message)s")
logger = logging.getLogger(__name__)

RAW_DIR = Path(__file__).parent.parent / "data" / "raw"
CONN_STRING = "host=localhost port=5433 dbname=datagoose user=postgres password=postgres"

# IPEDS file patterns by survey type
# Format: (pattern, table_suffix, description)
SURVEY_FILES = [
    ("HD{year}.zip", "hd", "Institutional directory"),
    ("ADM{year}.zip", "adm", "Admissions data"),
    ("GR{year}.zip", "gr", "Graduation rates"),
    ("GR{year}_PELL_SSL.zip", "gr_pell_ssl", "Pell graduation rates"),
    ("GR{year}_L2.zip", "gr_l2", "Graduation rates (less than 4-year)"),
    ("EF{year}A.zip", "efa", "Fall enrollment by race/gender"),
    ("EF{year}B.zip", "efb", "Fall enrollment by age"),
    ("EF{year}C.zip", "efc", "Fall enrollment residence"),
    ("EF{year}D.zip", "efd", "Fall enrollment by distance ed"),
    ("C{year}_A.zip", "c_a", "Completions by CIP"),
    ("C{year}_B.zip", "c_b", "Completions by race totals"),
    ("C{year}_C.zip", "c_c", "Completions by program"),
    ("SFA{year2}.zip", "sfa", "Student financial aid"),  # Uses academic year format
    ("IC{year}.zip", "ic", "Institutional characteristics"),
    ("EFFY{year}.zip", "effy", "12-month enrollment"),
    ("EFIA{year}.zip", "efia", "Instructional activity"),
    ("FLAGS{year}.zip", "flags", "Data quality flags"),
    ("OM{year}.zip", "om", "Outcome measures"),
]


def extract_csv_from_zip(zip_path: Path, encoding: str = "latin-1") -> pd.DataFrame:
    """Extract CSV from zip file."""
    with zipfile.ZipFile(zip_path, "r") as zf:
        csv_name = [n for n in zf.namelist() if n.endswith(".csv")][0]
        with zf.open(csv_name) as f:
            df = pd.read_csv(f, encoding=encoding, low_memory=False)

    # Clean column names - strip BOM, lowercase
    df.columns = [
        c.replace("\ufeff", "")
         .replace("\xef\xbb\xbf", "")
         .replace("ï»¿", "")
         .strip()
         .lower()
        for c in df.columns
    ]
    return df


def create_table_from_df(conn, table_name: str, df: pd.DataFrame):
    """Create table with inferred types."""
    type_map = {
        "int64": "BIGINT",
        "float64": "DOUBLE PRECISION",
        "object": "TEXT",
        "bool": "BOOLEAN",
    }

    columns = []
    for col in df.columns:
        pg_type = type_map.get(str(df[col].dtype), "TEXT")
        columns.append(f'"{col}" {pg_type}')

    create_sql = f'DROP TABLE IF EXISTS {table_name}; CREATE TABLE {table_name} ({", ".join(columns)})'

    with conn.cursor() as cur:
        cur.execute(create_sql)
    conn.commit()


def copy_df_to_table(conn, table_name: str, df: pd.DataFrame):
    """Bulk load dataframe using COPY."""
    buffer = StringIO()
    df.to_csv(buffer, index=False, header=False, na_rep="\\N")
    buffer.seek(0)

    with conn.cursor() as cur:
        cur.copy_expert(
            f"COPY {table_name} FROM STDIN WITH CSV NULL '\\N'",
            buffer
        )
    conn.commit()


def load_file(conn, zip_path: Path, table_name: str, run_id: int) -> int:
    """Load a single ZIP file into a table with ETL tracking."""
    if not zip_path.exists():
        return 0

    # Start table log
    with conn.cursor() as cur:
        cur.execute(
            "SELECT etl_log_table_start(%s, %s, %s, %s, NULL)",
            (run_id, table_name, "load", zip_path.name)
        )
        log_id = cur.fetchone()[0]
    conn.commit()

    try:
        logger.info(f"Loading {zip_path.name} -> {table_name}...")
        df = extract_csv_from_zip(zip_path)
        logger.info(f"  {len(df)} rows, {len(df.columns)} columns")

        create_table_from_df(conn, table_name, df)
        copy_df_to_table(conn, table_name, df)

        with conn.cursor() as cur:
            cur.execute(
                "SELECT etl_log_table_complete(%s, %s, %s, NULL)",
                (log_id, len(df), "completed")
            )
        conn.commit()

        logger.info(f"  Done: {len(df)} rows loaded")
        return len(df)

    except Exception as e:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT etl_log_table_complete(%s, %s, %s, %s)",
                (log_id, 0, "failed", str(e))
            )
        conn.commit()
        logger.error(f"  Failed: {e}")
        return 0


def get_sfa_year(year: int) -> str:
    """Get SFA file year format (e.g., 2023 -> 2223 for 2022-23 academic year)."""
    return f"{(year-1) % 100:02d}{year % 100:02d}"


def load_year(year: int):
    """Load all available IPEDS files for a given year."""
    logger.info(f"Loading IPEDS data for {year}...")
    conn = psycopg2.connect(CONN_STRING)

    # Start ETL run
    with conn.cursor() as cur:
        cur.execute(
            "SELECT etl_start_run(%s, %s, %s)",
            ("raw_load", year, f'{{"source": "NCES IPEDS", "year": {year}}}')
        )
        run_id = cur.fetchone()[0]
    conn.commit()
    logger.info(f"Started ETL run {run_id}")

    try:
        total_rows = 0
        tables_loaded = 0
        sfa_year = get_sfa_year(year)

        for pattern, suffix, description in SURVEY_FILES:
            # Handle SFA special year format
            if "{year2}" in pattern:
                filename = pattern.format(year2=sfa_year)
            else:
                filename = pattern.format(year=year)

            zip_path = RAW_DIR / filename
            table_name = f"{suffix}{year}"

            if zip_path.exists():
                try:
                    rows = load_file(conn, zip_path, table_name, run_id)
                    total_rows += rows
                    if rows > 0:
                        tables_loaded += 1
                except Exception as e:
                    logger.error(f"  Failed to load {filename}: {e}")

        # Complete ETL run
        with conn.cursor() as cur:
            cur.execute(
                "SELECT etl_complete_run(%s, %s, NULL)",
                (run_id, "completed")
            )
        conn.commit()

        logger.info(f"ETL run {run_id} complete: {tables_loaded} tables, {total_rows:,} total rows")

        # Show summary
        with conn.cursor() as cur:
            cur.execute("""
                SELECT table_name, rows_affected, status
                FROM etl_table_log
                WHERE run_id = %s
                ORDER BY id
            """, (run_id,))
            logger.info("Summary:")
            for row in cur.fetchall():
                status_icon = "✓" if row[2] == "completed" else "✗"
                logger.info(f"  {status_icon} {row[0]}: {row[1]:,} rows")

    except Exception as e:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT etl_complete_run(%s, %s, %s)",
                (run_id, "failed", str(e))
            )
        conn.commit()
        raise

    finally:
        conn.close()

    logger.info("Done!")
    return tables_loaded, total_rows


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Load IPEDS data for a given year")
    parser.add_argument("year", type=int, help="Year to load (e.g., 2023)")
    args = parser.parse_args()

    load_year(args.year)
