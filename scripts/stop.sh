#!/bin/bash
# Stop Services Script
# Stops all services but preserves data

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/utils.sh"

PROJECT="$1"
shift 2>/dev/null || true

validate_project "$PROJECT"

print_header "Stopping: $PROJECT"

# Get project config
POSTGRES_PORT=$(get_project_config "$PROJECT" "docker.postgresPort")
API_PORT=$(get_project_config "$PROJECT" "api.port")
UI_PORT=$(get_project_config "$PROJECT" "ui.port")
COMPOSE_PROJECT=$(get_compose_project "$PROJECT")

# Stop API
print_info "Stopping API..."
API_PID=$(get_pid "$PROJECT" "api")
if [ -n "$API_PID" ] && is_running "$API_PID"; then
    kill "$API_PID" 2>/dev/null || true
fi
kill_port "$API_PORT" 2>/dev/null || true
remove_pid "$PROJECT" "api"
print_success "API stopped"

# Stop UI
print_info "Stopping UI..."
UI_PID=$(get_pid "$PROJECT" "ui")
if [ -n "$UI_PID" ] && is_running "$UI_PID"; then
    kill "$UI_PID" 2>/dev/null || true
fi
kill_port "$UI_PORT" 2>/dev/null || true
remove_pid "$PROJECT" "ui"
print_success "UI stopped"

# Stop Docker services (but preserve volumes)
print_info "Stopping Docker services..."
cd "$ROOT_DIR/docker"
COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT" docker compose stop 2>/dev/null || true
print_success "Docker services stopped"

print_success "All services stopped"
echo ""
echo "Database data has been preserved."
echo "Use 'dg $PROJECT start' to restart services"
