#!/usr/bin/env python3
"""
ETL Pipeline for Global Power Plant Database
Migrates CSV data into PostgreSQL with proper normalization.

Usage:
    python migrate_power_plants.py --source data/source/global_power_plant_database.csv
    python migrate_power_plants.py --source data/source/global_power_plant_database.csv --dry-run
"""

import os
import logging
import click
import pandas as pd
import numpy as np
from pathlib import Path
from sqlalchemy import create_engine, text
from typing import Iterator, Optional
from tqdm import tqdm

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Fuel type mapping (normalize to enum values)
FUEL_TYPE_MAP = {
    'Biomass': 'Biomass',
    'Coal': 'Coal',
    'Cogeneration': 'Cogeneration',
    'Gas': 'Gas',
    'Geothermal': 'Geothermal',
    'Hydro': 'Hydro',
    'Nuclear': 'Nuclear',
    'Oil': 'Oil',
    'Other': 'Other',
    'Petcoke': 'Petcoke',
    'Solar': 'Solar',
    'Storage': 'Storage',
    'Waste': 'Waste',
    'Wave and Tidal': 'Wave and Tidal',
    'Wind': 'Wind',
}

# Generation years available in the dataset
GENERATION_YEARS = [2013, 2014, 2015, 2016, 2017, 2018, 2019]


class PowerPlantETL:
    """ETL Pipeline for Global Power Plant Database."""

    def __init__(self, source_path: str, batch_size: int = 1000):
        self.source_path = Path(source_path)
        self.batch_size = batch_size
        self.engine = create_engine(self._get_connection_string())
        self.stats = {
            "plants_extracted": 0,
            "plants_loaded": 0,
            "generation_records": 0,
            "errors": 0,
        }

    def _get_connection_string(self) -> str:
        return os.getenv(
            "DATABASE_URL",
            "postgresql://postgres:postgres@localhost:5432/datagoose"
        )

    def extract(self) -> Iterator[pd.DataFrame]:
        """Extract power plant data in batches."""
        logger.info(f"Extracting from {self.source_path}")

        for chunk in pd.read_csv(
            self.source_path,
            chunksize=self.batch_size,
            dtype=str,
            na_values=["", "NA", "N/A"],
            keep_default_na=True,
            encoding='utf-8'
        ):
            self.stats["plants_extracted"] += len(chunk)
            yield chunk

    def transform_power_plants(self, df: pd.DataFrame) -> pd.DataFrame:
        """Transform raw data into power_plants table format."""
        plants = pd.DataFrame()

        # Direct mappings
        plants["gppd_idnr"] = df["gppd_idnr"]
        plants["name"] = df["name"].fillna("Unknown")
        plants["country_code"] = df["country"]
        plants["country"] = df["country_long"]

        # Numeric fields
        plants["capacity_mw"] = pd.to_numeric(df["capacity_mw"], errors='coerce')
        plants["latitude"] = pd.to_numeric(df["latitude"], errors='coerce')
        plants["longitude"] = pd.to_numeric(df["longitude"], errors='coerce')

        # Fuel types - map to enum values
        plants["primary_fuel"] = df["primary_fuel"].map(FUEL_TYPE_MAP)
        plants["other_fuel1"] = df["other_fuel1"].map(FUEL_TYPE_MAP)
        plants["other_fuel2"] = df["other_fuel2"].map(FUEL_TYPE_MAP)
        plants["other_fuel3"] = df["other_fuel3"].map(FUEL_TYPE_MAP)

        # Optional fields - handle float to int conversion safely
        comm_year = pd.to_numeric(df["commissioning_year"], errors='coerce')
        plants["commissioning_year"] = comm_year.apply(
            lambda x: int(x) if pd.notna(x) else None
        )

        plants["owner"] = df["owner"]
        plants["source"] = df["source"]
        plants["url"] = df["url"]
        plants["geolocation_source"] = df["geolocation_source"]
        plants["wepp_id"] = df["wepp_id"]

        cap_year = pd.to_numeric(df["year_of_capacity_data"], errors='coerce')
        plants["year_of_capacity_data"] = cap_year.apply(
            lambda x: int(x) if pd.notna(x) else None
        )

        # Filter out invalid records
        valid = (
            plants["capacity_mw"].notna() &
            plants["latitude"].notna() &
            plants["longitude"].notna() &
            plants["primary_fuel"].notna()
        )

        invalid_count = (~valid).sum()
        if invalid_count > 0:
            logger.warning(f"Skipping {invalid_count} invalid records")
            self.stats["errors"] += invalid_count

        return plants[valid]

    def transform_generation(
        self, df: pd.DataFrame
    ) -> pd.DataFrame:
        """Transform raw data into generation records (normalized)."""
        records = []

        for _, row in df.iterrows():
            gppd_idnr = row["gppd_idnr"]

            for year in GENERATION_YEARS:
                reported_col = f"generation_gwh_{year}"
                estimated_col = f"estimated_generation_gwh_{year}"
                note_col = f"estimated_generation_note_{year}"

                reported = pd.to_numeric(row.get(reported_col), errors='coerce')
                estimated = pd.to_numeric(row.get(estimated_col), errors='coerce')
                method = row.get(note_col) if pd.notna(row.get(note_col)) else None

                # Skip if no generation data for this year
                if pd.isna(reported) and pd.isna(estimated):
                    continue

                records.append({
                    "gppd_idnr": gppd_idnr,
                    "year": year,
                    "generation_gwh": reported if pd.notna(reported) else None,
                    "estimated_generation_gwh": estimated if pd.notna(estimated) else None,
                    "estimation_method": method,
                    "data_source": row.get("generation_data_source"),
                })

        return pd.DataFrame(records)

    def load_power_plants(self, df: pd.DataFrame) -> int:
        """Load power plants into PostgreSQL."""
        if df.empty:
            return 0

        columns = [
            "gppd_idnr", "name", "country_code", "country",
            "capacity_mw", "latitude", "longitude",
            "primary_fuel", "other_fuel1", "other_fuel2", "other_fuel3",
            "commissioning_year", "owner", "source", "url",
            "geolocation_source", "wepp_id", "year_of_capacity_data"
        ]

        df_to_load = df[columns].copy()

        # Replace NaN with None for nullable columns
        df_to_load = df_to_load.replace({np.nan: None})

        df_to_load.to_sql(
            "power_plants",
            self.engine,
            if_exists="append",
            index=False,
            method="multi"
        )

        self.stats["plants_loaded"] += len(df_to_load)
        return len(df_to_load)

    def load_generation(self, df: pd.DataFrame) -> int:
        """Load generation data, joining with power_plant IDs."""
        if df.empty:
            return 0

        # Get the mapping of gppd_idnr to power_plant.id
        gppd_ids = df["gppd_idnr"].unique().tolist()
        placeholders = ",".join([f"'{x}'" for x in gppd_ids])

        with self.engine.connect() as conn:
            result = conn.execute(text(
                f"SELECT id, gppd_idnr FROM power_plants WHERE gppd_idnr IN ({placeholders})"
            ))
            id_map = {row[1]: row[0] for row in result}

        # Map gppd_idnr to power_plant_id
        df["power_plant_id"] = df["gppd_idnr"].map(id_map)
        df = df.dropna(subset=["power_plant_id"])
        df["power_plant_id"] = df["power_plant_id"].astype(int)

        # Select columns for loading
        gen_df = df[[
            "power_plant_id", "year", "generation_gwh",
            "estimated_generation_gwh", "estimation_method", "data_source"
        ]].copy()

        gen_df = gen_df.replace({np.nan: None})

        gen_df.to_sql(
            "power_plant_generation",
            self.engine,
            if_exists="append",
            index=False,
            method="multi"
        )

        self.stats["generation_records"] += len(gen_df)
        return len(gen_df)

    def run(self, dry_run: bool = False) -> dict:
        """Execute the full ETL pipeline."""
        logger.info(f"Starting ETL pipeline (dry_run={dry_run})")

        # Count total rows for progress bar
        total_rows = sum(1 for _ in open(self.source_path)) - 1
        logger.info(f"Total rows to process: {total_rows}")

        with tqdm(total=total_rows, desc="Processing") as pbar:
            for batch_num, raw_df in enumerate(self.extract(), 1):
                # Transform power plants
                plants_df = self.transform_power_plants(raw_df)

                # Transform generation data
                gen_df = self.transform_generation(raw_df)

                if not dry_run:
                    # Load power plants first
                    self.load_power_plants(plants_df)

                    # Then load generation data
                    self.load_generation(gen_df)

                pbar.update(len(raw_df))

        logger.info(f"ETL complete: {self.stats}")
        return self.stats

    def validate(self) -> dict:
        """Validate migration results."""
        with self.engine.connect() as conn:
            plant_count = conn.execute(
                text("SELECT COUNT(*) FROM power_plants")
            ).scalar()

            gen_count = conn.execute(
                text("SELECT COUNT(*) FROM power_plant_generation")
            ).scalar()

            country_count = conn.execute(
                text("SELECT COUNT(DISTINCT country_code) FROM power_plants")
            ).scalar()

            fuel_breakdown = conn.execute(text("""
                SELECT primary_fuel, COUNT(*) as cnt, SUM(capacity_mw) as total_mw
                FROM power_plants
                GROUP BY primary_fuel
                ORDER BY total_mw DESC
            """)).fetchall()

        return {
            "power_plants": plant_count,
            "generation_records": gen_count,
            "countries": country_count,
            "fuel_breakdown": [
                {"fuel": r[0], "count": r[1], "total_mw": float(r[2])}
                for r in fuel_breakdown
            ],
        }


