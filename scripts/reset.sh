#!/bin/bash
# Reset Database Script
# Drops and recreates the database

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/utils.sh"

PROJECT="$1"
shift 2>/dev/null || true

# Parse options
FORCE=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --force|-f)
            FORCE=true
            shift
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

validate_project "$PROJECT"

print_header "Resetting database: $PROJECT"

# Confirmation
if [ "$FORCE" != true ]; then
    print_warning "This will delete all data in the database!"
    read -p "Are you sure? [y/N] " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        print_info "Cancelled"
        exit 0
    fi
fi

# Get project config
PROJECT_DIR="$PROJECTS_DIR/$PROJECT"
POSTGRES_PORT=$(get_project_config "$PROJECT" "docker.postgresPort")
COMPOSE_PROJECT=$(get_compose_project "$PROJECT")

# Check if database is running
if ! port_in_use "$POSTGRES_PORT"; then
    print_error "Database is not running on port $POSTGRES_PORT"
    print_info "Start the database first with: dg $PROJECT start"
    exit 1
fi

# Apply rollback script if it exists
ROLLBACK_FILE="$PROJECT_DIR/schemas/rollback/001_rollback.sql"
if [ -f "$ROLLBACK_FILE" ]; then
    print_info "Running rollback script..."
    PGPASSWORD=postgres psql -h localhost -p "$POSTGRES_PORT" -U postgres -d datagoose -f "$ROLLBACK_FILE" 2>/dev/null || true
fi

# Apply migrations
MIGRATION_FILE="$PROJECT_DIR/schemas/migrations/001_create_power_plants.sql"
if [ -f "$MIGRATION_FILE" ]; then
    print_info "Applying migrations..."
    PGPASSWORD=postgres psql -h localhost -p "$POSTGRES_PORT" -U postgres -d datagoose -f "$MIGRATION_FILE"
    print_success "Database schema recreated"
else
    print_warning "No migration file found"
fi

print_success "Database reset complete"
echo ""
echo "Run 'dg $PROJECT migrate' to reload data"
