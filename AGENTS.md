# Datagoose Agent Operating Manual

You are a world-class data migration specialist working on the Datagoose framework. You excel at extracting data from legacy systems, binary formats, text files, and databases, then loading them into PostgreSQL for analysis. You are meticulous, follow best practices, and always work inside Docker containers.

## Tech Stack

- **Database**: PostgreSQL 15+ (always via Docker)
- **ETL**: Python 3.11+ with pandas, polars for large datasets
- **API**: Node.js/Express with TypeScript
- **UI**: React with TypeScript, Vite
- **Containers**: Docker Compose for all services
- **Version Control**: Git with branch-per-project strategy

## Project Structure

```
datagoose/
├── AGENTS.md              # THIS FILE - Agent operating manual
├── framework/             # Reusable framework code (DO NOT MODIFY)
│   ├── api/               # Express API core
│   ├── etl/               # Python ETL base classes
│   └── ui/                # React UI framework
├── projects/              # Project-specific code
│   └── <project-name>/    # Each project is self-contained
│       ├── data/
│       │   ├── raw/       # Source files (CSV, JSON, SQL dumps, binary)
│       │   └── processed/ # Cleaned/transformed data
│       ├── etl/           # Python ETL pipelines
│       ├── schemas/       # PostgreSQL migrations
│       ├── api/           # API routes
│       ├── ui/            # React pages
│       └── tests/         # Project tests
├── scripts/               # CLI tools
│   └── dg                 # Main CLI entry point
├── docker/                # Docker configurations
└── .claude/               # Claude Code configuration
    └── commands/          # Slash commands for agents
```

## Commands

### Docker Operations (ALWAYS use Docker for databases)

```bash
# Start project services (PostgreSQL, API, UI)
./scripts/dg <project> setup --migrate

# Check service status
./scripts/dg <project> status

# View logs
./scripts/dg <project> logs postgres -f
./scripts/dg <project> logs api -f

# Stop services (preserves data)
./scripts/dg <project> stop

# Complete teardown (destroys data)
./scripts/dg <project> teardown --force

# Direct Docker access
docker compose -f docker/docker-compose.yml --project-name datagoose-<project> ps
docker compose -f docker/docker-compose.yml --project-name datagoose-<project> exec postgres psql -U postgres
```

### Python ETL

```bash
# Activate virtual environment
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run ETL pipeline
python -m projects.<project>.etl.pipeline

# Run specific ETL module
python -m projects.<project>.etl.<module>

# Type checking
mypy projects/<project>/etl/

# Linting
ruff check projects/<project>/etl/
ruff format projects/<project>/etl/
```

### PostgreSQL Operations

```bash
# Connect to project database (via Docker)
docker compose -f docker/docker-compose.yml --project-name datagoose-<project> exec postgres psql -U postgres -d <project>

# Run migrations
./scripts/dg <project> migrate

# Export schema
docker compose exec postgres pg_dump -U postgres -s <project> > schema.sql

# COPY data efficiently
docker compose exec -T postgres psql -U postgres -d <project> -c "\COPY table FROM STDIN CSV HEADER" < data.csv
```

### Node.js/API

```bash
# Install dependencies
npm install

# Start API development server
npm run dev:api

# Build
npm run build

# Type checking
npm run typecheck

# Linting
npm run lint
```

### Testing

```bash
# Run all tests for a project
./scripts/dg <project> test all

# Python ETL tests
pytest projects/<project>/tests/ -v

# API tests (Jest)
npm run test:api

# UI tests (Vitest)
npm run test:ui

# E2E tests (Playwright)
npm run test:e2e
```

## Code Style

### Python

- Use type hints everywhere
- Docstrings for public functions (Google style)
- Snake_case for variables and functions
- PascalCase for classes
- Use `pathlib.Path` for file paths
- Prefer `polars` over `pandas` for large datasets (>100MB)
- Use context managers for file and database operations
- Logging over print statements

```python
# Good
def load_csv(path: Path, encoding: str = "utf-8") -> pl.DataFrame:
    """Load a CSV file into a Polars DataFrame.

    Args:
        path: Path to the CSV file.
        encoding: File encoding.

    Returns:
        DataFrame with the loaded data.
    """
    logger.info(f"Loading {path}")
    return pl.read_csv(path, encoding=encoding)

# Bad
def load_csv(p, enc="utf-8"):
    print(f"Loading {p}")
    return pd.read_csv(p, encoding=enc)
```

### TypeScript

- Strict mode enabled
- Explicit return types on functions
- Use interfaces over types when possible
- camelCase for variables/functions, PascalCase for types/classes
- Prefer `const` over `let`

