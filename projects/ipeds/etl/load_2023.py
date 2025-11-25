"""
Load IPEDS 2023 raw data into PostgreSQL.

Creates staging tables from ZIP files with ETL tracking.
"""

import logging
import zipfile
from pathlib import Path

import pandas as pd
import psycopg2
from io import StringIO

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(message)s")
logger = logging.getLogger(__name__)

# Paths
RAW_DIR = Path(__file__).parent.parent / "data" / "raw"
CONN_STRING = "host=localhost port=5433 dbname=datagoose user=postgres password=postgres"

# Files to load for 2023
FILES_2023 = [
    ("HD2023.zip", "hd2023", "Institutional directory"),
    ("ADM2023.zip", "adm2023", "Admissions data"),
    ("GR2023.zip", "gr2023", "Graduation rates"),
    ("GR2023_PELL_SSL.zip", "gr2023_pell_ssl", "Pell graduation rates"),
    ("EF2023A.zip", "ef2023a", "Fall enrollment by race/gender"),
    ("EF2023B.zip", "ef2023b", "Fall enrollment by age"),
    ("C2023_A.zip", "c2023_a", "Completions by CIP"),
    ("SFA2223.zip", "sfa2223", "Student financial aid"),
    ("IC2023.zip", "ic2023", "Institutional characteristics"),
]


def extract_csv_from_zip(zip_path: Path, encoding: str = "latin-1") -> pd.DataFrame:
    """Extract CSV from zip file."""
    with zipfile.ZipFile(zip_path, "r") as zf:
        csv_name = [n for n in zf.namelist() if n.endswith(".csv")][0]
        with zf.open(csv_name) as f:
            df = pd.read_csv(f, encoding=encoding, low_memory=False)

    # Clean column names - strip BOM (appears in various encodings), lowercase
    df.columns = [
        c.replace("\ufeff", "")  # UTF-8 BOM as unicode
         .replace("\xef\xbb\xbf", "")  # UTF-8 BOM as bytes
         .replace("ï»¿", "")  # UTF-8 BOM read as latin-1
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


def load_file(conn, zip_name: str, table_name: str, run_id: int) -> int:
    """Load a single ZIP file into a table with ETL tracking."""
    zip_path = RAW_DIR / zip_name

    if not zip_path.exists():
        logger.warning(f"  File not found: {zip_name}, skipping")
        return 0

    # Start table log
    with conn.cursor() as cur:
        cur.execute(
            "SELECT etl_log_table_start(%s, %s, %s, %s, NULL)",
            (run_id, table_name, "load", zip_name)
        )
        log_id = cur.fetchone()[0]
    conn.commit()

    try:
        logger.info(f"Loading {zip_name} -> {table_name}...")
        df = extract_csv_from_zip(zip_path)
        logger.info(f"  {len(df)} rows, {len(df.columns)} columns")

        create_table_from_df(conn, table_name, df)
        copy_df_to_table(conn, table_name, df)

        # Complete table log
        with conn.cursor() as cur:
            cur.execute(
                "SELECT etl_log_table_complete(%s, %s, %s, NULL)",
                (log_id, len(df), "completed")
            )
        conn.commit()

        logger.info(f"  Done: {len(df)} rows loaded")
        return len(df)

    except Exception as e:
        # Log failure
        with conn.cursor() as cur:
            cur.execute(
                "SELECT etl_log_table_complete(%s, %s, %s, %s)",
                (log_id, 0, "failed", str(e))
            )
        conn.commit()
        raise


def main():
    logger.info("Connecting to PostgreSQL...")
    conn = psycopg2.connect(CONN_STRING)

    # Start ETL run
    with conn.cursor() as cur:
        cur.execute(
            "SELECT etl_start_run(%s, %s, %s)",
            ("raw_load", 2023, '{"source": "NCES IPEDS"}')
        )
        run_id = cur.fetchone()[0]
    conn.commit()
    logger.info(f"Started ETL run {run_id}")

    try:
        total_rows = 0
        tables_loaded = 0

        for zip_name, table_name, description in FILES_2023:
            try:
                rows = load_file(conn, zip_name, table_name, run_id)
                total_rows += rows
                if rows > 0:
                    tables_loaded += 1
            except Exception as e:
                logger.error(f"  Failed to load {zip_name}: {e}")

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
                logger.info(f"  {row[0]}: {row[1]:,} rows ({row[2]})")

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

    logger.info("All done!")


if __name__ == "__main__":
    main()
