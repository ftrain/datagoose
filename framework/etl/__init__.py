"""
Datagoose ETL Framework

Base classes for building data migration pipelines.
"""

from .pipeline import (
    BasePipeline,
    BaseExtractor,
    BaseTransformer,
    BaseLoader,
    CSVExtractor,
)

__all__ = [
    'BasePipeline',
    'BaseExtractor',
    'BaseTransformer',
    'BaseLoader',
    'CSVExtractor',
]
