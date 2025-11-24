#!/usr/bin/env python3
"""
Base ETL Pipeline Framework

Provides abstract base classes for building data migration pipelines.
Projects extend these classes with domain-specific transformations.
"""

import os
import logging
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Iterator, Dict, Any, Optional, TypeVar, Generic
import pandas as pd
import numpy as np
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from tqdm import tqdm

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

T = TypeVar('T')


class BaseExtractor(ABC):
    """Base class for data extractors."""

    def __init__(self, source_path: Path, batch_size: int = 1000):
        self.source_path = source_path
        self.batch_size = batch_size
        self.stats = {"rows_extracted": 0}

    @abstractmethod
    def extract(self) -> Iterator[pd.DataFrame]:
        """Extract data in batches. Override in subclass."""
        pass


class CSVExtractor(BaseExtractor):
    """Extract data from CSV files."""

    def __init__(
        self,
        source_path: Path,
        batch_size: int = 1000,
        encoding: str = 'utf-8',
        na_values: list = None
    ):
        super().__init__(source_path, batch_size)
        self.encoding = encoding
        self.na_values = na_values or ["", "NA", "N/A"]

    def extract(self) -> Iterator[pd.DataFrame]:
        """Extract CSV data in batches."""
        logger.info(f"Extracting from {self.source_path}")

        for chunk in pd.read_csv(
            self.source_path,
            chunksize=self.batch_size,
            dtype=str,
            na_values=self.na_values,
            keep_default_na=True,
            encoding=self.encoding
        ):
            self.stats["rows_extracted"] += len(chunk)
            yield chunk

    def count_rows(self) -> int:
        """Count total rows in source file."""
        return sum(1 for _ in open(self.source_path)) - 1


class BaseTransformer(ABC, Generic[T]):
    """Base class for data transformers."""

    def __init__(self):
        self.stats = {"rows_transformed": 0, "errors": 0}

    @abstractmethod
    def transform(self, df: pd.DataFrame) -> T:
        """Transform raw data. Override in subclass."""
        pass

    def _safe_numeric(
        self,
        series: pd.Series,
        errors: str = 'coerce'
    ) -> pd.Series:
        """Safely convert series to numeric."""
        return pd.to_numeric(series, errors=errors)

    def _safe_int(self, series: pd.Series) -> pd.Series:
        """Safely convert series to nullable int."""
        numeric = self._safe_numeric(series)
        return numeric.apply(lambda x: int(x) if pd.notna(x) else None)

    def _map_values(
        self,
        series: pd.Series,
        mapping: Dict[str, str]
    ) -> pd.Series:
        """Map values using a dictionary."""
        return series.map(mapping)


class BaseLoader(ABC):
    """Base class for data loaders."""

    def __init__(self, engine: Engine):
        self.engine = engine
        self.stats = {"rows_loaded": 0}

    @abstractmethod
    def load(self, df: pd.DataFrame) -> int:
        """Load data to target. Override in subclass."""
        pass

    def _prepare_dataframe(self, df: pd.DataFrame) -> pd.DataFrame:
        """Prepare dataframe for loading (replace NaN with None)."""
        return df.replace({np.nan: None})

    def _bulk_insert(
        self,
        df: pd.DataFrame,
        table_name: str,
        columns: list
    ) -> int:
        """Bulk insert dataframe to table."""
        df_to_load = self._prepare_dataframe(df[columns].copy())

        df_to_load.to_sql(
            table_name,
            self.engine,
            if_exists="append",
            index=False,
            method="multi"
        )

        loaded = len(df_to_load)
        self.stats["rows_loaded"] += loaded
        return loaded


class BasePipeline(ABC):
    """Base class for ETL pipelines."""

    def __init__(self, batch_size: int = 1000):
        self.batch_size = batch_size
        self.engine = create_engine(self._get_connection_string())
        self.stats = {
            "extracted": 0,
            "transformed": 0,
            "loaded": 0,
            "errors": 0,
        }

    def _get_connection_string(self) -> str:
        """Get database connection string from environment."""
        return os.getenv(
            "DATABASE_URL",
            "postgresql://postgres:postgres@localhost:5432/datagoose"
        )

    @abstractmethod
    def get_extractor(self) -> BaseExtractor:
        """Return the extractor for this pipeline."""
        pass

    @abstractmethod
    def get_transformers(self) -> list:
        """Return list of transformers for this pipeline."""
        pass

    @abstractmethod
    def get_loaders(self) -> list:
        """Return list of loaders for this pipeline."""
        pass

    def run(self, dry_run: bool = False) -> dict:
        """Execute the ETL pipeline."""
        logger.info(f"Starting ETL pipeline (dry_run={dry_run})")

        extractor = self.get_extractor()
        transformers = self.get_transformers()
        loaders = self.get_loaders()

        total_rows = extractor.count_rows() if hasattr(extractor, 'count_rows') else 0
        logger.info(f"Total rows to process: {total_rows}")

        with tqdm(total=total_rows, desc="Processing") as pbar:
            for batch in extractor.extract():
                self.stats["extracted"] += len(batch)

                # Transform
                transformed_data = []
                for transformer in transformers:
                    result = transformer.transform(batch)
                    transformed_data.append(result)
                    self.stats["transformed"] += len(result) if hasattr(result, '__len__') else 0

                # Load
                if not dry_run:
                    for loader, data in zip(loaders, transformed_data):
                        if not data.empty if hasattr(data, 'empty') else data:
                            loader.load(data)
                            self.stats["loaded"] += len(data) if hasattr(data, '__len__') else 0

                pbar.update(len(batch))

        logger.info(f"ETL complete: {self.stats}")
        return self.stats

    def validate(self) -> dict:
        """Validate migration results. Override in subclass."""
        return {}
