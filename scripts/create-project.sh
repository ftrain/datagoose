#!/bin/bash
# Create New Project Script
# Scaffolds a new data migration project

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/utils.sh"

PROJECT_NAME="$1"

if [ -z "$PROJECT_NAME" ]; then
    print_error "Project name required"
    echo "Usage: dg create <project-name>"
    exit 1
fi

# Validate project name (lowercase, alphanumeric, hyphens)
if [[ ! "$PROJECT_NAME" =~ ^[a-z][a-z0-9-]*$ ]]; then
    print_error "Invalid project name: $PROJECT_NAME"
    echo "Project name must:"
    echo "  - Start with a lowercase letter"
    echo "  - Contain only lowercase letters, numbers, and hyphens"
    exit 1
fi

PROJECT_DIR="$PROJECTS_DIR/$PROJECT_NAME"

if [ -d "$PROJECT_DIR" ]; then
    print_error "Project '$PROJECT_NAME' already exists"
    exit 1
fi

print_header "Creating project: $PROJECT_NAME"

# Create directory structure
print_info "Creating directory structure..."
mkdir -p "$PROJECT_DIR"/{data/source,schemas/{migrations,rollback},etl,api/routes,ui/{pages,hooks},tests/{etl,api,ui,e2e,validation}}

# Create project config
print_info "Creating project configuration..."
cat > "$PROJECT_DIR/project.config.ts" << EOF
/**
 * $PROJECT_NAME Project Configuration
 */

export interface ProjectConfig {
  name: string;
  displayName: string;
  description: string;
  database: {
    name: string;
    migrations: string;
    rollback: string;
  };
  api: {
    basePath: string;
    routes: string;
    port: number;
  };
  ui: {
    title: string;
    pages: string;
    port: number;
  };
  etl: {
    pipeline: string;
    defaultSource: string;
    batchSize: number;
  };
  docker: {
    projectName: string;
    postgresPort: number;
  };
}

export const config: ProjectConfig = {
  name: '$PROJECT_NAME',
  displayName: '$(echo "$PROJECT_NAME" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1')',
  description: 'Data migration project',

  database: {
    name: 'datagoose_$PROJECT_NAME',
    migrations: './schemas/migrations',
    rollback: './schemas/rollback',
  },

  api: {
    basePath: '/api',
    routes: './api/routes',
    port: 3001,
  },

  ui: {
    title: 'Datagoose - $(echo "$PROJECT_NAME" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1')',
    pages: './ui/pages',
    port: 5174,
  },

  etl: {
    pipeline: './etl/pipeline.py',
    defaultSource: './data/source/*.csv',
    batchSize: 1000,
  },

  docker: {
    projectName: 'datagoose-$PROJECT_NAME',
    postgresPort: 5433,
  },
};

export default config;
EOF

# Create README
print_info "Creating README..."
cat > "$PROJECT_DIR/README.md" << EOF
# $PROJECT_NAME

A Datagoose data migration project.

## Quick Start

