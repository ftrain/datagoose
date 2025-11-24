# Power Plants Project

A Datagoose migration project for the **Global Power Plant Database**.

## Overview

This project migrates the World Resources Institute's [Global Power Plant Database](https://datasets.wri.org/dataset/globalpowerplantdatabase) into a normalized PostgreSQL schema with a REST API and React dashboard.

### Data Summary

- **34,936** power plants worldwide
- **137,846** annual generation records (2013-2019)
- **167** countries represented
- **15** fuel types tracked

## Quick Start

```bash
# From the datagoose root directory
./scripts/dg power-plants setup --migrate

# Or step by step:
./scripts/dg power-plants start      # Start Docker services
./scripts/dg power-plants migrate    # Run ETL pipeline
./scripts/dg power-plants status     # Check service health
```

## Project Structure

```
power-plants/
├── project.config.ts       # Project configuration
├── data/
│   └── source/            # Source CSV files
├── schemas/
│   ├── migrations/        # SQL schema files
│   └── rollback/          # Rollback scripts
├── etl/
│   └── migrate_power_plants.py  # ETL pipeline
├── api/
│   └── routes/            # Express API routes
│       ├── powerPlants.ts # Power plant CRUD
│       └── stats.ts       # Statistics endpoints
├── ui/
│   ├── pages/             # React pages
│   │   ├── Dashboard.tsx
│   │   ├── PowerPlants.tsx
│   │   └── PowerPlantDetail.tsx
│   └── hooks/
│       └── usePowerPlants.ts
└── tests/                 # Project tests
    ├── etl/
    ├── api/
    ├── ui/
    └── e2e/
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| PostgreSQL | 5433 | Database server |
| API | 3001 | Express REST API |
| UI | 5174 | React dashboard |
| Swagger | 3001/api/docs | API documentation |

## API Endpoints

### Power Plants
- `GET /api/power-plants` - List with pagination & filtering
- `GET /api/power-plants/:id` - Get plant with generation data
- `GET /api/power-plants/nearby/:lat/:lng` - Find nearby plants

### Statistics
- `GET /api/stats/summary` - Overall statistics
- `GET /api/stats/by-country` - Stats by country
- `GET /api/stats/by-fuel` - Stats by fuel type
- `GET /api/stats/generation-trends` - Generation over time
- `GET /api/stats/top-plants` - Largest power plants

## Data Source

**Global Power Plant Database v1.3.0**
- Source: World Resources Institute
- License: CC BY 4.0
- Download: https://datasets.wri.org/dataset/globalpowerplantdatabase

## Schema

### Tables

**power_plants** - Main plant data
- `id` - Primary key
- `gppd_idnr` - WRI unique identifier
- `name` - Plant name
- `country_code` / `country` - Location
- `capacity_mw` - Installed capacity
- `latitude` / `longitude` - Coordinates
- `primary_fuel` - Main fuel type (enum)
- `commissioning_year` - Year built
- `owner` - Ownership info

**power_plant_generation** - Annual generation data
- `power_plant_id` - Foreign key
- `year` - Data year (2013-2019)
- `generation_gwh` - Reported generation
- `estimated_generation_gwh` - Estimated if not reported

## Teardown

```bash
# Stop services, remove containers and volumes
./scripts/dg power-plants teardown

# Keep database data
./scripts/dg power-plants teardown --keep-data
```

## Development

```bash
# Run tests
./scripts/dg power-plants test

# Run specific test suite
./scripts/dg power-plants test etl
./scripts/dg power-plants test api
./scripts/dg power-plants test ui
./scripts/dg power-plants test e2e
```

## Branch Strategy

This project is maintained on the `projects/power-plants` branch and can be extracted as a standalone repository.
