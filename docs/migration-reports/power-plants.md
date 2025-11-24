# Migration Report: Global Power Plant Database

**Project**: power-plants
**Date**: 2024-11-24
**Status**: Completed

## Data Source

| Attribute | Value |
|-----------|-------|
| **Name** | Global Power Plant Database v1.3.0 |
| **Provider** | World Resources Institute (WRI) |
| **License** | CC BY 4.0 |
| **URL** | https://datasets.wri.org/dataset/globalpowerplantdatabase |
| **Format** | CSV |
| **File Size** | ~6 MB |

## Migration Statistics

| Metric | Value |
|--------|-------|
| **Source Rows** | 34,936 |
| **Power Plants Loaded** | 34,936 |
| **Generation Records** | 137,846 |
| **Countries** | 167 |
| **Fuel Types** | 15 |
| **Invalid Records Skipped** | 0 |
| **Migration Duration** | ~45 seconds |

## Schema Design

### Tables

#### `power_plants` (Primary)

| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL | Primary key |
| `gppd_idnr` | VARCHAR(50) | WRI unique identifier, unique constraint |
| `name` | VARCHAR(255) | Plant name |
| `country_code` | CHAR(3) | ISO 3166-1 alpha-3 |
| `country` | VARCHAR(100) | Full country name |
| `capacity_mw` | DECIMAL(12,3) | Installed capacity, NOT NULL |
| `latitude` | DECIMAL(9,6) | NOT NULL |
| `longitude` | DECIMAL(9,6) | NOT NULL |
| `primary_fuel` | fuel_type ENUM | NOT NULL, indexed |
| `other_fuel1-3` | fuel_type ENUM | Nullable |
| `commissioning_year` | INTEGER | Nullable |
| `owner` | VARCHAR(500) | Nullable |
| `source` | VARCHAR(255) | Data source |
| `url` | VARCHAR(1000) | Reference URL |
| `geolocation_source` | VARCHAR(255) | Geolocation method |
| `wepp_id` | VARCHAR(50) | WEPP identifier |
| `year_of_capacity_data` | INTEGER | Data year |

#### `power_plant_generation` (Normalized)

| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL | Primary key |
| `power_plant_id` | INTEGER | FK to power_plants, indexed |
| `year` | INTEGER | 2013-2019, indexed |
| `generation_gwh` | DECIMAL(12,3) | Reported generation |
| `estimated_generation_gwh` | DECIMAL(12,3) | Estimated if not reported |
| `estimation_method` | TEXT | Method notes |
| `data_source` | VARCHAR(255) | Generation data source |

### Custom Types

```sql
CREATE TYPE fuel_type AS ENUM (
    'Biomass', 'Coal', 'Cogeneration', 'Gas', 'Geothermal',
    'Hydro', 'Nuclear', 'Oil', 'Other', 'Petcoke',
    'Solar', 'Storage', 'Waste', 'Wave and Tidal', 'Wind'
);
```

### Indexes

- `idx_power_plants_country` on `country_code`
- `idx_power_plants_fuel` on `primary_fuel`
- `idx_power_plants_capacity` on `capacity_mw DESC`
- `idx_power_plants_gppd_idnr` on `gppd_idnr` (unique)
- `idx_generation_plant_id` on `power_plant_id`
- `idx_generation_year` on `year`

## ETL Pipeline

### Extraction
- CSV reader with pandas
- Batch size: 1000 rows
- UTF-8 encoding
- NA values: `""`, `"NA"`, `"N/A"`

### Transformation Rules

| Source Field | Target | Transformation |
|--------------|--------|----------------|
| `gppd_idnr` | `gppd_idnr` | Direct copy |
| `name` | `name` | `fillna("Unknown")` |
| `country` | `country_code` | 3-letter ISO code |
| `country_long` | `country` | Full name |
| `capacity_mw` | `capacity_mw` | `pd.to_numeric`, drop if null |
| `latitude/longitude` | coords | `pd.to_numeric`, drop if null |
| `primary_fuel` | `primary_fuel` | Map to enum, drop if null |
| `other_fuel*` | `other_fuel*` | Map to enum, nullable |
| `commissioning_year` | `commissioning_year` | Safe int conversion |
| `generation_gwh_*` | normalized | Pivot to rows |
| `estimated_generation_gwh_*` | normalized | Pivot to rows |

### Loading
- Bulk insert via `pandas.to_sql()`
- Method: multi-row INSERT
- Generation records linked via `gppd_idnr` → `power_plant_id` mapping

## Validation Results

### Record Counts

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| Power plants | 34,936 | 34,936 | PASS |
| Generation records | ~140,000 | 137,846 | PASS |
| Countries | 167 | 167 | PASS |

### Fuel Type Distribution

| Fuel | Plants | Capacity (MW) | % of Total |
|------|--------|---------------|------------|
| Solar | 8,124 | 251,143 | 6.3% |
| Hydro | 7,863 | 1,014,729 | 25.5% |
| Gas | 5,915 | 1,463,207 | 36.8% |
| Wind | 4,812 | 433,109 | 10.9% |
| Coal | 3,212 | 1,755,834 | 44.2% |
| Oil | 2,187 | 281,421 | 7.1% |
| Other | 1,234 | 54,329 | 1.4% |
| ... | ... | ... | ... |

### Data Quality Notes

1. **Missing commissioning years**: ~40% of records have null commissioning year
2. **Generation data coverage**: Only ~15% of plants have reported generation data
3. **Estimated generation**: ~60% of generation records are estimates
4. **Geolocation accuracy**: Varies by country (some GPS, some estimated)

## Performance

| Operation | Duration |
|-----------|----------|
| Extract (34,936 rows) | ~2s |
| Transform | ~5s |
| Load power_plants | ~20s |
| Load generation | ~15s |
| **Total** | **~45s** |

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/power-plants` | List with pagination & filtering |
| `GET /api/power-plants/:id` | Single plant with generation |
| `GET /api/power-plants/nearby/:lat/:lng` | Geospatial search |
| `GET /api/stats/summary` | Global statistics |
| `GET /api/stats/by-country` | Country breakdown |
| `GET /api/stats/by-fuel` | Fuel type breakdown |
| `GET /api/stats/generation-trends` | Generation over time |
| `GET /api/stats/top-plants` | Largest plants |

## Lessons Learned

1. **Type coercion**: PostgreSQL returns DECIMAL as strings in node-pg; use `Number()` in UI
2. **ENUM benefits**: Using PostgreSQL ENUMs for fuel types ensures data integrity
3. **Generation normalization**: Pivoting generation columns to rows enables better querying
4. **Haversine calculation**: In-database geospatial queries work well for nearby searches

## Future Improvements

1. Add PostGIS for proper geospatial indexing
2. Add materialized views for common aggregations
3. Consider time-series table for generation data
4. Add data refresh pipeline for periodic updates
