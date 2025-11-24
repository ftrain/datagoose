#!/bin/bash
# ETL Migration Script
# Runs the ETL pipeline for a project

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/utils.sh"

PROJECT="$1"
shift 2>/dev/null || true

validate_project "$PROJECT"

print_header "Running ETL: $PROJECT"

# Get project config
PROJECT_DIR="$PROJECTS_DIR/$PROJECT"
POSTGRES_PORT=$(get_project_config "$PROJECT" "docker.postgresPort")

# Find ETL script
ETL_SCRIPT="$PROJECT_DIR/etl/migrate_power_plants.py"
if [ ! -f "$ETL_SCRIPT" ]; then
    # Try generic name
    ETL_SCRIPT=$(find "$PROJECT_DIR/etl" -name "migrate*.py" -o -name "etl*.py" 2>/dev/null | head -1)
fi

if [ -z "$ETL_SCRIPT" ] || [ ! -f "$ETL_SCRIPT" ]; then
    print_error "No ETL script found in $PROJECT_DIR/etl/"
    exit 1
fi

# Find source data
SOURCE_FILE="$PROJECT_DIR/data/source/global_power_plant_database.csv"
if [ ! -f "$SOURCE_FILE" ]; then
    SOURCE_FILE=$(find "$PROJECT_DIR/data/source" -name "*.csv" 2>/dev/null | head -1)
fi

if [ -z "$SOURCE_FILE" ] || [ ! -f "$SOURCE_FILE" ]; then
    print_error "No source CSV found in $PROJECT_DIR/data/source/"
    print_info "Download the data and place it in $PROJECT_DIR/data/source/"
    exit 1
fi

print_info "ETL Script: $ETL_SCRIPT"
print_info "Source: $SOURCE_FILE"
print_info "Database: localhost:$POSTGRES_PORT"
echo ""

# Activate virtual environment if it exists
if [ -d "$ROOT_DIR/.venv" ]; then
    source "$ROOT_DIR/.venv/bin/activate"
fi

# Run ETL
DATABASE_URL="postgresql://postgres:postgres@localhost:$POSTGRES_PORT/datagoose" \
python3 "$ETL_SCRIPT" --source "$SOURCE_FILE" --validate

print_success "ETL migration complete"