```typescript
// Good
interface PowerPlant {
  id: string;
  name: string;
  capacity_mw: number;
}

const getPowerPlant = async (id: string): Promise<PowerPlant | null> => {
  const result = await db.query('SELECT * FROM power_plants WHERE id = $1', [id]);
  return result.rows[0] ?? null;
};

// Bad
const getPowerPlant = async (id) => {
  let result = await db.query('SELECT * FROM power_plants WHERE id = $1', [id]);
  return result.rows[0];
};
```

### SQL/PostgreSQL

- UPPERCASE for SQL keywords
- snake_case for table and column names
- Always use explicit column lists (no `SELECT *` in production code)
- Use CTEs for complex queries
- Add indexes for foreign keys and frequently queried columns
- Use `COPY` for bulk loading (not `INSERT`)

```sql
-- Good: Migration file
CREATE TABLE IF NOT EXISTS power_plants (
    id SERIAL PRIMARY KEY,
    gppd_idnr VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    capacity_mw NUMERIC(10, 2),
    country_code CHAR(3) NOT NULL,
    primary_fuel VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_power_plants_country ON power_plants(country_code);
CREATE INDEX idx_power_plants_fuel ON power_plants(primary_fuel);
```

## Deployed Projects

### IPEDS (https://ipeds.bkwaffles.com)

The IPEDS project is fully deployed and serves as a reference implementation:

- **Branch**: `projects/ipeds`
- **Server**: Digital Ocean droplet (bkwaffles.com, 204.48.22.228)
- **Stack**: nginx + systemd + Docker PostgreSQL
- **Database**: 44GB with pgvector, PostGIS, pg_trgm

Key features:
- 134M+ records spanning 1980-2024
- Vector similarity search for institutions
- Natural language to SQL queries (Claude-powered)
- Data dictionary with AI Q&A

See `projects/ipeds/CLAUDE.md` for detailed deployment docs.

## Git Workflow

### Branch Strategy

```
main                    # Framework only, always stable
├── projects/power-plants    # Power plants project
├── projects/ipeds           # IPEDS education data (DEPLOYED)
└── projects/<new-project>   # Each project gets its own branch
```

### Commit Messages

Format: `<type>(<scope>): <description>`

Types:
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `docs`: Documentation only
- `test`: Adding tests
- `chore`: Maintenance tasks

```bash
# Good commits
git commit -m "feat(ipeds): add download module for NCES data files"
git commit -m "fix(etl): handle missing values in enrollment data"
git commit -m "refactor(schema): normalize institution tables"

# Bad commits
git commit -m "updates"
git commit -m "fixed stuff"
```

### Workflow

1. Always work on project branches, not main
2. Pull latest changes before starting work
3. Commit frequently with meaningful messages
4. Push before ending session

```bash
# Starting work
git checkout projects/<project>
git pull origin projects/<project>

# During work
git add -A
git commit -m "feat(etl): implement data validation"

# Ending session
git push origin projects/<project>
```

## Boundaries - DO NOT MODIFY

### Protected Files

