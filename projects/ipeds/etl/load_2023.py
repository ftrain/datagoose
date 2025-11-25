"""
Load IPEDS 2023 data into PostgreSQL.

Quick and dirty first pass - we'll iterate from here.
"""

import logging
import zipfile
from pathlib import Path

import pandas as pd
import psycopg2
from psycopg2 import sql
from io import StringIO

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(message)s")
logger = logging.getLogger(__name__)

# Paths
RAW_DIR = Path(__file__).parent.parent / "data" / "raw"
CONN_STRING = "host=localhost port=5433 dbname=datagoose user=postgres password=postgres"


def extract_csv_from_zip(zip_path: Path, encoding: str = "latin-1") -> pd.DataFrame:
    """Extract CSV from zip file."""
    with zipfile.ZipFile(zip_path, "r") as zf:
        csv_name = [n for n in zf.namelist() if n.endswith(".csv")][0]
        with zf.open(csv_name) as f:
            df = pd.read_csv(f, encoding=encoding, low_memory=False)

    # Clean column names - strip BOM, lowercase
    df.columns = [c.replace("\ufeff", "").strip().lower() for c in df.columns]
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


def load_hd2023(conn):
    """Load institutional directory."""
    logger.info("Loading HD2023 (institutions)...")
    df = extract_csv_from_zip(RAW_DIR / "HD2023.zip")
    logger.info(f"  {len(df)} institutions, {len(df.columns)} columns")

    create_table_from_df(conn, "hd2023", df)
    copy_df_to_table(conn, "hd2023", df)
    logger.info("  Done")
    return len(df)


def load_adm2023(conn):
    """Load admissions data."""
    logger.info("Loading ADM2023 (admissions)...")
    df = extract_csv_from_zip(RAW_DIR / "ADM2023.zip")
    logger.info(f"  {len(df)} records, {len(df.columns)} columns")

    create_table_from_df(conn, "adm2023", df)
    copy_df_to_table(conn, "adm2023", df)
    logger.info("  Done")
    return len(df)


def load_gr2023(conn):
    """Load graduation rates."""
    logger.info("Loading GR2023 (graduation rates)...")
    df = extract_csv_from_zip(RAW_DIR / "GR2023.zip")
    logger.info(f"  {len(df)} records, {len(df.columns)} columns")

    create_table_from_df(conn, "gr2023", df)
    copy_df_to_table(conn, "gr2023", df)
    logger.info("  Done")
    return len(df)


def load_gr2023_pell(conn):
    """Load Pell graduation rates."""
    logger.info("Loading GR2023_PELL_SSL (Pell graduation rates)...")
    df = extract_csv_from_zip(RAW_DIR / "GR2023_PELL_SSL.zip")
    logger.info(f"  {len(df)} records, {len(df.columns)} columns")

    create_table_from_df(conn, "gr2023_pell_ssl", df)
    copy_df_to_table(conn, "gr2023_pell_ssl", df)
    logger.info("  Done")
    return len(df)


def load_ef2023a(conn):
    """Load fall enrollment."""
    logger.info("Loading EF2023A (fall enrollment)...")
    df = extract_csv_from_zip(RAW_DIR / "EF2023A.zip")
    logger.info(f"  {len(df)} records, {len(df.columns)} columns")

    create_table_from_df(conn, "ef2023a", df)
    copy_df_to_table(conn, "ef2023a", df)
    logger.info("  Done")
    return len(df)


def load_c2023_a(conn):
    """Load completions by CIP."""
    logger.info("Loading C2023_A (completions)...")
    df = extract_csv_from_zip(RAW_DIR / "C2023_A.zip")
    logger.info(f"  {len(df)} records, {len(df.columns)} columns")

    create_table_from_df(conn, "c2023_a", df)
    copy_df_to_table(conn, "c2023_a", df)
    logger.info("  Done")
    return len(df)


def main():
    logger.info("Connecting to PostgreSQL...")
    conn = psycopg2.connect(CONN_STRING)

    try:
        load_hd2023(conn)
        load_adm2023(conn)
        load_gr2023(conn)
        load_gr2023_pell(conn)
        load_ef2023a(conn)
        load_c2023_a(conn)

        # Quick test query
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM hd2023")
            count = cur.fetchone()[0]
            logger.info(f"Verification: {count} institutions in hd2023")

    finally:
        conn.close()

    logger.info("All done!")


if __name__ == "__main__":
    main()
