"""
IPEDS Data Download Module

Provides functionality to download IPEDS data files and dictionary files from NCES.
Translated from the R package ripeds (https://github.com/nehgov/ripeds).

Usage:
    # Download specific files
    download_to_disk("./data", files=["IC2022", "HD2022"])

    # Download dictionary files
    download_to_disk("./data", files=["IC2022"], file_type="dictionary")

    # Download by year using file table
    file_table = get_file_table()
    files_2020 = file_table[file_table["year"] == 2020]
    download_to_disk("./data", use_file_table=files_2020)
"""

import os
import time
import random
import logging
from pathlib import Path
from typing import Literal
from urllib.parse import urljoin

import pandas as pd
import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

BASE_URL = "https://nces.ed.gov/ipeds/datacenter/data"
FILE_TABLE_URL = "https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx"

# Module-level cache for file table
_file_table_cache: pd.DataFrame | None = None


def get_file_table(redownload: bool = False) -> pd.DataFrame:
    """
    Fetch and return a table of all available IPEDS complete data files.

    Scrapes the NCES DataFiles page to get all available survey files.
    Results are cached in memory for the session.

    Args:
        redownload: If True, re-scrape from NCES even if cached.

    Returns:
        DataFrame with columns: year, survey, title, file

    Example:
        >>> file_table = get_file_table()
        >>> file_table[file_table["year"] == 2022]
    """
    global _file_table_cache

    if _file_table_cache is not None and not redownload:
        return _file_table_cache.copy()

    logger.info("Fetching IPEDS file table from NCES...")

    # Request with parameters to get all files
    params = {"year": "-1", "surveyNumber": "-1"}
    response = requests.get(FILE_TABLE_URL, params=params, timeout=30)
    response.raise_for_status()

    # Parse HTML and find the results table
    soup = BeautifulSoup(response.content, "html.parser")
    table = soup.find(id="contentPlaceHolder_tblResult")

    if table is None:
        raise ValueError("Could not find file table on NCES website")

    # Parse table rows
    rows = []
    headers = []

    for tr in table.find_all("tr"):
        th_cells = tr.find_all("th")
        if th_cells:
            headers = [th.get_text(strip=True).lower() for th in th_cells]
            continue

        td_cells = tr.find_all("td")
        if td_cells:
            row = [td.get_text(strip=True) for td in td_cells]
            if len(row) == len(headers):
                rows.append(row)

    df = pd.DataFrame(rows, columns=headers)

    # Rename "data file" to "file" for consistency
    if "data file" in df.columns:
        df = df.rename(columns={"data file": "file"})

    # Select and order columns
    df = df[["year", "survey", "title", "file"]]

    # Convert year to integer
    df["year"] = pd.to_numeric(df["year"], errors="coerce")

    # Remove duplicates
    df = df.drop_duplicates()

    _file_table_cache = df
    logger.info(f"Found {len(df)} IPEDS files")

    return df.copy()


def download_to_disk(
    to_dir: str | Path,
    files: list[str] | None = None,
    use_file_table: pd.DataFrame | None = None,
    file_type: Literal["data", "dictionary"] = "data",
    overwrite: bool = False,
    create_dir: bool = True,
    quiet: bool = False,
) -> list[str]:
    """
    Download IPEDS data or dictionary files directly to disk.

    Downloads zip files from NCES IPEDS Data Center. Each zip contains
    CSV files with the data or dictionary information.

    Args:
        to_dir: Directory to save files (created if doesn't exist).
        files: List of file stub names (e.g., ["IC2022", "HD2022"]).
        use_file_table: DataFrame from get_file_table() to download all files
            matching the filter. Takes precedence over `files` if provided.
        file_type: "data" for data files, "dictionary" for data dictionaries.
        overwrite: If True, re-download existing files.
        create_dir: If True, create to_dir if it doesn't exist.
        quiet: If True, suppress progress messages.

    Returns:
        List of downloaded file paths.

    Examples:
        # Download specific files
        >>> download_to_disk("./data", files=["IC2022"])

        # Download dictionary files
        >>> download_to_disk("./data", files=["IC2022"], file_type="dictionary")

        # Download all 2020 files
        >>> ft = get_file_table()
        >>> download_to_disk("./data", use_file_table=ft[ft["year"] == 2020])

        # Download all Institutional Characteristics surveys
        >>> ft = get_file_table()
        >>> download_to_disk("./data", use_file_table=ft[ft["survey"] == "Institutional Characteristics"])
    """
    to_dir = Path(to_dir)

    # Handle directory creation
    if not to_dir.exists():
        if create_dir:
            to_dir.mkdir(parents=True, exist_ok=True)
        else:
            raise FileNotFoundError(
                f"Directory does not exist: {to_dir}. "
                "Either create the directory or set create_dir=True"
            )

    # Get file list from file_table if provided
    if use_file_table is not None:
        files = use_file_table["file"].unique().tolist()

    if not files:
        raise ValueError("No files specified. Provide `files` or `use_file_table`.")

    # Validate files against known IPEDS files
    known_files = set(get_file_table()["file"])
    invalid_files = [f for f in files if f not in known_files]

    if invalid_files:
        logger.warning(
            f"The following files are not found in IPEDS and will be skipped:\n"
            f"  {', '.join(invalid_files)}"
        )
        files = [f for f in files if f in known_files]

    if not files:
        raise ValueError("No valid files to download after validation.")

    # Add dictionary suffix if needed
    if file_type == "dictionary":
        files = [f"{f}_Dict" for f in files]

    # Check for existing files if not overwriting
    if not overwrite:
        existing = {p.stem for p in to_dir.glob("*.zip")}
        overlap = [f for f in files if f in existing]

        if overlap and not quiet:
            logger.info(
                f"Skipping {len(overlap)} already downloaded files. "
                f"Set overwrite=True to re-download."
            )

        files = [f for f in files if f not in existing]

    if not files:
        if not quiet:
            logger.info("No new files to download.")
        return []

    # Download files
    downloaded = []

    if not quiet:
        logger.info(f"Downloading {len(files)} files to {to_dir}:")

    for i, file_stub in enumerate(files, 1):
        filename = f"{file_stub}.zip"
        url = f"{BASE_URL}/{filename}"
        dest_path = to_dir / filename

        if not quiet:
            logger.info(f"  [{i}/{len(files)}] {filename}")

        try:
            response = requests.get(url, timeout=60)
            response.raise_for_status()

            with open(dest_path, "wb") as f:
                f.write(response.content)

            downloaded.append(str(dest_path))

        except requests.RequestException as e:
            logger.error(f"Failed to download {filename}: {e}")
            continue

        # Pause every 50 files to avoid throttling
        if i % 50 == 0 and i < len(files):
            pause_time = random.randint(15, 25)
            if not quiet:
                logger.info(f"  Pausing {pause_time}s to avoid server throttling...")
            time.sleep(pause_time)

    if not quiet:
        logger.info(f"Downloaded {len(downloaded)} files.")

    return downloaded


