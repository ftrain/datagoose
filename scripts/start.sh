#!/bin/bash
# Start Services Script
# Starts all services for a project

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/utils.sh"

PROJECT="$1"
shift 2>/dev/null || true

validate_project "$PROJECT"

print_header "Starting: $PROJECT"

# Check prerequisites
check_docker

# Get project config
POSTGRES_PORT=$(get_project_config "$PROJECT" "docker.postgresPort")
API_PORT=$(get_project_config "$PROJECT" "api.port")
UI_PORT=$(get_project_config "$PROJECT" "ui.port")
COMPOSE_PROJECT=$(get_compose_project "$PROJECT")

# Start PostgreSQL
print_info "Starting PostgreSQL..."
cd "$ROOT_DIR/docker"
COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT" \
POSTGRES_PORT="$POSTGRES_PORT" \
docker compose up -d postgres

# Wait for postgres
print_info "Waiting for PostgreSQL..."
sleep 2
if wait_for_port "$POSTGRES_PORT" 10; then
    print_success "PostgreSQL ready on port $POSTGRES_PORT"
else
    print_warning "PostgreSQL may not be ready"
fi

# Start API (if not already running)
if port_in_use "$API_PORT"; then
    print_info "API already running on port $API_PORT"
else
    print_info "Starting API server..."
    cd "$ROOT_DIR/src/api"
    DATABASE_URL="postgresql://postgres:postgres@localhost:$POSTGRES_PORT/datagoose" \
    PORT="$API_PORT" \
    npm run dev > /dev/null 2>&1 &
    API_PID=$!
    save_pid "$PROJECT" "api" "$API_PID"

    if wait_for_port "$API_PORT" 15; then
        print_success "API ready on port $API_PORT"
    else
        print_warning "API may not be ready"
    fi
fi

# Start UI (if not already running)
if port_in_use "$UI_PORT"; then
    print_info "UI already running on port $UI_PORT"
else
    print_info "Starting UI..."
    cd "$ROOT_DIR/src/ui"
    VITE_API_URL="http://localhost:$API_PORT/api" \
    npm run dev -- --port "$UI_PORT" > /dev/null 2>&1 &
    UI_PID=$!
    save_pid "$PROJECT" "ui" "$UI_PID"

    if wait_for_port "$UI_PORT" 15; then
        print_success "UI ready on port $UI_PORT"
    else
        print_warning "UI may not be ready"
    fi
fi

print_success "Services started!"
echo ""
echo "  PostgreSQL: localhost:$POSTGRES_PORT"
echo "  API:        http://localhost:$API_PORT"
echo "  Swagger:    http://localhost:$API_PORT/api/docs"
echo "  UI:         http://localhost:$UI_PORT"
