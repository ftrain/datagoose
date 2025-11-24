#!/bin/bash
# Project Logs Script
# View logs from project services

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/utils.sh"

PROJECT="$1"
SERVICE="${2:-}"
shift 2 2>/dev/null || shift 2>/dev/null || true

# Parse options
FOLLOW=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        -f|--follow)
            FOLLOW=true
            shift
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

validate_project "$PROJECT"

COMPOSE_PROJECT=$(get_compose_project "$PROJECT")

case "$SERVICE" in
    db|postgres|postgresql)
        print_info "PostgreSQL logs:"
        cd "$ROOT_DIR/docker"
        if [ "$FOLLOW" = true ]; then
            COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT" docker compose logs -f postgres
        else
            COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT" docker compose logs --tail=100 postgres
        fi
        ;;
    api)
        print_info "API logs:"
        API_PID=$(get_pid "$PROJECT" "api")
        if [ -n "$API_PID" ] && is_running "$API_PID"; then
            # For development, API output goes to console
            print_warning "API runs in background. Check terminal or use 'dg $PROJECT start' interactively"
        else
            print_warning "API is not running"
        fi
        ;;
    ui)
        print_info "UI logs:"
        UI_PID=$(get_pid "$PROJECT" "ui")
        if [ -n "$UI_PID" ] && is_running "$UI_PID"; then
            print_warning "UI runs in background. Check terminal or use 'dg $PROJECT start' interactively"
        else
            print_warning "UI is not running"
        fi
        ;;
    "")
        # Show all Docker logs
        print_info "All Docker service logs:"
        cd "$ROOT_DIR/docker"
        if [ "$FOLLOW" = true ]; then
            COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT" docker compose logs -f
        else
            COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT" docker compose logs --tail=50
        fi
        ;;
    *)
        print_error "Unknown service: $SERVICE"
        echo "Available services: db, api, ui"
        exit 1
        ;;
esac