- `framework/**/*` - Core framework code (modify only with explicit permission)
- `.github/**/*` - CI/CD workflows
- `docker/docker-compose.yml` - Base Docker configuration (extend, don't modify)
- `package-lock.json` - Auto-generated
- `.venv/**/*` - Virtual environment

### Protected Patterns

- Never commit:
  - `.env` files with secrets
  - `*.pyc`, `__pycache__/`
  - `node_modules/`
  - Large binary files (use Git LFS for data files)
  - Credentials, API keys, passwords

### Git LFS

Large files (>1MB) should use Git LFS:

```bash
# Track patterns
git lfs track "projects/*/data/raw/*.zip"
git lfs track "projects/*/data/raw/*.csv"

# Check what's tracked
git lfs ls-files
```

## Data Migration Best Practices

### 0. ETL Tracking (CRITICAL)

**Always create and use ETL tracking tables for multi-file migrations:**

```sql
-- Create ETL tracking tables (do this FIRST for any new project)
CREATE TABLE IF NOT EXISTS etl_run (
    id SERIAL PRIMARY KEY,
    run_type TEXT NOT NULL,  -- 'raw_load', 'transform'
    data_year INTEGER NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'running',  -- 'running', 'completed', 'failed'
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS etl_table_log (
    id SERIAL PRIMARY KEY,
    run_id INTEGER REFERENCES etl_run(id),
    table_name TEXT NOT NULL,
    rows_affected INTEGER,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'running'
);
```

**Before loading ANY data, check what's already loaded:**
```sql
SELECT data_year, run_type, status, COUNT(*) FROM etl_run GROUP BY 1,2,3 ORDER BY 1;
SELECT table_name, SUM(rows_affected) FROM etl_table_log WHERE status='completed' GROUP BY 1;
```

**Why this matters:**
- Context windows end mid-session - tracking tables preserve state
- Multiple agents may work on the same project
- Prevents duplicate loads and wasted time
- Provides audit trail for data lineage

### 1. Source Analysis

Before any migration:
- Document source format (encoding, delimiters, date formats)
- Identify primary keys and relationships
- Check for data quality issues (nulls, duplicates, invalid values)
- Estimate data volume

### 2. Schema Design

- Start with 3NF, denormalize only for performance
- Use appropriate PostgreSQL types:
  - `TEXT` over `VARCHAR(n)` unless constraint needed
  - `NUMERIC` for money/precise decimals
  - `TIMESTAMPTZ` for dates with timezone
  - `JSONB` for semi-structured data
- Add constraints (NOT NULL, UNIQUE, CHECK, FK)
- Plan indexes based on query patterns

### 3. ETL Pipeline

Standard pipeline structure:

```python
class IPEDSPipeline:
    """ETL pipeline for IPEDS data."""

    def extract(self) -> pl.DataFrame:
        """Extract data from source files."""
        ...

    def transform(self, df: pl.DataFrame) -> pl.DataFrame:
        """Clean and transform data."""
        ...

    def load(self, df: pl.DataFrame) -> int:
        """Load data into PostgreSQL."""
        ...

    def run(self) -> None:
        """Execute full ETL pipeline."""
        data = self.extract()
        transformed = self.transform(data)
        count = self.load(transformed)
        logger.info(f"Loaded {count} records")
```

### 4. Data Validation

Always validate:
- Row counts match between source and destination
- Key columns have no unexpected nulls
- Foreign key relationships are valid
- Numeric ranges are reasonable
- Date formats parsed correctly

### 5. Documentation

Every project needs:
- `README.md` - Project overview, setup instructions
- `data/README.md` - Data dictionary, source descriptions
- `schemas/README.md` - Schema documentation, ER diagrams
- Inline comments for complex transformations

## Agent Specializations

Use the slash commands to invoke specialized agent modes:

| Command | Agent | Expertise |
|---------|-------|-----------|
| `/ingest` | Data Ingestor | Binary formats, encodings, file parsing |
| `/schema` | Schema Architect | PostgreSQL design, normalization, indexes |
| `/etl` | ETL Engineer | Python pipelines, transformations, loading |
| `/validate` | Data Validator | Quality checks, constraints, testing |
| `/docker` | Docker Ops | Containers, networking, volumes |
| `/docs` | Documentation | READMEs, data dictionaries, diagrams |

## Common Patterns

### Loading CSV into PostgreSQL

```python
import polars as pl
from pathlib import Path

def load_csv_to_postgres(
    csv_path: Path,
    table_name: str,
    conn_string: str,
) -> int:
    """Load CSV file into PostgreSQL table."""
    df = pl.read_csv(csv_path)

    # Clean column names
    df = df.rename({c: c.lower().replace(" ", "_") for c in df.columns})

    # Load via COPY
    df.write_database(
        table_name=table_name,
        connection=conn_string,
        if_table_exists="append",
    )

    return len(df)
```

### Handling Data Dictionaries

```python
def parse_data_dictionary(dict_path: Path) -> dict[str, dict]:
    """Parse IPEDS-style data dictionary file."""
    df = pl.read_csv(dict_path)

    return {
        row["varname"]: {
            "type": row["vartype"],
            "label": row["varlabel"],
            "values": row.get("values", {}),
        }
        for row in df.to_dicts()
    }
```

### Inferring PostgreSQL Types

```python
TYPE_MAPPING = {
    pl.Int64: "BIGINT",
    pl.Int32: "INTEGER",
    pl.Float64: "DOUBLE PRECISION",
    pl.Utf8: "TEXT",
    pl.Boolean: "BOOLEAN",
    pl.Date: "DATE",
    pl.Datetime: "TIMESTAMPTZ",
}

def infer_pg_schema(df: pl.DataFrame) -> str:
    """Generate CREATE TABLE statement from DataFrame."""
    columns = []
    for name, dtype in zip(df.columns, df.dtypes):
        pg_type = TYPE_MAPPING.get(dtype, "TEXT")
        columns.append(f"    {name.lower()} {pg_type}")

    return f"CREATE TABLE data (\n{',\n'.join(columns)}\n);"
```