\`\`\`bash
# Setup and start services
./scripts/dg $PROJECT_NAME setup

# Run ETL migration
./scripts/dg $PROJECT_NAME migrate

# Check status
./scripts/dg $PROJECT_NAME status

# Teardown
./scripts/dg $PROJECT_NAME teardown
\`\`\`

## Project Structure

\`\`\`
$PROJECT_NAME/
├── project.config.ts       # Project configuration
├── data/
│   └── source/            # Source data files
├── schemas/
│   ├── migrations/        # SQL schema files
│   └── rollback/          # Rollback scripts
├── etl/
│   └── pipeline.py        # ETL pipeline
├── api/
│   └── routes/            # Express API routes
├── ui/
│   ├── pages/             # React pages
│   └── hooks/             # React hooks
└── tests/                 # Tests
\`\`\`

## Next Steps

1. Add your source data to \`data/source/\`
2. Create schema in \`schemas/migrations/001_create_tables.sql\`
3. Implement ETL in \`etl/pipeline.py\`
4. Create API routes in \`api/routes/\`
5. Build UI pages in \`ui/pages/\`
EOF

# Create template ETL pipeline
print_info "Creating ETL template..."
cat > "$PROJECT_DIR/etl/pipeline.py" << 'EOF'
#!/usr/bin/env python3
"""
ETL Pipeline for $PROJECT_NAME

Customize this template for your data migration.
"""

import os
import sys
import logging
import click
import pandas as pd

# Add framework to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', 'framework'))

from etl import BasePipeline, CSVExtractor, BaseTransformer, BaseLoader

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class DataTransformer(BaseTransformer):
    """Transform raw data for loading."""

    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Transform raw data.

        TODO: Implement your transformation logic here.
        """
        # Example transformation
        transformed = df.copy()
        self.stats["rows_transformed"] += len(transformed)
        return transformed


class DataLoader(BaseLoader):
    """Load data into PostgreSQL."""

    def load(self, df: pd.DataFrame) -> int:
        """
        Load data to target table.

        TODO: Implement your loading logic here.
        """
        if df.empty:
            return 0

        # Example: Define columns to load
        columns = list(df.columns)

        return self._bulk_insert(df, "your_table", columns)


class Pipeline(BasePipeline):
    """ETL Pipeline."""

    def __init__(self, source_path: str, batch_size: int = 1000):
        super().__init__(batch_size)
        self.source_path = source_path

    def get_extractor(self):
        from pathlib import Path
        return CSVExtractor(Path(self.source_path), self.batch_size)

    def get_transformers(self):
        return [DataTransformer()]

    def get_loaders(self):
        return [DataLoader(self.engine)]


@click.command()
@click.option("--source", "-s", required=True, help="Path to source data file")
@click.option("--batch-size", "-b", default=1000, help="Batch size")
@click.option("--dry-run", is_flag=True, help="Run without loading")
@click.option("--validate", is_flag=True, help="Validate after loading")
def main(source: str, batch_size: int, dry_run: bool, validate: bool):
    """Run the ETL pipeline."""
    pipeline = Pipeline(source, batch_size)

    try:
        stats = pipeline.run(dry_run=dry_run)
        click.echo(f"\nMigration Stats: {stats}")

        if validate and not dry_run:
            validation = pipeline.validate()
            click.echo(f"\nValidation Results: {validation}")

    except Exception as e:
        logger.error(f"Migration failed: {e}")
        raise


if __name__ == "__main__":
    main()
EOF

# Create template migration
print_info "Creating schema template..."
cat > "$PROJECT_DIR/schemas/migrations/001_create_tables.sql" << EOF
-- $PROJECT_NAME Schema
-- Created: $(date +%Y-%m-%d)

-- Example table (customize for your data)
CREATE TABLE IF NOT EXISTS your_table (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes as needed
-- CREATE INDEX idx_your_table_name ON your_table(name);
EOF

cat > "$PROJECT_DIR/schemas/rollback/001_rollback.sql" << EOF
-- Rollback for $PROJECT_NAME
DROP TABLE IF EXISTS your_table CASCADE;
EOF

# Create .gitkeep files
touch "$PROJECT_DIR/data/source/.gitkeep"
touch "$PROJECT_DIR/api/routes/.gitkeep"
touch "$PROJECT_DIR/ui/pages/.gitkeep"
touch "$PROJECT_DIR/ui/hooks/.gitkeep"
touch "$PROJECT_DIR/tests/etl/.gitkeep"
touch "$PROJECT_DIR/tests/api/.gitkeep"
touch "$PROJECT_DIR/tests/ui/.gitkeep"
touch "$PROJECT_DIR/tests/e2e/.gitkeep"

print_success "Project '$PROJECT_NAME' created!"
echo ""
echo "Next steps:"
echo "  1. cd $PROJECT_DIR"
echo "  2. Add your source data to data/source/"
echo "  3. Edit schemas/migrations/001_create_tables.sql"
echo "  4. Customize etl/pipeline.py"
echo "  5. Run: dg $PROJECT_NAME setup --migrate"
