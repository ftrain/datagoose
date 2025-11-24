# Datagoose - Data Migration Framework

A **reusable template framework** for building data migration projects. Each migration project (like power-plants) is self-contained and can be easily created, managed, and extracted as a standalone repository.

## Features

- **Framework Architecture**: Reusable base classes for ETL, API, and UI
- **Project Isolation**: Each project is self-contained in `projects/<name>/`
- **CLI Management**: `dg` command for lifecycle operations (setup, teardown, status)
- **Multi-Project Support**: Run multiple projects with isolated Docker namespaces
- **AI Agents**: 9 specialized agents for development assistance

## Quick Start

```bash
# List available projects
./scripts/dg list

# Setup and run a project
./scripts/dg power-plants setup --migrate

# Check status
./scripts/dg power-plants status

# Teardown when done
./scripts/dg power-plants teardown
```

## Creating a New Project

```bash
# Create a new project from template
./scripts/dg create my-project

# This creates:
# projects/my-project/
# ├── project.config.ts
# ├── data/source/
# ├── schemas/migrations/
# ├── etl/
# ├── api/routes/
# ├── ui/pages/
# └── tests/
```

## Project Structure

```
datagoose/
├── framework/                # REUSABLE FRAMEWORK CODE
│   ├── api/                  # Express API core
│   │   └── src/
│   │       ├── core/         # App factory, DB pool
│   │       ├── middleware/   # Error handling, validation
│   │       └── utils/        # Query builder, pagination
│   ├── etl/                  # Python ETL framework
│   │   ├── pipeline.py       # Base pipeline classes
│   │   └── __init__.py       # Exports
│   └── ui/                   # React UI framework
│       └── src/
│           ├── hooks/        # Generic hooks (usePagination)
│           └── lib/          # API client factory
│
├── projects/                 # PROJECT-SPECIFIC CODE
│   └── power-plants/         # Example: Global Power Plant Database
│       ├── project.config.ts # Project configuration
│       ├── data/source/      # Source CSV files
│       ├── schemas/          # SQL migrations
│       ├── etl/              # ETL pipelines
│       ├── api/routes/       # API routes
│       ├── ui/pages/         # React pages
│       └── tests/            # Project tests
│
├── scripts/                  # CLI & Lifecycle Scripts
│   ├── dg                    # Main CLI entry point
│   ├── setup.sh              # Project setup
│   ├── teardown.sh           # Complete cleanup
│   ├── start.sh / stop.sh    # Service control
│   ├── migrate.sh            # Run ETL
│   └── create-project.sh     # Scaffold new project
│
├── src/                      # Integrated Application
│   ├── api/                  # Express REST API
│   └── ui/                   # React dashboard
│
├── docker/                   # Docker Configurations
│   └── docker-compose.yml    # Supports COMPOSE_PROJECT_NAME
│
└── docs/
    └── migration-reports/    # Per-project migration reports
```

## CLI Reference

```bash
# Global Commands
./scripts/dg list              # List available projects
./scripts/dg create <name>     # Create new project
./scripts/dg help              # Show help

# Project Commands
./scripts/dg <project> setup [--migrate]  # Initialize project
./scripts/dg <project> start              # Start services
./scripts/dg <project> stop               # Stop (preserve data)
./scripts/dg <project> teardown [--force] # Complete cleanup
./scripts/dg <project> status [--json]    # Service status
./scripts/dg <project> logs [service] -f  # View logs
./scripts/dg <project> migrate            # Run ETL pipeline
./scripts/dg <project> reset              # Reset database
./scripts/dg <project> test [suite]       # Run tests
```

## Example Project: Power Plants

The `power-plants` project demonstrates the framework with the **Global Power Plant Database**:

- **34,936** power plants across **167** countries
- **137,846** annual generation records (2013-2019)
- **15** fuel types tracked

```bash
# Run the demo
./scripts/dg power-plants setup --migrate

# Access:
# - UI:      http://localhost:5174
# - API:     http://localhost:3001
# - Swagger: http://localhost:3001/api/docs
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    projects/<name>/data/source/                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ETL Pipeline                                │
│        (extends framework/etl/pipeline.py)                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PostgreSQL Database                           │
│        (namespaced via COMPOSE_PROJECT_NAME)                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    REST API                                      │
│        (uses framework/api middleware)                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   React Dashboard                                │
│        (uses framework/ui hooks & components)                    │
└─────────────────────────────────────────────────────────────────┘
```

## Multi-Project Support

Run multiple projects simultaneously with isolated resources:

```bash
# Each project gets its own:
# - Docker containers (namespaced)
# - Database volume
# - Port allocation (configurable in project.config.ts)

# Start two projects
./scripts/dg power-plants start   # ports 5433, 3001, 5174
./scripts/dg my-project start     # ports 5434, 3002, 5175
```

## Testing

```bash
# Run all tests for a project
./scripts/dg <project> test all

# Run specific test suites
./scripts/dg <project> test etl    # pytest
./scripts/dg <project> test api    # Jest
./scripts/dg <project> test ui     # Vitest
./scripts/dg <project> test e2e    # Playwright
```

## AI Agents

Specialized agents assist with development:

| Agent | Purpose |
|-------|---------|
| `@migration-lead` | Orchestrates migration activities |
| `@data-detective` | Analyzes source data |
| `@schema-architect` | Designs PostgreSQL schemas |
| `@etl-engineer` | Builds ETL pipelines |
| `@docker-ops` | Manages Docker environments |
| `@api-builder` | Creates REST APIs |
| `@ui-builder` | Builds React interfaces |
| `@test-engineer` | Creates tests |
| `@docs-agent` | Writes documentation |

## Branch Strategy

Projects are maintained on dedicated branches:

```bash
# Main branch: framework code only
git checkout main

# Project branches: framework + project code
git checkout projects/power-plants
```

## License

Data: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (World Resources Institute)
Code: MIT
