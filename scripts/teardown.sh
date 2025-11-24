#!/bin/bash
# Project Teardown Script
# Stops all services and cleans up resources

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/utils.sh"

PROJECT="$1"
shift 2>/dev/null || true

# Parse options
FORCE=false
KEEP_DATA=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --force|-f)
            FORCE=true
            shift
            ;;
        --keep-data)
            KEEP_DATA=true
            shift
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

validate_project "$PROJECT"

print_header "Tearing down: $PROJECT"

# Get project config
POSTGRES_PORT=$(get_project_config "$PROJECT" "docker.postgresPort")
API_PORT=$(get_project_config "$PROJECT" "api.port")
UI_PORT=$(get_project_config "$PROJECT" "ui.port")
COMPOSE_PROJECT=$(get_compose_project "$PROJECT")

# Confirmation
if [ "$FORCE" != true ]; then
    echo "This will:"
    echo "  - Stop API server (port $API_PORT)"
    echo "  - Stop UI server (port $UI_PORT)"
    echo "  - Stop PostgreSQL container (port $POSTGRES_PORT)"
    if [ "$KEEP_DATA" != true ]; then
        echo "  - Remove Docker volumes (database data)"
    fi
    echo "  - Remove Docker networks"
    echo "  - Clean PID files"
    echo ""
    read -p "Continue? [y/N] " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        print_info "Cancelled"
        exit 0
    fi
fi

# Stop API server
print_info "Stopping API server..."
API_PID=$(get_pid "$PROJECT" "api")
if [ -n "$API_PID" ] && is_running "$API_PID"; then
    kill "$API_PID" 2>/dev/null || true
fi
# Also kill by port in case PID changed
kill_port "$API_PORT" 2>/dev/null || true
remove_pid "$PROJECT" "api"
print_success "API stopped"

# Stop UI server
print_info "Stopping UI server..."
UI_PID=$(get_pid "$PROJECT" "ui")
if [ -n "$UI_PID" ] && is_running "$UI_PID"; then
    kill "$UI_PID" 2>/dev/null || true
fi
kill_port "$UI_PORT" 2>/dev/null || true
remove_pid "$PROJECT" "ui"
print_success "UI stopped"

# Kill any remaining node processes for this project
pkill -f "ts-node.*src/index" 2>/dev/null || true
pkill -f "vite.*$UI_PORT" 2>/dev/null || true

# Stop Docker containers
print_info "Stopping Docker containers..."
cd "$ROOT_DIR/docker"

if [ "$KEEP_DATA" = true ]; then
    COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT" docker compose down 2>/dev/null || true
else
    COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT" docker compose down -v 2>/dev/null || true
fi
print_success "Docker containers stopped"

# Remove networks
print_info "Removing Docker networks..."
docker network rm "${COMPOSE_PROJECT}_default" 2>/dev/null || true
print_success "Networks removed"

# Clean generated files
print_info "Cleaning generated files..."
rm -rf "$ROOT_DIR/src/api/dist" 2>/dev/null || true
rm -rf "$ROOT_DIR/src/ui/dist" 2>/dev/null || true
find "$ROOT_DIR" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "$ROOT_DIR" -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
print_success "Generated files cleaned"

# Remove PID directory
print_info "Cleaning PID files..."
rm -rf "$PID_DIR/$PROJECT" 2>/dev/null || true
print_success "PID files cleaned"

print_header "Teardown Complete"
echo "Project '$PROJECT' has been torn down."
if [ "$KEEP_DATA" = true ]; then
    echo "Database volume was preserved."
fi
echo ""
echo "To set up again: dg $PROJECT setup"