def download_data_files(
    to_dir: str | Path,
    files: list[str] | None = None,
    years: list[int] | None = None,
    surveys: list[str] | None = None,
    overwrite: bool = False,
    quiet: bool = False,
) -> list[str]:
    """
    Convenience function to download IPEDS data files.

    Args:
        to_dir: Directory to save files.
        files: Specific file stub names to download.
        years: Download all files from these years.
        surveys: Download all files from these survey categories.
        overwrite: Re-download existing files.
        quiet: Suppress progress messages.

    Returns:
        List of downloaded file paths.

    Examples:
        # Download specific files
        >>> download_data_files("./data", files=["HD2022", "IC2022"])

        # Download all files from 2020-2022
        >>> download_data_files("./data", years=[2020, 2021, 2022])

        # Download all Directory Information files
        >>> download_data_files("./data", surveys=["Institutional Characteristics"])
    """
    file_table = get_file_table()

    if files:
        return download_to_disk(to_dir, files=files, overwrite=overwrite, quiet=quiet)

    if years or surveys:
        filtered = file_table
        if years:
            filtered = filtered[filtered["year"].isin(years)]
        if surveys:
            filtered = filtered[filtered["survey"].isin(surveys)]

        return download_to_disk(
            to_dir, use_file_table=filtered, overwrite=overwrite, quiet=quiet
        )

    raise ValueError("Must specify files, years, or surveys to download.")


def download_dictionary_files(
    to_dir: str | Path,
    files: list[str] | None = None,
    years: list[int] | None = None,
    surveys: list[str] | None = None,
    overwrite: bool = False,
    quiet: bool = False,
) -> list[str]:
    """
    Convenience function to download IPEDS dictionary files.

    Dictionary files contain variable definitions and value labels
    for the corresponding data files.

    Args:
        to_dir: Directory to save files.
        files: Specific file stub names to download (without _Dict suffix).
        years: Download all dictionary files from these years.
        surveys: Download all dictionary files from these survey categories.
        overwrite: Re-download existing files.
        quiet: Suppress progress messages.

    Returns:
        List of downloaded file paths.

    Examples:
        # Download dictionary for specific files
        >>> download_dictionary_files("./data", files=["HD2022"])

        # Download all dictionary files from 2022
        >>> download_dictionary_files("./data", years=[2022])
    """
    file_table = get_file_table()

    if files:
        return download_to_disk(
            to_dir, files=files, file_type="dictionary", overwrite=overwrite, quiet=quiet
        )

    if years or surveys:
        filtered = file_table
        if years:
            filtered = filtered[filtered["year"].isin(years)]
        if surveys:
            filtered = filtered[filtered["survey"].isin(surveys)]

        return download_to_disk(
            to_dir,
            use_file_table=filtered,
            file_type="dictionary",
            overwrite=overwrite,
            quiet=quiet,
        )

    raise ValueError("Must specify files, years, or surveys to download.")


if __name__ == "__main__":
    # Example usage
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    # Show available files
    ft = get_file_table()
    print(f"\nAvailable IPEDS files: {len(ft)}")
    print(f"Years: {sorted(ft['year'].dropna().unique().astype(int))}")
    print(f"Surveys: {sorted(ft['survey'].unique())}")