@click.command()
@click.option(
    "--source", "-s",
    required=True,
    help="Path to source CSV file"
)
@click.option(
    "--batch-size", "-b",
    default=1000,
    help="Batch size for processing"
)
@click.option(
    "--dry-run",
    is_flag=True,
    help="Run without loading data"
)
@click.option(
    "--validate",
    is_flag=True,
    help="Run validation after migration"
)
def main(source: str, batch_size: int, dry_run: bool, validate: bool):
    """Migrate Global Power Plant Database to PostgreSQL."""
    etl = PowerPlantETL(source, batch_size)

    try:
        stats = etl.run(dry_run=dry_run)
        click.echo(f"\nMigration Stats: {stats}")

        if validate and not dry_run:
            validation = etl.validate()
            click.echo(f"\nValidation Results:")
            click.echo(f"  Power Plants: {validation['power_plants']:,}")
            click.echo(f"  Generation Records: {validation['generation_records']:,}")
            click.echo(f"  Countries: {validation['countries']}")
            click.echo(f"\nFuel Type Breakdown:")
            for fuel in validation['fuel_breakdown']:
                click.echo(
                    f"  {fuel['fuel']}: {fuel['count']:,} plants, "
                    f"{fuel['total_mw']:,.0f} MW"
                )

    except Exception as e:
        logger.error(f"Migration failed: {e}")
        raise


if __name__ == "__main__":
    main()
