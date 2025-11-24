#!/bin/bash
# Project Setup Script
# Initializes a project with all services

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/utils.sh"

PROJECT="$1"
shift

# Parse options
RUN_MIGRATE=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --migrate)
            RUN_MIGRATE=true
            shift
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

validate_project "$PROJECT"

print_header "Setting up: $PROJECT"

# Check prerequisites
check_docker

# Get project config
PROJECT_DIR="$PROJECTS_DIR/$PROJECT"
POSTGRES_PORT=$(get_project_config "$PROJECT" "docker.postgresPort")
API_PORT=$(get_project_config "$PROJECT" "api.port")
UI_PORT=$(get_project_config "$PROJECT" "ui.port")
COMPOSE_PROJECT=$(get_compose_project "$PROJECT")

print_info "Configuration:"
echo "  Project:       $PROJECT"
echo "  PostgreSQL:    port $POSTGRES_PORT"
echo "  API:           port $API_PORT"
echo "  UI:            port $UI_PORT"
echo "  Docker prefix: $COMPOSE_PROJECT"
echo ""

# Start services
print_info "Starting Docker services..."
cd "$ROOT_DIR/docker"
COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT" \
POSTGRES_PORT="$POSTGRES_PORT" \
docker compose up -d postgres

# Wait for postgres
print_info "Waiting for PostgreSQL..."
sleep 3

# Apply migrations
print_info "Applying database migrations..."
MIGRATION_FILE="$PROJECT_DIR/schemas/migrations/001_create_power_plants.sql"
if [ -f "$MIGRATION_FILE" ]; then
    PGPASSWORD=postgres psql -h localhost -p "$POSTGRES_PORT" -U postgres -d datagoose -f "$MIGRATION_FILE" 2>/dev/null || {
        print_warning "Migrations may have already been applied"
    }
    print_success "Database schema ready"
else
    print_warning "No migration file found"
fi

# Run ETL if requested
if [ "$RUN_MIGRATE" = true ]; then
    print_info "Running ETL migration..."
    "$SCRIPT_DIR/migrate.sh" "$PROJECT"
fi

# Start API
print_info "Starting API server..."
cd "$ROOT_DIR/src/api"
DATABASE_URL="postgresql://postgres:postgres@localhost:$POSTGRES_PORT/datagoose" \
PORT="$API_PORT" \
npm run dev > /dev/null 2>&1 &
API_PID=$!
save_pid "$PROJECT" "api" "$API_PID"

# Start UI
print_info "Starting UI..."
cd "$ROOT_DIR/src/ui"
VITE_API_URL="http://localhost:$API_PORT/api" \
npm run dev -- --port "$UI_PORT" > /dev/null 2>&1 &
UI_PID=$!
save_pid "$PROJECT" "ui" "$UI_PID"

# Wait for services
print_info "Waiting for services to start..."
sleep 3

print_success "Setup complete!"
echo ""
echo "Services:"
echo "  PostgreSQL: localhost:$POSTGRES_PORT"
echo "  API:        http://localhost:$API_PORT"
echo "  API Docs:   http://localhost:$API_PORT/api/docs"
echo "  UI:         http://localhost:$UI_PORT"
echo ""
echo "Use 'dg $PROJECT status' to check service health"
echo "Use 'dg $PROJECT teardown' to stop and clean up"
